import { Hono } from "hono";
import type { AppEnv } from "../..";
import { engine } from "../..";
import { isNoteProcessing } from "../../application/note/is-note-processing";
import { searchNotes } from "../../application/search/search-notes";

const searchRoutes = new Hono<AppEnv>();

// htmx インクリメンタルサーチ（グリッド絞り込み）
searchRoutes.get("/", async (c) => {
  const query = c.req.query("q") ?? "";

  // クエリが空 → ノート一覧 API にリダイレクト
  if (!query.trim()) return c.redirect("/api/notes", 303);

  const results = await searchNotes(c.var.noteRepository, query);
  const html = await engine.renderFile("partials/search-results", {
    // 検索は本文の全文検索なので、タグ付け未完了のノートも結果に出てくる
    results: results.map((note) => ({ ...note, processing: isNoteProcessing(note.id) })),
    query,
  });
  return c.html(html);
});

export { searchRoutes };
