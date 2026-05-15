import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../config";
import { createNoteRepository } from "../../infrastructure/container";
import { createNote } from "../note/create-note";
import { searchNotes } from "./search-notes";

const config = loadConfig();
const noteRepository = createNoteRepository(config);

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

  // GHSA-f36f-v24r-855m
  test("ハイライト対象のタイトルに含まれる < > は HTML エスケープされる", async () => {
    const marker = `xss-title-${Date.now()}`;
    const title = `${marker}<script>alert(1)</script>`;
    await createNote(noteRepository, title, "本文");
    const results = await searchNotes(noteRepository, marker);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const out = results[0].highlightedTitle;
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  test("ハイライト対象の本文に含まれる < > は HTML エスケープされる", async () => {
    const marker = `xss-body-${Date.now()}`;
    const body = `prefix ${marker} <img src=x onerror=alert(1)> suffix`;
    await createNote(noteRepository, "タイトル", body);
    const results = await searchNotes(noteRepository, marker);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const out = results[0].highlightedBody;
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});
