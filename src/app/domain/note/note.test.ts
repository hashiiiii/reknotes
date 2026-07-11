import { describe, expect, test } from "bun:test";
import type { Note } from "./note";
import { resolveDownloadFilename } from "./note";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    title: "タイトル",
    body: "本文",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("resolveDownloadFilename", () => {
  test("タイトルに .md を付けたファイル名になる", () => {
    expect(resolveDownloadFilename(makeNote({ title: "買い物メモ" }))).toBe("買い物メモ.md");
  });

  test("ファイルシステムで使えない文字は - に置換される", () => {
    // Windows / macOS / Linux いずれかで予約されている文字を網羅する
    expect(resolveDownloadFilename(makeNote({ title: 'a/b\\c:d*e?f"g<h>i|j' }))).toBe("a-b-c-d-e-f-g-h-i-j.md");
  });

  test("制御文字も - に置換される", () => {
    expect(resolveDownloadFilename(makeNote({ title: "a\tb\nc" }))).toBe("a-b-c.md");
  });

  test("先頭と末尾の空白・ドットは除去される", () => {
    // 末尾ドットは Windows で不正、先頭ドットは隠しファイルになるため
    expect(resolveDownloadFilename(makeNote({ title: " .draft. " }))).toBe("draft.md");
  });

  test("サニタイズ後に空になったら note-<id>.md にフォールバックする", () => {
    expect(resolveDownloadFilename(makeNote({ id: 42, title: " ... " }))).toBe("note-42.md");
  });

  test("100 文字を超えるタイトルは切り詰められる", () => {
    const filename = resolveDownloadFilename(makeNote({ title: "あ".repeat(150) }));
    expect(filename).toBe(`${"あ".repeat(100)}.md`);
  });
});
