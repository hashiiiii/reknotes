import { Hono } from "hono";
import type { AppEnv } from "..";
import { engine } from "..";
import { suggestTags, upsertNoteEmbedding } from "../services/embedding-service";
import * as noteService from "../services/note-service";
import * as tagService from "../services/tag-service";

const noteRoutes = new Hono<AppEnv>();

// ノート作成
noteRoutes.post("/", async (c) => {
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  if (!body.trim()) return c.text("本文を入力してください", 400);

  const note = noteService.createNote(title, body);

  // embedding 生成 → タグ推薦・類似ノートリンク
  await upsertNoteEmbedding(note.id, title, body);
  const generatedTags = await suggestTags(note.id, title, body);
  if (generatedTags.length > 0) tagService.addTagsToNote(note.id, generatedTags);

  const tags = noteService.getNoteTags(note.id);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
  });
  return c.html(html);
});

// ノート一覧（無限スクロール用）
noteRoutes.get("/", async (c) => {
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : undefined;
  const { notes, hasMore, nextCursor } = noteService.listNotesWithTags(cursor);

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
  const note = noteService.getNote(id);
  if (!note) return c.notFound();

  const tags = noteService.getNoteTags(id);
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

  const note = noteService.updateNote(id, title, body);
  if (!note) return c.notFound();

  // embedding 再生成 → タグ・リンク再生成
  await upsertNoteEmbedding(id, title, body);
  tagService.clearNoteTags(id);
  const generatedTags = await suggestTags(id, title, body);
  if (generatedTags.length > 0) tagService.addTagsToNote(id, generatedTags);

  return c.redirect(`/notes/${id}`, 303);
});

// ノート削除
noteRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  noteService.deleteNote(id);
  return c.redirect("/", 303);
});

export { noteRoutes };
