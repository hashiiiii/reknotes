import { Hono } from "hono";
import type { AppEnv } from "../app";
import { getDb } from "../db/connection";
import * as tagService from "../services/tag-service";

const tagRoutes = new Hono<AppEnv>();

// 全タグ取得（JSON）
tagRoutes.get("/", (c) => {
  const tags = tagService.getAllTags();
  return c.json(tags);
});

// タグ削除
tagRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb();
  db.prepare("DELETE FROM note_tags WHERE tag_id = ?").run(id);
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
  return c.text("OK");
});

export { tagRoutes };
