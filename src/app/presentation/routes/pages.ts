import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getNoteSubgraph } from "../../application/graph/get-note-subgraph";
import { getNote } from "../../application/note/get-note";
import { getNoteTags } from "../../application/note/get-note-tags";
import { isNoteProcessing } from "../../application/note/is-note-processing";
import { listNotesWithTags } from "../../application/note/list-notes";
import { parseId } from "./_parse-id";
import { renderMarkdown } from "./_render-markdown";

const pageRoutes = new Hono<AppEnv>();

// ホーム
pageRoutes.get("/", async (c) => {
  const { notes, hasMore, nextCursor } = await listNotesWithTags(c.var.noteRepository);
  const html = await c.var.render("home", {
    title: "home",
    // 処理中フラグを付けておかないと、処理中にリロードしたとき通常カード (開ける状態) で出てしまう
    notes: notes.map((note) => ({ ...note, processing: isNoteProcessing(note.id) })),
    hasMore,
    nextCursor,
  });
  return c.html(html);
});

// ノート詳細
pageRoutes.get("/notes/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("Invalid ID", 400);
  const note = await getNote(c.var.noteRepository, id);
  if (!note) return c.notFound();

  const bodyHtml = await renderMarkdown(note.body);
  const tags = await getNoteTags(c.var.noteRepository, id);
  const subgraph = await getNoteSubgraph(c.var.graphRepository, id);
  const graphData = subgraph.nodes.length > 0 ? JSON.stringify(subgraph) : null;

  const html = await c.var.render("note", {
    title: note.title || "無題",
    note,
    bodyHtml,
    tags,
    graphData,
    // 処理中は編集・削除メニューをロックする (note-actions partial が参照)
    processing: isNoteProcessing(id),
  });
  return c.html(html);
});

// グラフページ
pageRoutes.get("/graph", async (c) => {
  const html = await c.var.render("graph", { title: "graph", containerClass: "container-full" });
  return c.html(html);
});

export { pageRoutes };
