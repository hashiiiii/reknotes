import { createApp } from "./app";
import { initialize } from "./app/application/initialize";
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

initialize(embeddingProvider, tagRepository).catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});

const app = createApp(noteRepository, tagRepository, graphRepository, storageProvider, embeddingProvider);

export default {
  fetch: app.fetch,
};
