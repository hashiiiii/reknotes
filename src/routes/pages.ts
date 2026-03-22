import { Hono } from "hono";
import type { AppEnv } from "../app";
import * as noteService from "../services/note-service";
import * as tagService from "../services/tag-service";
import * as graphService from "../services/graph-service";
import { search } from "../services/search-service";
import markdownToHtml from "zenn-markdown-html";

const pageRoutes = new Hono<AppEnv>();

// ホーム
pageRoutes.get("/", async (c) => {
  const { notes, hasMore, nextCursor } = noteService.listNotes();
  const notesWithTags = notes.map((n) => ({
    ...n,
    tags: noteService.getNoteTags(n.id),
  }));
  const html = await c.var.render("home", {
    title: "Home",
    notes: notesWithTags,
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

  const tags = noteService.getNoteTags(id).map((name) => ({ name }));
  const linkedNotes = noteService.getLinkedNotes(id);
  const backlinks = noteService.getBacklinks(id);
  const bodyHtml = markdownToHtml(note.body);
  const subgraph = graphService.getNoteSubgraph(id);
  const graphData = subgraph.nodes.length > 1 ? JSON.stringify(subgraph) : null;

  const html = await c.var.render("note", {
    title: note.title || "無題",
    note,
    tags,
    linkedNotes,
    backlinks,
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
  const html = await c.var.render("graph", { title: "ナレッジマップ", containerClass: "container-full" });
  return c.html(html);
});

// タグ一覧
pageRoutes.get("/tags", async (c) => {
  const tags = tagService.getAllTags();
  const maxCount = Math.max(...tags.map((t) => t.count), 1);
  const tagsWithSize = tags.map((t) => ({
    ...t,
    size: Math.ceil((t.count / maxCount) * 3),
  }));
  const html = await c.var.render("tags", { title: "タグ", tags: tagsWithSize });
  return c.html(html);
});

// タグ別ノート一覧
pageRoutes.get("/tags/:name", async (c) => {
  const tagName = c.req.param("name");
  const noteIds = tagService.getNotesByTag(tagName);
  const notes = noteIds
    .map((id) => noteService.getNote(id))
    .filter(Boolean)
    .map((n) => ({ ...n!, tags: noteService.getNoteTags(n!.id) }));
  const html = await c.var.render("tag-notes", {
    title: `タグ: ${tagName}`,
    tagName,
    notes,
  });
  return c.html(html);
});

export { pageRoutes };
