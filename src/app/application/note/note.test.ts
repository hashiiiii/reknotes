import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../config";
import { createNoteRepository, createStorageProvider, createTagRepository } from "../../infrastructure/container";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { createNote } from "./create-note";
import { deleteNote } from "./delete-note";
import { getNote } from "./get-note";
import { getNoteTags } from "./get-note-tags";
import { updateNote } from "./update-note";

const config = loadConfig();
const noteRepository = createNoteRepository(config);
const tagRepository = createTagRepository(config);
const storageProvider = createStorageProvider(config);

describe("note use cases", () => {
  test("createNote でノートを作成できる", async () => {
    const note = await createNote(noteRepository, "テストタイトル", "テスト本文");
    expect(note.id).toBeGreaterThan(0);
    expect(note.title).toBe("テストタイトル");
    expect(note.body).toBe("テスト本文");
  });

  test("タイトル空欄なら本文先頭30文字が自動タイトルになる", async () => {
    const note = await createNote(
      noteRepository,
      "",
      "これは自動タイトルのテストです。本文が長い場合は切り詰められます。",
    );
    expect(note.title).toBe("これは自動タイトルのテストです。本文が長い場合は切り詰められ");
  });

  test("getNote で取得できる", async () => {
    const created = await createNote(noteRepository, "取得テスト", "本文");
    const fetched = await getNote(noteRepository, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("取得テスト");
  });

  test("存在しないIDはnullを返す", async () => {
    expect(await getNote(noteRepository, 99999)).toBeNull();
  });

  test("updateNote でノートを更新できる", async () => {
    const note = await createNote(noteRepository, "更新前", "本文");
    const updated = await updateNote(noteRepository, note.id, "更新後", "新しい本文");
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("更新後");
    expect(updated?.body).toBe("新しい本文");
  });

  test("deleteNote でノートを削除できる", async () => {
    const note = await createNote(noteRepository, "削除対象", "本文");
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe(true);
    expect(await getNote(noteRepository, note.id)).toBeNull();
  });

  test("deleteNote で存在しないIDはfalseを返す", async () => {
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, 99999)).toBe(false);
  });

  test("listNotes でページネーションが動作する", async () => {
    const result = await noteRepository.list();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  test("タグの追加と取得ができる", async () => {
    const note = await createNote(noteRepository, "タグテスト", "本文");
    await addTagsToNote(tagRepository, note.id, ["TypeScript", "テスト"]);
    const tags = await getNoteTags(noteRepository, note.id);
    expect(tags).toContain("typescript");
    expect(tags).toContain("テスト");
  });
});
