import { describe, expect, test } from "bun:test";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import { createTestApp, makeNote } from "./_test-helper";

// GET /api/notes/:id/download が保存された Markdown をそのままファイルとして返すことを検証する。

describe("GET /api/notes/:id/download", () => {
  const body = "# 見出し\n\n本文です。\n\n- リスト1\n- リスト2\n";
  const note = makeNote({ id: 1, title: "買い物メモ", body });

  test("保存された Markdown がバイト単位でそのまま返る", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/download");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });

  test("Content-Type は text/markdown になる", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/download");
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });

  test("Content-Disposition が attachment で、タイトル由来のファイル名が UTF-8 で入る", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/1/download");
    const disposition = res.headers.get("content-disposition");
    // ASCII フォールバック (filename=) と RFC 5987 の filename* を併記する
    expect(disposition).toBe(
      `attachment; filename="note-1.md"; filename*=UTF-8''%E8%B2%B7%E3%81%84%E7%89%A9%E3%83%A1%E3%83%A2.md`,
    );
  });

  test("存在しないノートは 404 を返す", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/999/download");
    expect(res.status).toBe(404);
  });

  test("不正な ID は 400 を返す", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes/abc/download");
    expect(res.status).toBe(400);
  });
});

describe("ダウンロードリンクの UI", () => {
  const note = makeNote({ id: 1, title: "買い物メモ", body: "本文" });

  // グラフ描画なしで詳細ページを描画するための空スタブ
  const emptyGraphRepository: IGraphRepository = {
    findAllNoteNodes: async () => [],
    findAllTagNodes: async () => [],
    findAllLinks: async () => [],
    findNoteNodeById: async () => null,
    findRelatedNotes: async () => [],
    findRelatedTags: async () => [],
    findRelatedLinks: async () => [],
  };

  test("ノートカードの kebab メニューにダウンロードリンクが出る", async () => {
    const { app } = createTestApp({ notes: [note] });
    const res = await app.request("/api/notes");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/api/notes/1/download"');
  });

  test("ノート詳細ページの kebab メニューにダウンロードリンクが出る", async () => {
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/api/notes/1/download"');
  });
});
