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
  test("appends .md to the title", () => {
    expect(resolveDownloadFilename(makeNote({ title: "買い物メモ" }))).toBe("買い物メモ.md");
  });

  test("replaces reserved filename characters with hyphens", () => {
    // Downloads must have valid filenames across Windows, macOS, and Linux.
    expect(resolveDownloadFilename(makeNote({ title: 'a/b\\c:d*e?f"g<h>i|j' }))).toBe("a-b-c-d-e-f-g-h-i-j.md");
  });

  test("replaces control characters with hyphens", () => {
    expect(resolveDownloadFilename(makeNote({ title: "a\tb\nc" }))).toBe("a-b-c.md");
  });

  test("removes leading and trailing whitespace and dots", () => {
    // Windows rejects trailing dots, and leading dots would hide the file.
    expect(resolveDownloadFilename(makeNote({ title: " .draft. " }))).toBe("draft.md");
  });

  test("uses note-<id>.md when sanitization leaves an empty title", () => {
    expect(resolveDownloadFilename(makeNote({ id: 42, title: " ... " }))).toBe("note-42.md");
  });

  test("truncates titles longer than 100 characters", () => {
    const filename = resolveDownloadFilename(makeNote({ title: "あ".repeat(150) }));
    expect(filename).toBe(`${"あ".repeat(100)}.md`);
  });

  test("does not split surrogate pairs when truncating", () => {
    // Splitting a surrogate pair at the 100-character boundary leaves a lone
    // surrogate, which makes encodeURIComponent throw URIError.
    const filename = resolveDownloadFilename(makeNote({ title: `${"a".repeat(99)}😀x` }));
    expect(filename).toBe(`${"a".repeat(99)}😀.md`);
    expect(() => encodeURIComponent(filename)).not.toThrow();
  });
});
