// A real worker crash exercises provider recovery without downloading a model.
// The "crash" request fails without a response; other requests return a fixed vector.
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from "./local-embedding-worker";

declare var self: Worker;

self.onmessage = (event: MessageEvent<EmbeddingWorkerRequest>) => {
  const request = event.data;
  if (request.kind === "embedNote" && request.text === "crash") {
    // The uncaught error must reach the provider's worker error handler.
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
