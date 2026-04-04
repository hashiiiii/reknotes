import { Hono } from "hono";
import type { AppEnv } from "../..";
import { deleteTag } from "../../application/tag/delete-tag";
import { getAllTags } from "../../application/tag/get-all-tags";
import { tagRepository } from "../../infrastructure/container";

const tagRoutes = new Hono<AppEnv>();

// 全タグ取得（JSON）
tagRoutes.get("/", async (c) => {
  const tags = await getAllTags(tagRepository);
  return c.json(tags);
});

// タグ削除（CASCADE で note_tags も自動削除）
tagRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const deleted = await deleteTag(tagRepository, id);
  if (!deleted) return c.notFound();
  return c.text("OK");
});

export { tagRoutes };
