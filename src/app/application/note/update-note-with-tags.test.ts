import { describe, expect, mock, test } from "bun:test";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { isNoteProcessing } from "./is-note-processing";
import { updateNoteWithTags } from "./update-note-with-tags";

// updateNoteWithTags は DB 行更新だけを同期で行い、タグ再生成と掃除 (S3 の orphan 削除を含む)
// はバックグラウンドに回す。ここでは「即返すこと」「再入を拒否すること」「バックグラウンドの
// 掃除が最終的に走ること」を検証する。

function makeNote(id: number, body: string): Note {
  return { id, title: "t", body, createdAt: 0, updatedAt: 0 };
}

// embedNote と embedTag に逆向きベクトルを返させ、全候補のスコアを負にする。
// suggestTags の相対閾値 (score >= maxScore * 0.5) は maxScore が負だと全候補を弾くため、
// タグが一つも生成されず addTagsToNote が走らない。これで findOrCreateMany 等の stub が不要になる。
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
    // 旧タグなし = orphan 掃除の経路は走らない。掃除自体の検証は note.test.ts で行う
    findTagsByNoteId: async () => [],
  } as unknown as INoteRepository;
}

function makeTagRepo(): ITagRepository {
  return {
    unlinkAllByNoteId: async () => {},
    findAll: async () => [],
  } as unknown as ITagRepository;
}

// バックグラウンドジョブの完了 (processing 解除) をポーリングで待つ。
// ジョブがハングした場合は bun test のタイムアウトが検知する。
async function waitForBackground(id: number) {
  while (isNoteProcessing(id)) await Bun.sleep(1);
}

describe("updateNoteWithTags の非同期化", () => {
  test("タグ付け完了を待たずに更新結果を返し、処理中フラグが立つ", async () => {
    // embedNote を手動で解放するまでブロックさせ、「タグ付けが終わる前に返る」ことを決定的に検証する
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

    // embedNote がブロックされたままでも更新結果が返り、処理中フラグが立っている
    expect(note).not.toBe("processing");
    expect((note as Note).body).toBe("新本文");
    expect(isNoteProcessing(10)).toBe(true);

    releaseEmbedding();
    await waitForBackground(10);
    expect(unlinkSpy).toHaveBeenCalledWith(10);
  });

  test("処理中の再入は processing を返す", async () => {
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

  test("存在しないノートは null を返しロックを解除する", async () => {
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
    // ロックが解除されていれば、後続の更新は "processing" にならない
    expect(isNoteProcessing(12)).toBe(false);
  });

  test("バックグラウンドジョブが失敗してもロックは解除される", async () => {
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

    // 本文の更新は成功したまま返り、失敗はバックグラウンドでログされるだけ
    expect(note).not.toBe("processing");
    expect((note as Note).body).toBe("新本文");
    await waitForBackground(13);
    expect(isNoteProcessing(13)).toBe(false);
  });
});

describe("updateNoteWithTags のファイルクリーンアップ", () => {
  test("旧本文にあって新本文にないキーは削除される", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/old.png)", "![](/api/files/new.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/new.png)");
    // S3 掃除はバックグラウンドに移ったので、完了を待ってから観測する
    await waitForBackground(1);

    expect(deleteSpy).toHaveBeenCalledWith("old.png");
    expect(deleteSpy).not.toHaveBeenCalledWith("new.png");
  });

  test("旧本文と新本文が同じキーを参照する場合は削除しない", async () => {
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
