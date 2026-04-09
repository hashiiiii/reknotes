import { app } from "./app";
import { buildTagCache } from "./app/application/embedding/build-tag-cache";
import { embeddingProvider, tagRepository } from "./app/infrastructure/container";

embeddingProvider
  .preload()
  .then(async () => {
    await buildTagCache(embeddingProvider, tagRepository);
  })
  .catch((err) => {
    console.warn("Embedding init failed (auto-tagging disabled):", err);
  });

export default {
  fetch: app.fetch,
};
