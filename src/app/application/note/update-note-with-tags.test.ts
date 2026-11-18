import { describe, expect, mock, test } from "bun:test";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { isNoteProcessing } from "./is-note-processing";
import { updateNoteWithTags } from "./update-note-with-tags";

// Saving must return before background tagging and S3 cleanup finish. These tests
// also guard against overlapping saves and cleanup that never runs.

function makeNote(id: number, body: string): Note {
  return { id, title: "t", body, createdAt: 0, updatedAt: 0 };
}

// Opposite vectors make every score negative. The cutoff score >= maxScore * 0.5
// then rejects all candidates, so these tests do not need a tag creation path.
function makeEmbeddingProvider(): IEmbeddingProvider {
  return {
    load: async () => {},
    embedNote: async () => new Float32Array([1, 0]),
    embedTag: async () => new Float32Array([-1, 0]),
    buildTagCache: async () => {},
  };
}

function makeNoteRepo(oldBody: string, newBody: string): INoteRepository {
  return {
    findById: async (id: number) => makeNote(id, oldBody),
    update: async (id: number) => makeNote(id, newBody),
    // No old tags means no orphan cleanup here; note.test.ts covers that behavior.
    findTagsByNoteId: async () => [],
  } as unknown as INoteRepository;
}

function makeTagRepo(): ITagRepository {
  return {
    unlinkAllByNoteId: async () => {},
    findAll: async () => [],
  } as unknown as ITagRepository;
}

// Assertions need the final background state; the test timeout catches jobs that never finish.
async function waitForBackground(id: number) {
  while (isNoteProcessing(id)) await Bun.sleep(1);
}

describe("updateNoteWithTags background processing", () => {
  test("returns the update and sets the processing flag before tagging finishes", async () => {
    // Holding inference makes an early response deterministic rather than dependent on timing.
    let releaseEmbedding: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseEmbedding = resolve;
    });
    const embeddingProvider: IEmbeddingProvider = {
      load: async () => {},
      embedNote: async () => {
        await gate;
        return new Float32Array([1, 0]);
      },
      embedTag: async () => new Float32Array([-1, 0]),
      buildTagCache: async () => {},
    };
    const unlinkSpy = mock((_id: number) => Promise.resolve());
    const tagRepo = { unlinkAllByNoteId: unlinkSpy, findAll: async () => [] } as unknown as ITagRepository;
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

    const note = await updateNoteWithTags(
      makeNoteRepo("旧本文", "新本文"),
      tagRepo,
      embeddingProvider,
      storageProvider,
      10,
      "t",
      "新本文",
    );

    // The save must return and remain marked as processing while inference is blocked.
    expect(note).not.toBe("processing");
    expect((note as Note).body).toBe("新本文");
    expect(isNoteProcessing(10)).toBe(true);
    expect(unlinkSpy).not.toHaveBeenCalled();

    releaseEmbedding();
    await waitForBackground(10);
    expect(unlinkSpy).toHaveBeenCalledWith(10);
  });

  test("returns processing for overlapping updates", async () => {
    let releaseEmbedding: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseEmbedding = resolve;
    });
    const embeddingProvider: IEmbeddingProvider = {
      load: async () => {},
      embedNote: async () => {
        await gate;
        return new Float32Array([1, 0]);
      },
      embedTag: async () => new Float32Array([-1, 0]),
      buildTagCache: async () => {},
    };
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;
    const noteRepo = makeNoteRepo("旧本文", "新本文");

    const first = await updateNoteWithTags(
      noteRepo,
      makeTagRepo(),
      embeddingProvider,
      storageProvider,
      11,
      "t",
      "新本文",
    );
    const second = await updateNoteWithTags(
      noteRepo,
      makeTagRepo(),
      embeddingProvider,
      storageProvider,
      11,
      "t",
      "別の本文",
    );

    expect(first).not.toBe("processing");
    expect(second).toBe("processing");

    releaseEmbedding();
    await waitForBackground(11);
  });

  test("returns null and releases the lock for a missing note", async () => {
    const noteRepo = {
      findById: async () => null,
      findTagsByNoteId: async () => [],
      update: async () => null,
    } as unknown as INoteRepository;
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

    const result = await updateNoteWithTags(
      noteRepo,
      makeTagRepo(),
      makeEmbeddingProvider(),
      storageProvider,
      12,
      "t",
      "本文",
    );

    expect(result).toBeNull();
    // A later save must proceed once the processing lock is released.
    expect(isNoteProcessing(12)).toBe(false);
  });

  test("releases the lock even when the background job fails", async () => {
    const embeddingProvider: IEmbeddingProvider = {
      load: async () => {},
      embedNote: async () => {
        throw new Error("embedding backend down");
      },
      embedTag: async () => new Float32Array([-1, 0]),
      buildTagCache: async () => {},
    };
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

    const note = await updateNoteWithTags(
      makeNoteRepo("旧本文", "新本文"),
      makeTagRepo(),
      embeddingProvider,
      storageProvider,
      13,
      "t",
      "新本文",
    );

    // A background failure must not undo the successful body update.
    expect(note).not.toBe("processing");
    expect((note as Note).body).toBe("新本文");
    await waitForBackground(13);
    expect(isNoteProcessing(13)).toBe(false);
  });
});

describe("updateNoteWithTags tag preservation", () => {
  test.each(["note", "title", "cache", "tag"] as const)(
    "preserves existing tags without cleanup when %s inference fails",
    async (failure) => {
      let noteCalls = 0;
      const embeddingProvider: IEmbeddingProvider = {
        load: async () => {},
        embedNote: async () => {
          noteCalls++;
          if (failure === "note" || (failure === "title" && noteCalls === 2)) {
            throw new Error("embedding backend down");
          }
          return new Float32Array([1, 0]);
        },
        buildTagCache: async () => {
          if (failure === "cache") throw new Error("tag cache failed");
        },
        embedTag: async () => {
          if (failure === "tag") throw new Error("tag embedding failed");
          return new Float32Array([1, 0]);
        },
      };
      const unlinkSpy = mock(async () => {});
      const orphanSpy = mock(async () => {});
      const linkSpy = mock(async () => {});
      const tagRepo = {
        findAll: async () => [{ id: 1, name: "typescript" }],
        unlinkAllByNoteId: unlinkSpy,
        linkManyToNote: linkSpy,
        findByName: async () => ({ id: 1, name: "typescript" }),
        deleteIfOrphan: orphanSpy,
      } as unknown as ITagRepository;
      const noteRepo = {
        ...makeNoteRepo("旧本文", "新本文"),
        findTagsByNoteId: async () => ["typescript"],
      };
      const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

      const note = await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 14, "t", "新本文");
      expect((note as Note).body).toBe("新本文");
      await waitForBackground(14);
      expect(unlinkSpy).not.toHaveBeenCalled();
      expect(linkSpy).not.toHaveBeenCalled();
      expect(orphanSpy).not.toHaveBeenCalled();
      expect(isNoteProcessing(14)).toBe(false);
    },
  );
});

describe("updateNoteWithTags file cleanup", () => {
  test("deletes file keys removed from the body", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/old.png)", "![](/api/files/new.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/new.png)");
    // Storage assertions must wait for background cleanup to finish.
    await waitForBackground(1);

    expect(deleteSpy).toHaveBeenCalledWith("old.png");
    expect(deleteSpy).not.toHaveBeenCalledWith("new.png");
  });

  test("preserves file keys referenced by both the old and new body", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/keep.png)", "![](/api/files/keep.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/keep.png)");
    await waitForBackground(1);

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
