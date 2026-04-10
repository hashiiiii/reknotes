import { app } from "./app";
import { buildTagCache } from "./app/application/embedding/build-tag-cache";
import { embeddingProvider, tagRepository } from "./app/infrastructure/container";

embeddingProvider
  .load()
  .then(async () => {
    await buildTagCache(embeddingProvider, tagRepository);
  })
  .catch((err) => {
    console.error("Embedding init failed:", err);
    process.exit(1);
  });

export default {
  fetch: app.fetch,
};
