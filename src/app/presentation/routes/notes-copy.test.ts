import { describe, expect, test } from "bun:test";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import { createTestApp, makeNote } from "./_test-helper";

// Copying must use saved Markdown from the textarea's defaultValue, excluding unsaved edits.

describe("Copy as Markdown UI", () => {
  const note = makeNote({ id: 1, title: "買い物メモ", body: "# 見出し\n\n本文" });

  // Empty graph data keeps this test focused on the copy button and its source.
  const emptyGraphRepository: IGraphRepository = {
    findAllNoteNodes: async () => [],
    findAllTagNodes: async () => [],
    findAllLinks: async () => [],
    findNoteNodeById: async () => null,
    findRelatedNotes: async () => [],
    findRelatedTags: async () => [],
    findRelatedLinks: async () => [],
  };

  test("the note detail page contains the copy button", async () => {
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("copyNoteMarkdown(this)");
  });

  test("the note detail page contains the copy source textarea", async () => {
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="note-body-input"');
  });
});
