import { describe, expect, test } from "bun:test";
import { isNoteProcessing } from "../../application/note/is-note-processing";
import type { IEmbeddingProvider } from "../../application/port/embedding-provider";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { createTestApp, makeNote } from "./_test-helper";

// A 303 makes htmx swap the entire redirected document and rerun scripts, causing
// redeclaration errors. Saves must use HX-Redirect for full-page navigation instead.

// Negative similarities reject all tag candidates, as in the application update tests.
const noTagEmbeddingProvider: IEmbeddingProvider = {
  load: async () => {},
  embedNote: async () => new Float32Array([1, 0]),
  embedTag: async () => new Float32Array([-1, 0]),
  buildTagCache: async () => {},
};

// No generated tags means this path never needs tag-link creation.
const tagRepository = {
  unlinkAllByNoteId: async () => {},
  findAll: async () => [],
} as unknown as ITagRepository;

function put(app: ReturnType<typeof createTestApp>["app"], id: number, headers: Record<string, string> = {}) {
  return app.request(`/api/notes/${id}`, {
    method: "PUT",
    body: new URLSearchParams({ title: "更新後", body: "新しい本文" }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // The request must pass CSRF protection before its redirect can be checked.
      Origin: "http://localhost",
      ...headers,
    },
  });
}

describe("note update responses", () => {
  test("returns 200 with HX-Redirect for htmx saves", async () => {
    const { app } = createTestApp({
      notes: [makeNote({ id: 1 })],
      tagRepository,
      embeddingProvider: noTagEmbeddingProvider,
    });
    const res = await put(app, 1, { "HX-Request": "true" });
    expect(res.status).toBe(200);
    expect(res.headers.get("HX-Redirect")).toBe("/notes/1");
    // Background processing must finish so its lock does not leak into later tests.
    while (isNoteProcessing(1)) await Bun.sleep(1);
  });

  test("returns a 303 redirect for other saves", async () => {
    const { app } = createTestApp({
      notes: [makeNote({ id: 1 })],
      tagRepository,
      embeddingProvider: noTagEmbeddingProvider,
    });
    const res = await put(app, 1);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/notes/1");
    // Background processing must finish so its lock does not leak into later tests.
    while (isNoteProcessing(1)) await Bun.sleep(1);
  });

  test("returns 404 when saving a missing note", async () => {
    const { app } = createTestApp({
      notes: [],
      tagRepository,
      embeddingProvider: noTagEmbeddingProvider,
    });
    const res = await put(app, 99999, { "HX-Request": "true" });
    expect(res.status).toBe(404);
  });
});
