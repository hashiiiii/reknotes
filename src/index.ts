import { app } from "./app";
import { initialize } from "./app/application/initialize";
import { embeddingProvider, tagRepository } from "./app/infrastructure/container";

initialize(embeddingProvider, tagRepository).catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});

export default {
  fetch: app.fetch,
};
