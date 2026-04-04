import { describe, expect, test } from "bun:test";
import { noteRepository } from "../../infrastructure/container";
import { createNote } from "../note/create-note";
import { searchNotes } from "./search-notes";

describe("search use cases", () => {
  test("タイトルで検索できる", async () => {
    const unique = `search-title-${Date.now()}`;
    await createNote(noteRepository, unique, "本文");
    const results = await searchNotes(noteRepository, unique);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toContain(unique);
  });

  test("本文で検索できる", async () => {
    const unique = `search-body-${Date.now()}`;
    await createNote(noteRepository, "検索テスト", unique);
    const results = await searchNotes(noteRepository, unique);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test("空クエリは空配列を返す", async () => {
    const results = await searchNotes(noteRepository, "");
    expect(results).toEqual([]);
  });

  test("空白のみのクエリは空配列を返す", async () => {
    const results = await searchNotes(noteRepository, "   ");
    expect(results).toEqual([]);
  });

  test("検索結果にハイライトが含まれる", async () => {
    const unique = `highlight-${Date.now()}`;
    await createNote(noteRepository, unique, "本文テスト");
    const results = await searchNotes(noteRepository, unique);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].highlightedTitle).toContain("<mark>");
  });

  test("存在しないキーワードは空配列を返す", async () => {
    const results = await searchNotes(noteRepository, "zzz-nonexistent-xyz-99999");
    expect(results).toEqual([]);
  });
});
