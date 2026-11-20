import { expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { createApp } from "../..";
import { loadConfig } from "../../config";
import {
  createEmbeddingProvider,
  createGraphRepository,
  createNoteRepository,
  createStorageProvider,
  createTagRepository,
} from "../../infrastructure/container";
import { createDb } from "../../infrastructure/db";
import { notes } from "../../infrastructure/db/schema";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const noteRepo = createNoteRepository(config);
const app = createApp(
  noteRepo,
  createTagRepository(config),
  createGraphRepository(config),
  createStorageProvider(config),
  createEmbeddingProvider(config),
);

function pin(id: number, pinned: string) {
  return app.request(`/api/notes/${id}/pin`, {
    method: "PUT",
    headers: { Origin: "http://localhost" },
    body: new URLSearchParams({ pinned }),
  });
}

function cardIds(html: string) {
  return Array.from(html.matchAll(/id="note-(\d+)"/g), (match) => Number(match[1]));
}

test("pinning a note moves it above newer notes until it is unpinned", async () => {
  const older = await noteRepo.create("Older", "Body");
  const newer = await noteRepo.create("Newer", "Body");
  try {
    // Repeating a request after a lost response must preserve the requested state.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await pin(older.id, "true");
      expect(res.status).toBe(200);
      expect(cardIds(await res.text()).slice(0, 2)).toEqual([older.id, newer.id]);
    }
    expect(await noteRepo.findById(older.id)).toEqual({ ...older, pinned: true });
    expect(cardIds(await (await app.request("/")).text()).slice(0, 2)).toEqual([older.id, newer.id]);
    const card = await (await app.request(`/api/notes/${older.id}/card`)).text();
    expect(card).toContain('aria-pressed="true"');
    expect(card).toContain("ピン留めを解除");

    expect((await pin(older.id, "invalid")).status).toBe(400);
    expect((await pin(older.id, "false")).status).toBe(200);
    expect(await noteRepo.findById(older.id)).toEqual(older);
    const unpinnedCard = await (await app.request(`/api/notes/${older.id}/card`)).text();
    expect(unpinnedCard).toContain('aria-pressed="false"');
    expect(cardIds(await (await app.request("/")).text()).slice(0, 2)).toEqual([newer.id, older.id]);
  } finally {
    await db.delete(notes).where(inArray(notes.id, [older.id, newer.id]));
  }
  expect((await pin(older.id, "true")).status).toBe(404);
});

test("pagination continues across both groups when pins fill the first page", async () => {
  const rows = await db
    .insert(notes)
    .values(
      Array.from({ length: 102 }, (_, index) => ({ title: "Page boundary", body: "Body", pinned: index % 2 === 0 })),
    )
    .returning({ id: notes.id });
  const ids = rows.map((row) => row.id);
  try {
    // Alternating the groups makes an ID-only cursor skip newer unpinned notes.
    const expected = [0, 1].flatMap((parity) => ids.filter((_, index) => index % 2 === parity).reverse());
    let html = await (await app.request("/")).text();
    const seen = cardIds(html);
    for (let page = 0; page < 2; page++) {
      const url = html.match(/hx-get="(\/api\/notes\?cursor=[^"]+)"/)?.[1];
      if (!url) throw new Error("Missing next page");
      const response = await app.request(url.replaceAll("&amp;", "&"));
      expect(response.status).toBe(200);
      html = await response.text();
      seen.push(...cardIds(html));
    }
    expect(seen.filter((id) => ids.includes(id))).toEqual(expected);
  } finally {
    await db.delete(notes).where(inArray(notes.id, ids));
  }
});
