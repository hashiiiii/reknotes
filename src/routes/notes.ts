import { Hono } from "hono";
import { Liquid } from "liquidjs";
import { join } from "path";
import type { AppEnv } from "../app";
import * as noteService from "../services/note-service";
import { processNoteWithAi } from "../services/ai-service";

const noteRoutes = new Hono<AppEnv>();

const engine = new Liquid({
  root: join(import.meta.dir, "..", "views"),
  partials: join(import.meta.dir, "..", "views", "partials"),
  extname: ".liquid",
});

// ノート作成
noteRoutes.post("/", async (c) => {
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  if (!body.trim()) return c.text("本文を入力してください", 400);

  const note = noteService.createNote(title, body);

  // AI処理をバックグラウンドで実行（タグ・リンクを自動生成）
  processNoteWithAi(note.id).catch(() => {});

  const tags = noteService.getNoteTags(note.id);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
  });
  return c.html(html);
});

// ノート一覧（無限スクロール用）
noteRoutes.get("/", async (c) => {
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : undefined;
  const { notes, hasMore, nextCursor } = noteService.listNotes(cursor);

  const notesWithTags = notes.map((n) => ({
    ...n,
    tags: noteService.getNoteTags(n.id),
  }));

  let html = "";
  for (const note of notesWithTags) {
    html += await engine.renderFile("partials/note-card", { note });
  }
  if (hasMore) {
    html += `<div class="note-grid-sentinel" hx-get="/api/notes?cursor=${nextCursor}" hx-trigger="revealed" hx-swap="outerHTML"></div>`;
  }
  return c.html(html);
});

// ノート更新
noteRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  const note = noteService.updateNote(id, title, body);
  if (!note) return c.notFound();

  // AI処理をバックグラウンドで再実行（タグ・リンクを再生成）
  processNoteWithAi(id).catch(() => {});

  // 更新後は詳細ページにリダイレクト（htmxがbodyを入れ替え）
  const render = c.var.render;
  const tags = noteService.getNoteTags(id).map((name) => ({ name }));
  const linkedNotes = noteService.getLinkedNotes(id);
  const backlinks = noteService.getBacklinks(id);
  const markdownToHtml = (await import("zenn-markdown-html")).default;
  const bodyHtml = markdownToHtml(note.body);
  const { getNoteSubgraph } = await import("../services/graph-service");
  const subgraph = getNoteSubgraph(id);
  const graphData = subgraph.nodes.length > 1 ? JSON.stringify(subgraph) : null;

  const html = await render("note", {
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

// ノート削除
noteRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  noteService.deleteNote(id);

  // ホームページを返却
  const render = c.var.render;
  const { notes, hasMore, nextCursor } = noteService.listNotes();
  const notesWithTags = notes.map((n) => ({
    ...n,
    tags: noteService.getNoteTags(n.id),
  }));
  const html = await render("home", {
    title: "Home",
    notes: notesWithTags,
    hasMore,
    nextCursor,
  });
  return c.html(html);
});


export { noteRoutes };
