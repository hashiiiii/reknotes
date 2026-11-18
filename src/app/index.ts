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
import { createNoteRoutes } from "./presentation/routes/notes";
import { pageRoutes } from "./presentation/routes/pages";
import { searchRoutes } from "./presentation/routes/search";
import { createUploadRoutes } from "./presentation/routes/upload";

const viewsDir = join(import.meta.dir, "presentation/views");
// Escape template output by default; intentional HTML must opt in with `| raw`.
const engine = new Liquid({
  root: viewsDir,
  layouts: join(viewsDir, "layouts"),
  partials: join(viewsDir, "partials"),
  extname: ".liquid",
  cache: true,
  outputEscape: "escape",
});

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
  // Uploads have their own 50 MiB limit; the global limit would reject them first.
  const globalBodyLimit = bodyLimit({ maxSize: 1 * 1024 * 1024 });
  app.use((c, next) => (c.req.path.startsWith("/api/upload") ? next() : globalBodyLimit(c, next)));
  app.use(secureHeaders());

  app.use("*", async (c, next) => {
    c.set("noteRepository", noteRepository);
    c.set("tagRepository", tagRepository);
    c.set("graphRepository", graphRepository);
    c.set("storageProvider", storageProvider);
    c.set("embeddingProvider", embeddingProvider);
    await next();
  });

  app.use("*", async (c, next) => {
    c.set("render", async (template: string, data: Record<string, unknown> = {}) => {
      return engine.renderFile(`pages/${template}`, {
        ...data,
        currentPath: c.req.path,
      });
    });
    await next();
  });

  app.use("/static/*", serveStatic({ root: "./dist/", rewriteRequestPath: (path) => path.replace("/static", "") }));

  app.route("/", pageRoutes);
  app.route("/api/notes", createNoteRoutes());
  app.route("/api/search", searchRoutes);
  app.route("/api/graph", graphRoutes);
  app.route("/api/upload", createUploadRoutes());
  app.route("/api/files", fileRoutes);

  // Unexpected failures must not expose internal exception details to clients.
  app.onError((err, c) => {
    // Preserve deliberate HTTP errors rather than converting them to server errors.
    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    // The request ID links a generic client error to its full server-side trace.
    const requestId = c.get("requestId");
    console.error(JSON.stringify({ level: "error", requestId, msg: err.message, stack: err.stack }));

    const { status, contentType, body } = buildErrorResponse(err, {
      requestId,
      isApi: c.req.path.startsWith("/api"),
    });
    return c.body(body, status as ContentfulStatusCode, { "Content-Type": contentType });
  });

  return app;
}
