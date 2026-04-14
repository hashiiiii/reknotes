import { Hono } from "hono";
import type { AppEnv } from "../..";
import { engine } from "../..";
import { searchNotes } from "../../application/search/search-notes";

const searchRoutes = new Hono<AppEnv>();

// htmx インクリメンタルサーチ（グリッド絞り込み）
searchRoutes.get("/", async (c) => {
  const query = c.req.query("q") ?? "";

  // クエリが空 → ノート一覧 API にリダイレクト
  if (!query.trim()) return c.redirect("/api/notes", 303);

  const results = await searchNotes(c.var.noteRepository, query);
  const html = await engine.renderFile("partials/search-results", {
    results,
    query,
  });
  return c.html(html);
});

export { searchRoutes };
