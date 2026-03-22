import { join } from "node:path";
import { Hono } from "hono";
import { Liquid } from "liquidjs";
import type { AppEnv } from "../app";
import * as noteService from "../services/note-service";
import { search } from "../services/search-service";

const searchRoutes = new Hono<AppEnv>();

const engine = new Liquid({
  root: join(import.meta.dir, "..", "views"),
  partials: join(import.meta.dir, "..", "views", "partials"),
  extname: ".liquid",
});

// htmx インクリメンタルサーチ（グリッド絞り込み）
searchRoutes.get("/", async (c) => {
  const query = c.req.query("q") ?? "";

  if (!query.trim()) {
    // クエリが空 → 通常のノート一覧を返す
    const { notes, hasMore, nextCursor } = noteService.listNotes();
    let html = "";
    for (const note of notes) {
      html += await engine.renderFile("partials/note-card", { note });
    }
    if (hasMore) {
      html += `<div class="note-grid-sentinel" hx-get="/api/notes?cursor=${nextCursor}" hx-trigger="revealed" hx-swap="outerHTML"></div>`;
    }
    return c.html(html);
  }

  const results = search(query);
  const html = await engine.renderFile("partials/search-results", {
    results,
    query,
  });
  return c.html(html);
});

export { searchRoutes };
