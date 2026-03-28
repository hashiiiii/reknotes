import { describe, expect, test } from "bun:test";
import { createNote, deleteNote, getNote, getNoteTags, listNotes, updateNote } from "./note-service";
import { addTagsToNote } from "./tag-service";

describe("note-service", () => {
  test("createNote でノートを作成できる", () => {
    const note = createNote("テストタイトル", "テスト本文");
    expect(note.id).toBeGreaterThan(0);
    expect(note.title).toBe("テストタイトル");
    expect(note.body).toBe("テスト本文");
  });

  test("タイトル空欄なら本文先頭30文字が自動タイトルになる", () => {
    const note = createNote("", "これは自動タイトルのテストです。本文が長い場合は切り詰められます。");
    expect(note.title).toBe("これは自動タイトルのテストです。本文が長い場合は切り詰められ");
  });

  test("getNote で取得できる", () => {
    const created = createNote("取得テスト", "本文");
    const fetched = getNote(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("取得テスト");
  });

  test("存在しないIDはnullを返す", () => {
    expect(getNote(99999)).toBeNull();
  });

  test("updateNote でノートを更新できる", () => {
    const note = createNote("更新前", "本文");
    const updated = updateNote(note.id, "更新後", "新しい本文");
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("更新後");
    expect(updated?.body).toBe("新しい本文");
  });

  test("deleteNote でノートを削除できる", () => {
    const note = createNote("削除対象", "本文");
    expect(deleteNote(note.id)).toBe(true);
    expect(getNote(note.id)).toBeNull();
  });

  test("deleteNote で存在しないIDはfalseを返す", () => {
    expect(deleteNote(99999)).toBe(false);
  });

  test("listNotes でページネーションが動作する", () => {
    const result = listNotes();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  test("タグの追加と取得ができる", () => {
    const note = createNote("タグテスト", "本文");
    addTagsToNote(note.id, ["TypeScript", "テスト"]);
    const tags = getNoteTags(note.id);
    expect(tags).toContain("typescript");
    expect(tags).toContain("テスト");
  });
});
