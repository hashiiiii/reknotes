import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { compress } from "hono/compress";
import { csrf } from "hono/csrf";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Liquid } from "liquidjs";
import { buildErrorResponse } from "./_error-handler";
import type { IEmbeddingProvider } from "./application/port/embedding-provider";
import type { IStorageProvider } from "./application/port/storage-provider";
import type { IGraphRepository } from "./domain/graph/graph-repository";
import type { INoteRepository } from "./domain/note/note-repository";
import type { ITagRepository } from "./domain/tag/tag-repository";
import { fileRoutes } from "./presentation/routes/files";
import { graphRoutes } from "./presentation/routes/graph";
import { noteRoutes } from "./presentation/routes/notes";
import { pageRoutes } from "./presentation/routes/pages";
import { searchRoutes } from "./presentation/routes/search";
import { uploadRoutes } from "./presentation/routes/upload";

// LiquidJS エンジン初期化
const viewsDir = join(import.meta.dir, "presentation/views");
// outputEscape: 'escape' を有効化してテンプレ全体をデフォルト HTML エスケープ。
// 意図的に HTML を出力したい変数は `| raw` を明示する。
const engine = new Liquid({
  root: viewsDir,
  layouts: join(viewsDir, "layouts"),
  partials: join(viewsDir, "partials"),
  extname: ".liquid",
  cache: true,
  outputEscape: "escape",
});

// LiquidJS のカスタムフィルター
// unixtime から "YYYY/MM/DD HH:mm" 形式の日時文字列を生成するフィルター
engine.registerFilter("formatDate", (timestamp: number) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

export type AppEnv = {
  Variables: {
    render: (template: string, data?: Record<string, unknown>) => Promise<string>;
    requestId: string;
    noteRepository: INoteRepository;
    tagRepository: ITagRepository;
    graphRepository: IGraphRepository;
    storageProvider: IStorageProvider;
    embeddingProvider: IEmbeddingProvider;
  };
};

export { engine };

export function createApp(
  noteRepository: INoteRepository,
  tagRepository: ITagRepository,
  graphRepository: IGraphRepository,
  storageProvider: IStorageProvider,
  embeddingProvider: IEmbeddingProvider,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(logger());
  app.use(requestId());
  app.use(csrf());
  app.use(compress());
  app.use(timeout(30_000));
  app.use(etag());
  // /api/upload は upload route 側で 50MB の bodyLimit を bind しているので、
  // こちらは除外する (グローバル制限を先に評価すると小さい上限で 413 になる)
  const globalBodyLimit = bodyLimit({ maxSize: 1 * 1024 * 1024 });
  app.use((c, next) => (c.req.path.startsWith("/api/upload") ? next() : globalBodyLimit(c, next)));
  app.use(secureHeaders());

  // ルーティングで利用するリポジトリやプロバイダをコンテキストに登録するミドルウェア
  app.use("*", async (c, next) => {
    c.set("noteRepository", noteRepository);
    c.set("tagRepository", tagRepository);
    c.set("graphRepository", graphRepository);
    c.set("storageProvider", storageProvider);
    c.set("embeddingProvider", embeddingProvider);
    await next();
  });

  // LiquidJS のレンダリングミドルウェア
  app.use("*", async (c, next) => {
    c.set("render", async (template: string, data: Record<string, unknown> = {}) => {
      return engine.renderFile(`pages/${template}`, {
        ...data,
        currentPath: c.req.path,
      });
    });
    await next();
  });

  // 静的ファイル配信（dist/ からビルド済みアセットを配信）
  app.use("/static/*", serveStatic({ root: "./dist/", rewriteRequestPath: (path) => path.replace("/static", "") }));

  // ルート登録
  app.route("/", pageRoutes);
  app.route("/api/notes", noteRoutes);
  app.route("/api/search", searchRoutes);
  app.route("/api/graph", graphRoutes);
  app.route("/api/upload", uploadRoutes);
  app.route("/api/files", fileRoutes);

  // グローバルエラーハンドラ。
  // 未設定だと Hono のデフォルトハンドラが例外メッセージ/スタックをクライアントに
  // 漏らし得るため、ここで一括して握り潰し、汎用 500 のみを返す。
  app.onError((err, c) => {
    // HTTPException は意図的に投げられたステータスを尊重してそのまま返す。
    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    // 想定外の例外はサーバ側に requestId とフルスタックを構造化ログとして残す。
    const requestId = c.get("requestId");
    console.error(JSON.stringify({ level: "error", requestId, msg: err.message, stack: err.stack }));

    // クライアントにはスタックや元メッセージを含まない汎用 500 を返す。
    const { status, contentType, body } = buildErrorResponse(err, {
      requestId,
      isApi: c.req.path.startsWith("/api"),
    });
    return c.body(body, status as ContentfulStatusCode, { "Content-Type": contentType });
  });

  return app;
}
