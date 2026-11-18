import { describe, expect, test } from "bun:test";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import { createTestApp, makeNote } from "./_test-helper";

// Downloading must preserve saved Markdown rather than returning rendered HTML.

describe("GET /api/notes/:id/download", () => {
  const body = "# 見出し\n\n本文です。\n\n- リスト1\n- リスト2\n";
  const note = makeNote({ id: 1, title: "買い物メモ", body });

  test("returns the saved Markdown byte for byte", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/download");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });

  test("sets the Markdown content type", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/download");
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });

  test("sets attachment disposition with a UTF-8 filename derived from the title", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/download");
    const disposition = res.headers.get("content-disposition");
    // Downloads need an ASCII fallback as well as the original RFC 5987 filename.
    expect(disposition).toBe(
      `attachment; filename="note-1.md"; filename*=UTF-8''%E8%B2%B7%E3%81%84%E7%89%A9%E3%83%A1%E3%83%A2.md`,
    );
  });

  test("returns 404 for a missing note", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/999/download");
    expect(res.status).toBe(404);
  });

  test("returns 400 for an invalid ID", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/abc/download");
    expect(res.status).toBe(400);
  });
});

describe("download links", () => {
  const note = makeNote({ id: 1, title: "買い物メモ", body: "本文" });

  // Empty graph data keeps the detail-page assertions focused on downloading.
  const emptyGraphRepository: IGraphRepository = {
    findAllNoteNodes: async () => [],
    findAllTagNodes: async () => [],
    findAllLinks: async () => [],
    findNoteNodeById: async () => null,
    findRelatedNotes: async () => [],
    findRelatedTags: async () => [],
    findRelatedLinks: async () => [],
  };

  test("includes a download link in the note-card menu", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/api/notes/1/download"');
  });

  test("includes a download link in the note-detail menu", async () => {
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/api/notes/1/download"');
  });
});
