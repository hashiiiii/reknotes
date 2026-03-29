import { app } from "./app";
import { buildTagCache } from "./app/application/embedding/build-tag-cache";
import { rebuildAllTags } from "./app/application/embedding/rebuild-all-tags";
import { embeddingProvider, noteRepository, tagRepository } from "./app/infrastructure/container";

const port = Number(process.env.PORT);

console.log(`reknotes running at http://localhost:${port}`);

// Embedding モデルをバックグラウンドでロード＆初期化
embeddingProvider
  .preload()
  .then(async () => {
    await buildTagCache(embeddingProvider, tagRepository);

    // REBUILD_TAGS=1 で起動すると全タグを再生成
    if (process.env.REBUILD_TAGS === "1") {
      console.log("Rebuilding all tags...");
      await rebuildAllTags(embeddingProvider, noteRepository, tagRepository);
      console.log("Tag rebuild complete");
    }
  })
  .catch((err) => console.error("Embedding init error:", err));

export default {
  port,
  fetch: app.fetch,
};
