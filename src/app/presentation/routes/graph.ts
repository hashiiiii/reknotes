import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getFullGraph } from "../../application/graph/get-full-graph";
import { getNoteSubgraph } from "../../application/graph/get-note-subgraph";
const graphRoutes = new Hono<AppEnv>();

// 全グラフデータ
graphRoutes.get("/", async (c) => {
  const data = await getFullGraph(c.var.graphRepository);
  return c.json(data);
});

// 特定ノート周辺のサブグラフ
graphRoutes.get("/note/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const data = await getNoteSubgraph(c.var.graphRepository, id);
  return c.json(data);
});

export { graphRoutes };
