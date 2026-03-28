import { app } from "./app";
import { buildTagCache, preload, rebuildAllTags } from "./app/services/embedding-service";

const port = Number(process.env.PORT);

console.log(`reknotes running at http://localhost:${port}`);

// Embedding モデルをバックグラウンドでロード＆初期化
preload()
  .then(async () => {
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
