import { describe, expect, test } from "bun:test";
import { isNoteProcessing } from "../../application/note/is-note-processing";
import type { IEmbeddingProvider } from "../../application/port/embedding-provider";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { createTestApp, makeNote } from "./_test-helper";

// 編集保存 (PUT /api/notes/:id) の応答方式を検証する。
// htmx リクエストに 303 を返すと XHR がリダイレクトを追い、全文書 HTML が body に swap されて
// 読み込み済みの外部 script が再実行される (redeclaration エラー)。そのため htmx には
// HX-Redirect ヘッダでフルページ遷移させる (DELETE /api/notes/:id の detail 経路と同じ方式)。

// タグ生成経路は「負の類似度で全候補を落とす」embedding にして素通しする
// (update-note-with-tags.test.ts と同じ手法)。
const noTagEmbeddingProvider: IEmbeddingProvider = {
  load: async () => {},
  embedNote: async () => new Float32Array([1, 0]),
  embedTag: async () => new Float32Array([-1, 0]),
  buildTagCache: async () => {},
};

// 更新経路が触るメソッドだけ持つ tagRepository。タグは生成されないので link 系は呼ばれない。
const tagRepository = {
  unlinkAllByNoteId: async () => {},
  findAll: async () => [],
} as unknown as ITagRepository;

function put(app: ReturnType<typeof createTestApp>["app"], id: number, headers: Record<string, string> = {}) {
  return app.request(`/api/notes/${id}`, {
    method: "PUT",
    body: new URLSearchParams({ title: "更新後", body: "新しい本文" }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Origin は CSRF ミドルウェアを通すために必要
      Origin: "http://localhost",
      ...headers,
    },
  });
}

describe("ノート更新の応答方式", () => {
  test("htmx からの保存は 200 + HX-Redirect でフルページ遷移させる", async () => {
    const { app } = createTestApp({
      notes: [makeNote({ id: 1 })],
      tagRepository,
      embeddingProvider: noTagEmbeddingProvider,
    });
    const res = await put(app, 1, { "HX-Request": "true" });
    expect(res.status).toBe(200);
    expect(res.headers.get("HX-Redirect")).toBe("/notes/1");
    // バックグラウンドジョブの完了を待ち、processing 状態を他のテストに持ち越さない
    while (isNoteProcessing(1)) await Bun.sleep(1);
  });

  test("htmx 以外からの保存は従来どおり 303 リダイレクトを返す", async () => {
    const { app } = createTestApp({
      notes: [makeNote({ id: 1 })],
      tagRepository,
      embeddingProvider: noTagEmbeddingProvider,
    });
    const res = await put(app, 1);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/notes/1");
    // バックグラウンドジョブの完了を待ち、processing 状態を他のテストに持ち越さない
    while (isNoteProcessing(1)) await Bun.sleep(1);
  });

  test("存在しないノートの保存は 404 を返す", async () => {
    const { app } = createTestApp({
      notes: [],
      tagRepository,
      embeddingProvider: noTagEmbeddingProvider,
    });
    const res = await put(app, 99999, { "HX-Request": "true" });
    expect(res.status).toBe(404);
  });
});
