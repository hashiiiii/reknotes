import { app } from "./app";
import { buildTagCache } from "./app/application/embedding/build-tag-cache";
import { getEmbeddingProvider, tagRepository } from "./app/infrastructure/container";

getEmbeddingProvider()
  .preload()
  .then(async () => {
    await buildTagCache(getEmbeddingProvider(), tagRepository);
  })
  .catch((err) => {
    console.error("Embedding init failed:", err);
    process.exit(1);
  });

export default {
  fetch: app.fetch,
};
