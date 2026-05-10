import { Hono } from "hono";
import markdownToHtml from "zenn-markdown-html";
import type { AppEnv } from "../..";
import { getNoteSubgraph } from "../../application/graph/get-note-subgraph";
import { getNote } from "../../application/note/get-note";
import { getNoteTags } from "../../application/note/get-note-tags";
import { listNotesWithTags } from "../../application/note/list-notes";

const pageRoutes = new Hono<AppEnv>();

// ホーム
pageRoutes.get("/", async (c) => {
  const { notes, hasMore, nextCursor } = await listNotesWithTags(c.var.noteRepository);
  const html = await c.var.render("home", {
    title: "home",
    notes,
    hasMore,
    nextCursor,
  });
  return c.html(html);
});

// ノート詳細
pageRoutes.get("/notes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const note = await getNote(c.var.noteRepository, id);
  if (!note) return c.notFound();

  const bodyHtml = await markdownToHtml(note.body);
  const tags = await getNoteTags(c.var.noteRepository, id);
  const subgraph = await getNoteSubgraph(c.var.graphRepository, id);
  const graphData = subgraph.nodes.length > 0 ? JSON.stringify(subgraph) : null;

  const html = await c.var.render("note", {
    title: note.title || "無題",
    note,
    bodyHtml,
    tags,
    graphData,
  });
  return c.html(html);
});

// グラフページ
pageRoutes.get("/graph", async (c) => {
  const html = await c.var.render("graph", { title: "graph", containerClass: "container-full" });
  return c.html(html);
});

export { pageRoutes };
