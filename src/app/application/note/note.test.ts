import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../config";
import { createNoteRepository, createStorageProvider, createTagRepository } from "../../infrastructure/container";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { finishNoteProcessing, markNoteProcessing } from "./_processing-notes";
import { createNote } from "./create-note";
import { deleteNote } from "./delete-note";
import { downloadNote } from "./download-note";
import { getNote } from "./get-note";
import { getNoteTags } from "./get-note-tags";
import { isNoteProcessing } from "./is-note-processing";
import { updateNote } from "./update-note";
import { updateNoteWithTags } from "./update-note-with-tags";

// Opposite note and tag vectors make every score negative, so the relative cutoff
// rejects all candidates. This deterministically removes every old tag after an update.
const noTagEmbeddingProvider: IEmbeddingProvider = {
  load: async () => {},
  embedNote: async () => new Float32Array([1, 0]),
  embedTag: async () => new Float32Array([-1, 0]),
  buildTagCache: async () => {},
};

const config = loadConfig();
const noteRepository = createNoteRepository(config);
const tagRepository = createTagRepository(config);
const storageProvider = createStorageProvider(config);

describe("note use cases", () => {
  test("createNote creates a note", async () => {
    const note = await createNote(noteRepository, "テストタイトル", "テスト本文");
    expect(note.id).toBeGreaterThan(0);
    expect(note.title).toBe("テストタイトル");
    expect(note.body).toBe("テスト本文");
  });

  test("uses the first 30 body characters when the title is empty", async () => {
    const note = await createNote(
      noteRepository,
      "",
      "これは自動タイトルのテストです。本文が長い場合は切り詰められます。",
    );
    expect(note.title).toBe("これは自動タイトルのテストです。本文が長い場合は切り詰められ");
  });

  test("getNote retrieves a saved note", async () => {
    const created = await createNote(noteRepository, "取得テスト", "本文");
    const fetched = await getNote(noteRepository, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("取得テスト");
  });

  test("returns null for a missing note ID", async () => {
    expect(await getNote(noteRepository, 99999)).toBeNull();
  });

  test("updateNote updates a note", async () => {
    const note = await createNote(noteRepository, "更新前", "本文");
    const updated = await updateNote(noteRepository, note.id, "更新後", "新しい本文");
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("更新後");
    expect(updated?.body).toBe("新しい本文");
  });

  test("deleteNote deletes a note", async () => {
    const note = await createNote(noteRepository, "削除対象", "本文");
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe(true);
    expect(await getNote(noteRepository, note.id)).toBeNull();
  });

  test("deleteNote returns false for a missing note ID", async () => {
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, 99999)).toBe(false);
  });

  test("listNotes supports pagination", async () => {
    const result = await noteRepository.list();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  test("downloadNote returns the body and a sanitized filename", async () => {
    const note = await createNote(noteRepository, "設計/実装メモ", "# 本文\n\nそのまま返ること。");
    const result = await downloadNote(noteRepository, note.id);
    expect(result).not.toBeNull();
    // Slashes must be replaced because they are path separators rather than filename characters.
    expect(result?.filename).toBe("設計-実装メモ.md");
    expect(result?.body).toBe("# 本文\n\nそのまま返ること。");
  });

  test("downloadNote returns null for a missing note ID", async () => {
    expect(await downloadNote(noteRepository, 99999)).toBeNull();
  });

  test("the processing registry tracks active notes", () => {
    // The processing flag must only remain set while background tagging is running.
    expect(isNoteProcessing(123)).toBe(false);
    markNoteProcessing(123);
    expect(isNoteProcessing(123)).toBe(true);
    finishNoteProcessing(123);
    expect(isNoteProcessing(123)).toBe(false);
  });

  test("deleteNote returns processing while a note is being tagged", async () => {
    // Deletion must not race with background tagging.
    const note = await createNote(noteRepository, "処理中削除ガード", "本文");
    markNoteProcessing(note.id);
    try {
      expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe("processing");
      // Rejecting the operation must leave the stored note intact.
      expect(await getNote(noteRepository, note.id)).not.toBeNull();
    } finally {
      finishNoteProcessing(note.id);
    }
    // Finishing background work must restore normal deletion.
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe(true);
  });

  test("adds and retrieves note tags", async () => {
    const note = await createNote(noteRepository, "タグテスト", "本文");
    await addTagsToNote(tagRepository, note.id, ["TypeScript", "テスト"]);
    const tags = await getNoteTags(noteRepository, note.id);
    expect(tags).toContain("typescript");
    expect(tags).toContain("テスト");
  });

  test("updateNoteWithTags removes old tags when no note still references them", async () => {
    // Removing a note-tag link must also remove the tag if no other note uses it.
    const note = await createNote(noteRepository, "orphan 掃除テスト", "本文");
    await addTagsToNote(tagRepository, note.id, ["編集前だけのタグ"]);

    await updateNoteWithTags(
      noteRepository,
      tagRepository,
      noTagEmbeddingProvider,
      storageProvider,
      note.id,
      "更新後",
      "新しい本文",
    );
    // Background tagging must finish before the final tag state can be asserted.
    while (isNoteProcessing(note.id)) await Bun.sleep(1);

    expect(await getNoteTags(noteRepository, note.id)).toEqual([]);
    expect(await tagRepository.findByName("編集前だけのタグ")).toBeNull();
  });

  test("updateNoteWithTags preserves old tags referenced by another note", async () => {
    const edited = await createNote(noteRepository, "編集するノート", "本文");
    const other = await createNote(noteRepository, "使い続けるノート", "本文");
    await addTagsToNote(tagRepository, edited.id, ["共有中のタグ"]);
    await addTagsToNote(tagRepository, other.id, ["共有中のタグ"]);

    await updateNoteWithTags(
      noteRepository,
      tagRepository,
      noTagEmbeddingProvider,
      storageProvider,
      edited.id,
      "更新後",
      "新しい本文",
    );
    // Background tagging must finish before the final tag state can be asserted.
    while (isNoteProcessing(edited.id)) await Bun.sleep(1);

    expect(await getNoteTags(noteRepository, edited.id)).toEqual([]);
    expect(await tagRepository.findByName("共有中のタグ")).not.toBeNull();
  });

  test("preserves saved text and old tags after inference failure, then retags on retry", async () => {
    const note = await createNote(noteRepository, "障害時のタグ保持", "本文");
    await addTagsToNote(tagRepository, note.id, ["障害時に残すタグ"]);
    const unavailableEmbeddingProvider: IEmbeddingProvider = {
      ...noTagEmbeddingProvider,
      embedNote: async () => {
        throw new Error("embedding backend unavailable");
      },
    };

    await updateNoteWithTags(
      noteRepository,
      tagRepository,
      unavailableEmbeddingProvider,
      storageProvider,
      note.id,
      "保存済み",
      "更新された本文",
    );
    while (isNoteProcessing(note.id)) await Bun.sleep(1);

    expect((await getNote(noteRepository, note.id))?.body).toBe("更新された本文");
    expect(await getNoteTags(noteRepository, note.id)).toEqual(["障害時に残すタグ"]);
    expect(await tagRepository.findByName("障害時に残すタグ")).not.toBeNull();

    // A successful empty suggestion must still replace old tags and remove orphans.
    const retry = await updateNoteWithTags(
      noteRepository,
      tagRepository,
      noTagEmbeddingProvider,
      storageProvider,
      note.id,
      "再保存",
      "更新された本文",
    );
    expect(retry).not.toBe("processing");
    while (isNoteProcessing(note.id)) await Bun.sleep(1);
    expect(await getNoteTags(noteRepository, note.id)).toEqual([]);
    expect(await tagRepository.findByName("障害時に残すタグ")).toBeNull();
  });
});
