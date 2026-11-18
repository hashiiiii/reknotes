import { expect, test } from "bun:test";
import { createApp } from "../..";
import { loadConfig } from "../../config";
import {
  createEmbeddingProvider,
  createGraphRepository,
  createNoteRepository,
  createStorageProvider,
  createTagRepository,
} from "../../infrastructure/container";

test.each([
  { path: "/api/upload", limit: 10, status: 400 },
  { path: "/api/notes", limit: 30, status: 400 },
  { path: "/api/notes/preview", limit: 60, status: 200 },
])("$path cannot bypass its limit with forged forwarding headers", async ({ path, limit, status }) => {
  const config = loadConfig();
  const app = createApp(
    createNoteRepository(config),
    createTagRepository(config),
    createGraphRepository(config),
    createStorageProvider(config),
    createEmbeddingProvider(config),
  );

  // Empty input exercises the real HTTP middleware without storing notes or files.
  // Every request claims a different address, as an attacker could do directly.
  for (let i = 0; i <= limit; i++) {
    const response = await app.request(path, {
      method: "POST",
      headers: { Origin: "http://localhost", "X-Forwarded-For": `192.0.2.${i + 1}` },
      body: new URLSearchParams({ body: "" }),
    });
    expect(response.status).toBe(i === limit ? 429 : status);
  }
});
