import { createApp } from "./app";
import { initialize } from "./app/application/initialize";
import { createWebDeps } from "./app/infrastructure/container";

const deps = createWebDeps();

initialize(deps.embeddingProvider, deps.tagRepository).catch((err) => {
  console.error("Initialization failed:", err);
  process.exit(1);
});

const app = createApp(deps);

export default {
  fetch: app.fetch,
};
