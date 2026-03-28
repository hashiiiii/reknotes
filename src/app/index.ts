import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { Liquid } from "liquidjs";
import { graphRoutes } from "./routes/graph";
import { noteRoutes } from "./routes/notes";
import { pageRoutes } from "./routes/pages";
import { searchRoutes } from "./routes/search";
import { tagRoutes } from "./routes/tags";
import { uploadRoutes } from "./routes/upload";

// LiquidJS エンジン初期化
const viewsDir = join(import.meta.dir, "views");
const engine = new Liquid({
  root: viewsDir,
  layouts: join(viewsDir, "layouts"),
  partials: join(viewsDir, "partials"),
  extname: ".liquid",
  cache: process.env.NODE_ENV === "production",
});

// カスタムフィルター: unixtime → 人間が読める日時
engine.registerFilter("formatDate", (timestamp: number) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

export type AppEnv = {
  Variables: {
    render: (template: string, data?: Record<string, unknown>) => Promise<string>;
  };
};

export { engine };

const app = new Hono<AppEnv>();

// LiquidJS ミドルウェア
app.use("*", async (c, next) => {
  c.set("render", async (template: string, data: Record<string, unknown> = {}) => {
    return engine.renderFile(`pages/${template}`, {
      ...data,
      currentPath: c.req.path,
    });
  });
  await next();
});

// 静的ファイル配信
app.use("/static/css/zenn.css", serveStatic({ path: "./node_modules/zenn-content-css/lib/index.css" }));
app.use("/static/*", serveStatic({ root: "./public/", rewriteRequestPath: (path) => path.replace("/static", "") }));

// ルート登録
app.route("/", pageRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/graph", graphRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/upload", uploadRoutes);

export { app };
