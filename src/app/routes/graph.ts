import { Hono } from "hono";
import type { AppEnv } from "..";
import * as graphService from "../services/graph-service";

const graphRoutes = new Hono<AppEnv>();

// 全グラフデータ
graphRoutes.get("/", async (c) => {
  const data = await graphService.getFullGraphData();
  return c.json(data);
});

// 特定ノート周辺のサブグラフ
graphRoutes.get("/note/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const data = await graphService.getNoteSubgraph(id);
  return c.json(data);
});

export { graphRoutes };
