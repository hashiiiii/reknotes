import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import markdownToHtml from "zenn-markdown-html";
import type { AppEnv } from "../..";
import { engine } from "../..";
import { createNoteWithTags } from "../../application/note/create-note-with-tags";
import { deleteNote } from "../../application/note/delete-note";
import { downloadNote } from "../../application/note/download-note";
import { getNote } from "../../application/note/get-note";
import { getNoteTags } from "../../application/note/get-note-tags";
import { isNoteProcessing } from "../../application/note/is-note-processing";
import { listNotesWithTags } from "../../application/note/list-notes";
import { updateNoteWithTags } from "../../application/note/update-note-with-tags";
import { parseId } from "./_parse-id";

const noteRoutes = new Hono<AppEnv>();

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;

function validateNoteInput(title: string, body: string): string | null {
  if (title.length > MAX_TITLE_LENGTH) return `タイトルは${MAX_TITLE_LENGTH}文字以内にしてください`;
  if (body.length > MAX_BODY_LENGTH) return `本文は${MAX_BODY_LENGTH}文字以内にしてください`;
  return null;
}

// GHSA-72qg-2xg9-547p: embedding 呼び出しや markdown 変換が走る書き込み系を route 単位で絞る。
// 値は advisory の例 (write 30 / preview 60 req/min) をそのまま採用。
const writeLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "anonymous",
});

const previewLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "anonymous",
});

// マークダウンプレビュー
noteRoutes.post("/preview", previewLimiter, async (c) => {
  const form = await c.req.parseBody();
  const body = String(form.body ?? "");
  if (body.length > MAX_BODY_LENGTH) return c.text("本文が長すぎます", 400);
  if (!body.trim()) return c.html('<p style="color:var(--muted)">本文を入力してください</p>');
  const html = await markdownToHtml(body);
  return c.html(`<div class="znc">${html}</div>`);
});

// ノート作成
noteRoutes.post("/", writeLimiter, async (c) => {
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

  // 作成直後はバックグラウンドのタグ付けが走っているため、常に処理中カードとして返す。
  // 完了はカード自身が GET /api/notes/:id/card をポーリングして検知する (issue #162)
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
    showMenu: true,
    processing: true,
  });
  return c.html(html);
});

// ノート一覧（無限スクロール用）
noteRoutes.get("/", async (c) => {
  // cursor が指定されている場合のみ検証する。未指定なら従来どおり undefined。
  const cursorRaw = c.req.query("cursor");
  let cursor: number | undefined;
  if (cursorRaw) {
    const parsed = parseId(cursorRaw);
    if (parsed === null) return c.text("cursor が不正です", 400);
    cursor = parsed;
  }
  const { notes, hasMore, nextCursor } = await listNotesWithTags(c.var.noteRepository, cursor);

  let html = "";
  for (const note of notes) {
    html += await engine.renderFile("partials/note-card", {
      note,
      showMenu: true,
      processing: isNoteProcessing(note.id),
    });
  }
  if (hasMore) {
    html += `<div class="note-grid-sentinel" hx-get="/api/notes?cursor=${nextCursor}" hx-trigger="revealed" hx-swap="outerHTML"></div>`;
  }
  return c.html(html);
});

// ノートカード単体の再描画（AI処理後のUI更新用）
noteRoutes.get("/:id/card", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("ID が不正です", 400);
  const note = await getNote(c.var.noteRepository, id);
  if (!note) return c.notFound();

  const tags = await getNoteTags(c.var.noteRepository, id);
  const html = await engine.renderFile("partials/note-card", {
    note: { ...note, tags },
    showMenu: true,
    processing: isNoteProcessing(id),
  });
  return c.html(html);
});

// detail 画面の kebab メニュー単体の再描画 (処理完了後にロックを解除するポーリング用)
noteRoutes.get("/:id/actions", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("ID が不正です", 400);
  const note = await getNote(c.var.noteRepository, id);
  if (!note) return c.notFound();

  const html = await engine.renderFile("partials/note-actions", {
    note,
    processing: isNoteProcessing(id),
  });
  return c.html(html);
});

// ノートの Markdown ダウンロード
noteRoutes.get("/:id/download", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("ID が不正です", 400);
  const download = await downloadNote(c.var.noteRepository, id);
  if (!download) return c.notFound();

  // 非 ASCII のファイル名は RFC 5987 の filename* で渡し、filename は ASCII フォールバックにする
  const encoded = encodeURIComponent(download.filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  c.header("Content-Type", "text/markdown; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="note-${id}.md"; filename*=UTF-8''${encoded}`);
  return c.body(download.body);
});

// ノート更新
noteRoutes.put("/:id", writeLimiter, async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("ID が不正です", 400);
  const form = await c.req.parseBody();
  const title = String(form.title ?? "");
  const body = String(form.body ?? "");

  const error = validateNoteInput(title, body);
  if (error) return c.text(error, 400);

  const note = await updateNoteWithTags(
    c.var.noteRepository,
    c.var.tagRepository,
    c.var.embeddingProvider,
    c.var.storageProvider,
    id,
    title,
    body,
  );
  if (note === "processing") return c.text("タグ付け処理中です。完了までお待ちください", 409);
  if (!note) return c.notFound();

  // htmx には HX-Redirect でフルページ遷移させる (delete と同じ方式)。
  // 303 を返すと XHR がリダイレクトを追って全文書 HTML が body に swap され、
  // 読み込み済みの外部 script が再実行されて redeclaration エラーになる。
  if (c.req.header("HX-Request")) {
    c.header("HX-Redirect", `/notes/${id}`);
    return c.body(null, 200);
  }
  return c.redirect(`/notes/${id}`, 303);
});

// ノート削除
noteRoutes.delete("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("ID が不正です", 400);
  const deleted = await deleteNote(c.var.noteRepository, c.var.tagRepository, c.var.storageProvider, id);

  if (deleted === "processing") return c.text("タグ付け処理中です。完了までお待ちください", 409);
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
