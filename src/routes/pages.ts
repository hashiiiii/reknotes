import { Hono } from "hono";
import markdownToHtml from "zenn-markdown-html";
import type { AppEnv } from "../app";
import * as graphService from "../services/graph-service";
import * as noteService from "../services/note-service";
import { search } from "../services/search-service";

const pageRoutes = new Hono<AppEnv>();

// ホーム
pageRoutes.get("/", async (c) => {
  const { notes, hasMore, nextCursor } = noteService.listNotes();
  const html = await c.var.render("home", {
    title: "Home",
    notes,
    hasMore,
    nextCursor,
  });
  return c.html(html);
});

// ノート詳細
pageRoutes.get("/notes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const note = noteService.getNote(id);
  if (!note) return c.notFound();

  const bodyHtml = markdownToHtml(note.body);
  const subgraph = graphService.getNoteSubgraph(id);
  const graphData = subgraph.nodes.length > 1 ? JSON.stringify(subgraph) : null;

  const html = await c.var.render("note", {
    title: note.title || "無題",
    note,
    bodyHtml,
    graphData,
  });
  return c.html(html);
});

// 検索ページ
pageRoutes.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const results = query ? search(query) : [];
  const html = await c.var.render("search", { title: "検索", query, results });
  return c.html(html);
});

// グラフページ
pageRoutes.get("/graph", async (c) => {
  const html = await c.var.render("graph", { title: "Graph", containerClass: "container-full" });
  return c.html(html);
});

export { pageRoutes };
