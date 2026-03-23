import { Hono } from "hono";
import type { AppEnv } from "..";
import * as graphService from "../services/graph-service";

const graphRoutes = new Hono<AppEnv>();

// 全グラフデータ
graphRoutes.get("/", (c) => {
  const data = graphService.getFullGraphData();
  return c.json(data);
});

// 特定ノート周辺のサブグラフ
graphRoutes.get("/note/:id", (c) => {
  const id = Number(c.req.param("id"));
  const data = graphService.getNoteSubgraph(id);
  return c.json(data);
});

export { graphRoutes };
