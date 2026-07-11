// local-embedding-provider.test.ts 専用のテストフィクスチャ。
// "crash" というテキストの embedNote を受けると応答せずに uncaught error でクラッシュし、
// それ以外の要求には固定の embedding を返す。worker クラッシュ後の回復挙動の検証に使う。
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from "./local-embedding-worker";

declare var self: Worker;

self.onmessage = (event: MessageEvent<EmbeddingWorkerRequest>) => {
  const request = event.data;
  if (request.kind === "embedNote" && request.text === "crash") {
    // 応答を返さずに worker 全体を落とす (onerror 経路の再現)
    setTimeout(() => {
      throw new Error("boom");
    }, 0);
    return;
  }
  const response: EmbeddingWorkerResponse = {
    id: request.id,
    ok: true,
    embedding: new Float32Array([1, 2, 3]),
  };
  postMessage(response);
};
