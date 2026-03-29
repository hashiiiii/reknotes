import { Hono } from "hono";
import markdownToHtml from "zenn-markdown-html";
import type { AppEnv } from "../..";
import { getNoteSubgraph } from "../../application/graph/get-note-subgraph";
import { getNote } from "../../application/note/get-note";
import { getNoteTags } from "../../application/note/get-note-tags";
import { listNotesWithTags } from "../../application/note/list-notes";
import { searchNotes } from "../../application/search/search-notes";
import { graphRepository, noteRepository } from "../../infrastructure/container";

const pageRoutes = new Hono<AppEnv>();

// ホーム
pageRoutes.get("/", async (c) => {
  const { notes, hasMore, nextCursor } = await listNotesWithTags(noteRepository);
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
  const note = await getNote(noteRepository, id);
  if (!note) return c.notFound();

  const bodyHtml = markdownToHtml(note.body);
  const tags = await getNoteTags(noteRepository, id);
  const subgraph = await getNoteSubgraph(graphRepository, id);
  const graphData = subgraph.nodes.length > 1 ? JSON.stringify(subgraph) : null;

  const html = await c.var.render("note", {
    title: note.title || "無題",
    note,
    bodyHtml,
    tags,
    graphData,
  });
  return c.html(html);
});

// 検索ページ
pageRoutes.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const results = query ? await searchNotes(noteRepository, query) : [];
  const html = await c.var.render("search", { title: "検索", query, results });
  return c.html(html);
});

// グラフページ
pageRoutes.get("/graph", async (c) => {
  const html = await c.var.render("graph", { title: "Graph", containerClass: "container-full" });
  return c.html(html);
});

export { pageRoutes };
