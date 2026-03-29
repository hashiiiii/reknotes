import { describe, expect, test } from "bun:test";
import { createNote, deleteNote, getNote, getNoteTags, listNotes, updateNote } from "./note-service";
import { addTagsToNote } from "./tag-service";

describe("note-service", () => {
  test("createNote でノートを作成できる", async () => {
    const note = await createNote("テストタイトル", "テスト本文");
    expect(note.id).toBeGreaterThan(0);
    expect(note.title).toBe("テストタイトル");
    expect(note.body).toBe("テスト本文");
  });

  test("タイトル空欄なら本文先頭30文字が自動タイトルになる", async () => {
    const note = await createNote("", "これは自動タイトルのテストです。本文が長い場合は切り詰められます。");
    expect(note.title).toBe("これは自動タイトルのテストです。本文が長い場合は切り詰められ");
  });

  test("getNote で取得できる", async () => {
    const created = await createNote("取得テスト", "本文");
    const fetched = await getNote(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("取得テスト");
  });

  test("存在しないIDはnullを返す", async () => {
    expect(await getNote(99999)).toBeNull();
  });

  test("updateNote でノートを更新できる", async () => {
    const note = await createNote("更新前", "本文");
    const updated = await updateNote(note.id, "更新後", "新しい本文");
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("更新後");
    expect(updated?.body).toBe("新しい本文");
  });

  test("deleteNote でノートを削除できる", async () => {
    const note = await createNote("削除対象", "本文");
    expect(await deleteNote(note.id)).toBe(true);
    expect(await getNote(note.id)).toBeNull();
  });

  test("deleteNote で存在しないIDはfalseを返す", async () => {
    expect(await deleteNote(99999)).toBe(false);
  });

  test("listNotes でページネーションが動作する", async () => {
    const result = await listNotes();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  test("タグの追加と取得ができる", async () => {
    const note = await createNote("タグテスト", "本文");
    await addTagsToNote(note.id, ["TypeScript", "テスト"]);
    const tags = await getNoteTags(note.id);
    expect(tags).toContain("typescript");
    expect(tags).toContain("テスト");
  });
});
