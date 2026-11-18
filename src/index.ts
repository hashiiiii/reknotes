import { createApp } from "./app";
import { preloadTagCache } from "./app/application/embedding/preload-tag-cache";
import { loadConfig } from "./app/config";
import {
  createEmbeddingProvider,
  createGraphRepository,
  createNoteRepository,
  createStorageProvider,
  createTagRepository,
} from "./app/infrastructure/container";

const config = loadConfig();

const noteRepository = createNoteRepository(config);
const tagRepository = createTagRepository(config);
const graphRepository = createGraphRepository(config);
const storageProvider = createStorageProvider(config);
const embeddingProvider = createEmbeddingProvider(config);

preloadTagCache(embeddingProvider, tagRepository).catch((err) => {
  console.error("Failed to preload tag cache:", err);
  process.exit(1);
});

const app = createApp(noteRepository, tagRepository, graphRepository, storageProvider, embeddingProvider);

export default {
  // Local deployments have no authentication and must listen on loopback.
  hostname: config.deployment === "local" ? "127.0.0.1" : "0.0.0.0",
  fetch: app.fetch,
};
