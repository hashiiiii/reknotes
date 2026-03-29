import { Hono } from "hono";
import markdownToHtml from "zenn-markdown-html";
import type { AppEnv } from "../..";
import { engine } from "../..";
import { createNoteWithTags } from "../../application/note/create-note-with-tags";
import { deleteNote } from "../../application/note/delete-note";
import { getNote } from "../../application/note/get-note";
import { getNoteTags } from "../../application/note/get-note-tags";
import { listNotesWithTags } from "../../application/note/list-notes";
import { updateNoteWithTags } from "../../application/note/update-note-with-tags";
import { embeddingProvider, noteRepository, tagRepository } from "../../infrastructure/container";

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

  const { note, tags } = await createNoteWithTags(noteRepository, tagRepository, embeddingProvider, title, body);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
  });
  return c.html(html);
});

// ノート一覧（無限スクロール用）
noteRoutes.get("/", async (c) => {
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : undefined;
  const { notes, hasMore, nextCursor } = await listNotesWithTags(noteRepository, cursor);

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
  const note = await getNote(noteRepository, id);
  if (!note) return c.notFound();

  const tags = await getNoteTags(noteRepository, id);
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

  const note = await updateNoteWithTags(noteRepository, tagRepository, embeddingProvider, id, title, body);
  if (!note) return c.notFound();

  return c.redirect(`/notes/${id}`, 303);
});

// ノート削除
noteRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await deleteNote(noteRepository, tagRepository, id);

  // HTMX リクエスト（ホームのカード削除）は 200 を返す
  if (c.req.header("HX-Request")) {
    return c.body(null, 200);
  }
  return c.redirect("/", 303);
});

export { noteRoutes };
