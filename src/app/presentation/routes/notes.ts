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

const noteRoutes = new Hono<AppEnv>();

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;

function validateNoteInput(title: string, body: string): string | null {
  if (title.length > MAX_TITLE_LENGTH) return `タイトルは${MAX_TITLE_LENGTH}文字以内にしてください`;
  if (body.length > MAX_BODY_LENGTH) return `本文は${MAX_BODY_LENGTH}文字以内にしてください`;
  return null;
}

// マークダウンプレビュー
noteRoutes.post("/preview", async (c) => {
  const form = await c.req.parseBody();
  const body = String(form.body ?? "");
  if (body.length > MAX_BODY_LENGTH) return c.text("本文が長すぎます", 400);
  if (!body.trim()) return c.html('<p style="color:var(--muted)">本文を入力してください</p>');
  const html = markdownToHtml(body);
  return c.html(`<div class="znc">${html}</div>`);
});

// ノート作成
noteRoutes.post("/", async (c) => {
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  const error = validateNoteInput(title, body);
  if (error) return c.text(error, 400);

  if (!body.trim()) return c.text("本文を入力してください", 400);

  const { note, tags } = await createNoteWithTags(
    c.var.noteRepository,
    c.var.tagRepository,
    c.var.embeddingProvider,
    title,
    body,
  );

  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
    showMenu: true,
  });
  return c.html(html);
});

// ノート一覧（無限スクロール用）
noteRoutes.get("/", async (c) => {
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : undefined;
  const { notes, hasMore, nextCursor } = await listNotesWithTags(c.var.noteRepository, cursor);

  let html = "";
  for (const note of notes) {
    html += await engine.renderFile("partials/note-card", { note, showMenu: true });
  }
  if (hasMore) {
    html += `<div class="note-grid-sentinel" hx-get="/api/notes?cursor=${nextCursor}" hx-trigger="revealed" hx-swap="outerHTML"></div>`;
  }
  return c.html(html);
});

// ノートカード単体の再描画（AI処理後のUI更新用）
noteRoutes.get("/:id/card", async (c) => {
  const id = Number(c.req.param("id"));
  const note = await getNote(c.var.noteRepository, id);
  if (!note) return c.notFound();

  const tags = await getNoteTags(c.var.noteRepository, id);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
    showMenu: true,
  });
  return c.html(html);
});

// ノート更新
noteRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  const error = validateNoteInput(title, body);
  if (error) return c.text(error, 400);

  const note = await updateNoteWithTags(
    c.var.noteRepository,
    c.var.tagRepository,
    c.var.embeddingProvider,
    id,
    title,
    body,
  );
  if (!note) return c.notFound();

  return c.redirect(`/notes/${id}`, 303);
});

// ノート削除
noteRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const deleted = await deleteNote(c.var.noteRepository, c.var.tagRepository, c.var.storageProvider, id);

  if (!deleted) return c.notFound();

  if (c.req.header("HX-Request")) {
    if (c.req.header("HX-Current-URL")?.includes("/notes/")) {
      c.header("HX-Redirect", "/");
    }
    return c.body(null, 200);
  }
  return c.redirect("/", 303);
});

export { noteRoutes };
