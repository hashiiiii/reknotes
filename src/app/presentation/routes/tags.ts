import { Hono } from "hono";
import type { AppEnv } from "../..";
import { rebuildAllTags } from "../../application/embedding/rebuild-all-tags";
import { embeddingProvider, noteRepository, tagRepository } from "../../infrastructure/container";

const tagRoutes = new Hono<AppEnv>();

// TODO:
// 機能として持たせるべきか要検討
// モデルの変更などに際してタグを再構築した場合にこれを用いる想定
tagRoutes.post("/rebuild", async (c) => {
  await rebuildAllTags(embeddingProvider, noteRepository, tagRepository);
  return c.json({ message: "Tag rebuild complete" });
});

export { tagRoutes };
