import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getFullGraph } from "../../application/graph/get-full-graph";
import { getNoteSubgraph } from "../../application/graph/get-note-subgraph";
import { graphRepository } from "../../infrastructure/container";

const graphRoutes = new Hono<AppEnv>();

// 全グラフデータ
graphRoutes.get("/", async (c) => {
  const data = await getFullGraph(graphRepository);
  return c.json(data);
});

// 特定ノート周辺のサブグラフ
graphRoutes.get("/note/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const data = await getNoteSubgraph(graphRepository, id);
  return c.json(data);
});

export { graphRoutes };
