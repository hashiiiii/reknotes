import { Hono } from "hono";
import { Liquid } from "liquidjs";
import { join } from "path";
import type { AppEnv } from "../app";
import * as noteService from "../services/note-service";
import * as tagService from "../services/tag-service";
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
  const tagsStr = String(form.tags ?? "");

  if (!body.trim()) return c.text("本文を入力してください", 400);

  const note = noteService.createNote(title, body);

  // タグ付与
  if (tagsStr.trim()) {
    const tagNames = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
    tagService.addTagsToNote(note.id, tagNames);
  }

  // AI処理をバックグラウンドで実行（レスポンスを待たない）
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
    html += `<div hx-get="/api/notes?cursor=${nextCursor}" hx-trigger="revealed" hx-swap="outerHTML"></div>`;
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

  // 更新後は詳細ページにリダイレクト（htmxがbodyを入れ替え）
  const render = c.var.render;
  const tags = noteService.getNoteTags(id).map((name) => ({ name }));
  const linkedNotes = noteService.getLinkedNotes(id);
  const backlinks = noteService.getBacklinks(id);
  const markdownToHtml = (await import("zenn-markdown-html")).default;
  const bodyHtml = markdownToHtml(note.body);

  const html = await render("note", {
    title: note.title || "無題",
    note,
    tags,
    linkedNotes,
    backlinks,
    bodyHtml,
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

// タグ追加
noteRoutes.post("/:id/tags", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim();

  if (!name) return c.text("タグ名を入力してください", 400);
  tagService.addTagToNote(id, name);

  const tags = noteService.getNoteTags(id);
  let html = "";
  for (const tag of tags) {
    html += `<a href="/tags/${tag}" class="tag-chip">${tag}</a>`;
  }
  html += `<form class="inline-form" hx-post="/api/notes/${id}/tags" hx-target="closest .tag-list" hx-swap="outerHTML">`;
  html += `<input type="text" name="name" placeholder="+ タグ追加" class="input-tag-add">`;
  html += `</form>`;
  return c.html(`<div class="tag-list">${html}</div>`);
});

// リンク追加
noteRoutes.post("/:id/links", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const targetId = Number(form.target_id);

  if (!targetId || targetId === id) return c.text("Invalid target", 400);
  noteService.addLink(id, targetId);
  return c.text("OK");
});

// リンク削除
noteRoutes.delete("/:id/links/:targetId", async (c) => {
  const id = Number(c.req.param("id"));
  const targetId = Number(c.req.param("targetId"));
  noteService.removeLink(id, targetId);
  return c.text("OK");
});

export { noteRoutes };
