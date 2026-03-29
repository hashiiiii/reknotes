import { Hono } from "hono";
import markdownToHtml from "zenn-markdown-html";
import type { AppEnv } from "..";
import { engine } from "..";
import * as noteService from "../services/note-service";

const noteRoutes = new Hono<AppEnv>();

// マークダウンプレビュー
noteRoutes.post("/preview", async (c) => {
  const form = await c.req.parseBody();
  const body = String(form.body ?? "");
  if (!body.trim()) return c.html('<p style="color:var(--muted)">本文を入力してください</p>');
  const html = markdownToHtml(body);
  return c.html(`<div class="znc">${html}</div>`);
});

// ノート作成
noteRoutes.post("/", async (c) => {
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  if (!body.trim()) return c.text("本文を入力してください", 400);

  const { note, tags } = await noteService.createNoteWithTags(title, body);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
  });
  return c.html(html);
});

// ノート一覧（無限スクロール用）
noteRoutes.get("/", async (c) => {
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : undefined;
  const { notes, hasMore, nextCursor } = await noteService.listNotesWithTags(cursor);

  let html = "";
  for (const note of notes) {
    html += await engine.renderFile("partials/note-card", { note });
  }
  if (hasMore) {
    html += `<div class="note-grid-sentinel" hx-get="/api/notes?cursor=${nextCursor}" hx-trigger="revealed" hx-swap="outerHTML"></div>`;
  }
  return c.html(html);
});

// ノートカード単体の再描画（AI処理後のUI更新用）
noteRoutes.get("/:id/card", async (c) => {
  const id = Number(c.req.param("id"));
  const note = await noteService.getNote(id);
  if (!note) return c.notFound();

  const tags = await noteService.getNoteTags(id);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
  });
  return c.html(html);
});

// ノート更新
noteRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  const note = await noteService.updateNoteWithTags(id, title, body);
  if (!note) return c.notFound();

  return c.redirect(`/notes/${id}`, 303);
});

// ノート削除
noteRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await noteService.deleteNote(id);

  // HTMX リクエスト（ホームのカード削除）は 200 を返す
  if (c.req.header("HX-Request")) {
    return c.body(null, 200);
  }
  return c.redirect("/", 303);
});

export { noteRoutes };
