import { Hono } from "hono";
import { Liquid } from "liquidjs";
import { join } from "path";
import type { AppEnv } from "../app";
import { search } from "../services/search-service";

const searchRoutes = new Hono<AppEnv>();

const engine = new Liquid({
  root: join(import.meta.dir, "..", "views"),
  partials: join(import.meta.dir, "..", "views", "partials"),
  extname: ".liquid",
});

// htmx インクリメンタルサーチ
searchRoutes.get("/", async (c) => {
  const query = c.req.query("q") ?? "";
  const results = query.trim() ? search(query) : [];

  const html = await engine.renderFile("partials/search-results", {
    results,
    query,
  });
  return c.html(html);
});

export { searchRoutes };
