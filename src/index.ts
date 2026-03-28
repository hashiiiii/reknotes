import { app } from "./app";
import { backfillEmbeddings, buildTagCache, preload, rebuildAllTags } from "./app/services/embedding-service";

const port = Number(process.env.PORT) || 3000;

console.log(`reknotes running at http://localhost:${port}`);

// Embedding モデルをバックグラウンドでロード＆初期化
preload()
  .then(async () => {
    const count = await backfillEmbeddings();
    if (count > 0) console.log(`Backfilled embeddings for ${count} notes`);
    await buildTagCache();

    // REBUILD_TAGS=1 で起動すると全タグを再生成
    if (process.env.REBUILD_TAGS === "1") {
      console.log("Rebuilding all tags...");
      await rebuildAllTags();
      console.log("Tag rebuild complete");
    }
  })
  .catch((err) => console.error("Embedding init error:", err));

export default {
  port,
  fetch: app.fetch,
};
