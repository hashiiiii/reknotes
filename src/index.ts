import { app } from "./app";
import { buildTagCache } from "./app/application/embedding/build-tag-cache";
import { rebuildAllTags } from "./app/application/embedding/rebuild-all-tags";
import { embeddingProvider, noteRepository, storageProvider, tagRepository } from "./app/infrastructure/container";

storageProvider.ensureBucket().catch((err) => console.error("Storage init error:", err));

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
  fetch: app.fetch,
};
