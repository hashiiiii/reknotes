import { describe, expect, test } from "bun:test";
import { finishNoteProcessing, markNoteProcessing } from "../../application/note/_processing-notes";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import { createTestApp, makeNote } from "./_test-helper";

// Cards must remain locked after creation and become usable once background
// processing finishes; the rendered markup controls that transition (issue #162).

// Empty related-note and tag data omits the mini graph from the detail page.
const emptyGraphRepository: IGraphRepository = {
  findAllNoteNodes: async () => [],
  findAllTagNodes: async () => [],
  findAllLinks: async () => [],
  findNoteNodeById: async () => null,
  findRelatedNotes: async () => [],
  findRelatedTags: async () => [],
  findRelatedLinks: async () => [],
};

describe("note cards during processing", () => {
  test("POST /api/notes returns a processing card", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/notes", {
      method: "POST",
      body: new URLSearchParams({ title: "新規ノート", body: "本文" }),
      // A matching origin lets the request reach the route through CSRF protection.
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // A pending card needs polling attributes, but no link that opens it prematurely.
    expect(html).toContain("note-card processing");
    expect(html).toContain('hx-get="/api/notes/1000/card"');
    expect(html).toContain('hx-trigger="every 2s"');
    expect(html).not.toContain('href="/notes/1000"');
    // Keep the menu available for downloads even if tagging gets stuck.
    expect(html).toContain('href="/api/notes/1000/download"');
    // Deletion returns 409 during processing, so an active delete button would only fail.
    expect(html).not.toContain("hx-delete");
  });

  test("the card endpoint returns a processing card while tagging", async () => {
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1/card");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("note-card processing");
      expect(html).toContain('hx-trigger="every 2s"');
      expect(html).not.toContain('href="/notes/1"');
      // An active delete button would offer an operation that can only return 409.
      expect(html).not.toContain("hx-delete");
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("the card endpoint returns a normal card after tagging", async () => {
    const note = makeNote({ id: 1, title: "完了ノート" });
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/card");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/notes/1"');
    expect(html).not.toContain("note-card processing");
    expect(html).not.toContain("hx-trigger");
  });

  test("the note list preserves processing cards", async () => {
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes");
      const html = await res.text();
      expect(html).toContain("note-card processing");
      expect(html).toContain('hx-get="/api/notes/1/card"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("a full home-page load preserves processing cards", async () => {
    // Reloading must not make a processing card openable.
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("note-card processing");
      expect(html).toContain('hx-get="/api/notes/1/card"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("search results preserve processing cards", async () => {
    // Full-text search can find notes before tagging finishes.
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note], searchResults: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/search?q=%E5%87%A6%E7%90%86");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("note-card processing");
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("PUT returns 409 while a note is processing", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1 })] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1", {
        method: "PUT",
        body: new URLSearchParams({ title: "更新", body: "本文" }),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
      });
      expect(res.status).toBe(409);
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("DELETE returns 409 while a note is processing", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1 })] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1", {
        method: "DELETE",
        headers: { Origin: "http://localhost" },
      });
      expect(res.status).toBe(409);
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("the detail page disables edits and deletion and polls while processing", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    markNoteProcessing(1);
    try {
      const res = await app.request("/notes/1");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('hx-get="/api/notes/1/actions"');
      expect(html).toContain('hx-trigger="every 2s"');
      // The layout's search box is also disabled on detail pages, so its attribute
      // cannot prove the edit and delete actions are locked. Check their labels.
      expect(html).toContain("削除 (処理中)");
      expect(html).not.toContain("hx-delete");
      // Downloading does not change the note and must remain available while processing.
      expect(html).toContain('href="/api/notes/1/download"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("the detail page enables edits and deletion when not processing", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('hx-delete="/api/notes/1"');
    expect(html).not.toContain('hx-trigger="every 2s"');
    // Check action labels because the layout's search box has an unrelated disabled attribute.
    expect(html).not.toContain("(処理中)");
  });

  test("the actions endpoint reflects the current processing state", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1/actions");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('hx-trigger="every 2s"');
      expect(html).toContain("disabled");
    } finally {
      finishNoteProcessing(1);
    }
    const res = await app.request("/api/notes/1/actions");
    const html = await res.text();
    expect(html).not.toContain("hx-trigger");
    expect(html).toContain('hx-delete="/api/notes/1"');
  });

  test("the actions endpoint returns 404 for a missing note", async () => {
    const { app } = createTestApp({ notes: [] });
    const res = await app.request("/api/notes/999/actions");
    expect(res.status).toBe(404);
  });
});
