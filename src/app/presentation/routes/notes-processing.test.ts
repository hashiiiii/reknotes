import { describe, expect, test } from "bun:test";
import { finishNoteProcessing, markNoteProcessing } from "../../application/note/_processing-notes";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import { createTestApp, makeNote } from "./_test-helper";

// 投稿直後のノートカードが「処理中」状態で返り、バックグラウンド処理の完了後に
// 通常のカードへ遷移する (issue #162) ことを HTML マークアップで検証する。

// detail ページ描画用。関連ノート・タグなし = mini graph セクションは出ない
const emptyGraphRepository: IGraphRepository = {
  findAllNoteNodes: async () => [],
  findAllTagNodes: async () => [],
  findAllLinks: async () => [],
  findNoteNodeById: async () => null,
  findRelatedNotes: async () => [],
  findRelatedTags: async () => [],
  findRelatedLinks: async () => [],
};

describe("処理中ステートのノートカード", () => {
  test("POST /api/notes は処理中カードを返す", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/notes", {
      method: "POST",
      body: new URLSearchParams({ title: "新規ノート", body: "本文" }),
      // Origin は CSRF ミドルウェアを通すために必要
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // 灰色表示 + 完了を待つポーリング属性を持ち、詳細ページへのリンクは持たない
    expect(html).toContain("note-card processing");
    expect(html).toContain('hx-get="/api/notes/1000/card"');
    expect(html).toContain('hx-trigger="every 2s"');
    expect(html).not.toContain('href="/notes/1000"');
    // 処理中でも kebab メニューは残す。タグ付けがハングしてもノートを削除・ダウンロードできるように
    expect(html).toContain('href="/api/notes/1000/download"');
    // 処理中は削除を出さない。DELETE は 409 で拒否されるため、押せても失敗するだけのボタンになる
    expect(html).not.toContain("hx-delete");
  });

  test("処理中のノートの GET /api/notes/:id/card は処理中カードを返す", async () => {
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1/card");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("note-card processing");
      expect(html).toContain('hx-trigger="every 2s"');
      expect(html).not.toContain('href="/notes/1"');
      // 処理中は削除を出さない。DELETE は 409 で拒否されるため、押せても失敗するだけのボタンになる
      expect(html).not.toContain("hx-delete");
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("処理が終わったノートの GET /api/notes/:id/card は通常カードを返す", async () => {
    const note = makeNote({ id: 1, title: "完了ノート" });
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/card");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/notes/1"');
    expect(html).not.toContain("note-card processing");
    expect(html).not.toContain("hx-trigger");
  });

  test("一覧 (GET /api/notes) でも処理中のノートは処理中カードになる", async () => {
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes");
      const html = await res.text();
      expect(html).toContain("note-card processing");
      expect(html).toContain('hx-get="/api/notes/1/card"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("ホームのフルロードでも処理中のノートは処理中カードになる", async () => {
    // 処理中にページを再読み込みしても、通常カード (開ける状態) で出ないことの検証
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("note-card processing");
      expect(html).toContain('hx-get="/api/notes/1/card"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("検索結果でも処理中のノートは処理中カードになる", async () => {
    // 検索は本文の全文検索なので、タグ付け未完了のノートも結果に出てくる
    const note = makeNote({ id: 1, title: "処理中ノート" });
    const { app } = createTestApp({ notes: [note], searchResults: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/search?q=%E5%87%A6%E7%90%86");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("note-card processing");
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("処理中のノートへの PUT は 409 を返す", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1 })] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1", {
        method: "PUT",
        body: new URLSearchParams({ title: "更新", body: "本文" }),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
      });
      expect(res.status).toBe(409);
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("処理中のノートへの DELETE は 409 を返す", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1 })] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1", {
        method: "DELETE",
        headers: { Origin: "http://localhost" },
      });
      expect(res.status).toBe(409);
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("処理中の GET /notes/:id は編集・削除を無効化しポーリング属性を付ける", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    markNoteProcessing(1);
    try {
      const res = await app.request("/notes/1");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('hx-get="/api/notes/1/actions"');
      expect(html).toContain('hx-trigger="every 2s"');
      // 編集・削除は無効化ラベルになる。base layout の検索ボックスも非トップページでは
      // disabled 属性を持つため、"disabled" 単体ではなく (処理中) ラベルで判定する
      expect(html).toContain("削除 (処理中)");
      // 削除は無効化ボタンになり、hx-delete は出ない
      expect(html).not.toContain("hx-delete");
      // ダウンロードは処理中も使える
      expect(html).toContain('href="/api/notes/1/download"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("通常時の GET /notes/:id は従来どおり編集・削除メニューを出す", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('hx-delete="/api/notes/1"');
    expect(html).not.toContain('hx-trigger="every 2s"');
    // base layout の検索ボックスが disabled を含むため、無効化ラベルの有無で判定する
    expect(html).not.toContain("(処理中)");
  });

  test("GET /api/notes/:id/actions は処理中と通常で出し分ける", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1/actions");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('hx-trigger="every 2s"');
      expect(html).toContain("disabled");
    } finally {
      finishNoteProcessing(1);
    }
    const res = await app.request("/api/notes/1/actions");
    const html = await res.text();
    expect(html).not.toContain("hx-trigger");
    expect(html).toContain('hx-delete="/api/notes/1"');
  });

  test("存在しないノートの GET /api/notes/:id/actions は 404 を返す", async () => {
    const { app } = createTestApp({ notes: [] });
    const res = await app.request("/api/notes/999/actions");
    expect(res.status).toBe(404);
  });
});
