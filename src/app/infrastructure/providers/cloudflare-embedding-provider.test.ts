import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import { CloudflareEmbeddingProvider } from "./cloudflare-embedding-provider";

function vector(): number[] {
  const values = Array<number>(1024).fill(0);
  values[0] = 3;
  values[1] = 4;
  return values;
}

// These contract tests cover the Cloudflare response envelope and Qwen schema
// without invoking the paid external API.
const fetchSpy = spyOn(globalThis, "fetch");
afterEach(() => fetchSpy.mockReset());
afterAll(() => fetchSpy.mockRestore());

function respond(data: unknown, success = true) {
  fetchSpy.mockResolvedValueOnce(Response.json({ success, result: { data } }));
}

function requestBody(index = 0): Record<string, unknown> {
  return JSON.parse(String(fetchSpy.mock.calls[index][1]?.body));
}

describe("CloudflareEmbeddingProvider", () => {
  test("sends notes as Qwen documents and normalizes the result", async () => {
    respond([vector()]);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    const embedding = await provider.embedNote("日本語のノート");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/qwen/qwen3-embedding-0.6b",
    );
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("POST");
    expect(fetchSpy.mock.calls[0][1]?.headers).toEqual({
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    });
    expect(requestBody()).toEqual({ documents: ["日本語のノート"] });
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(1024);
    expect(embedding[0]).toBeCloseTo(0.6);
    expect(embedding[1]).toBeCloseTo(0.8);
    expect(Math.hypot(...embedding)).toBeCloseTo(1);
  });

  test("sends tags as instructed queries and reuses cached embeddings", async () => {
    respond([vector()]);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    const first = await provider.embedTag("計算量");
    const second = await provider.embedTag("計算量");

    expect(requestBody()).toEqual({
      queries: ["計算量"],
      instruction: "Given a topic, retrieve relevant notes about that topic",
    });
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("warms the cache in batches of at most 32 queries", async () => {
    respond(Array.from({ length: 32 }, vector));
    respond(Array.from({ length: 32 }, vector));
    respond([vector()]);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    const tags = Array.from({ length: 65 }, (_, i) => `タグ${i}`);
    await provider.buildTagCache(tags);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      expect(requestBody(i)).toEqual({
        queries: tags.slice(i * 32, (i + 1) * 32),
        instruction: "Given a topic, retrieve relevant notes about that topic",
      });
    }
    for (const tag of tags) expect((await provider.embedTag(tag))[0]).toBeCloseTo(0.6);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("does not call the API when loading or warming an empty cache", async () => {
    const provider = new CloudflareEmbeddingProvider("account", "token");
    await provider.load();
    await provider.buildTagCache([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("propagates HTTP errors", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("model unavailable", { status: 410 }));
    const provider = new CloudflareEmbeddingProvider("account", "token");
    await expect(provider.embedNote("本文")).rejects.toThrow("Cloudflare Workers AI error: 410");
  });

  test("rejects responses with success: false", async () => {
    respond([vector()], false);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    await expect(provider.embedNote("本文")).rejects.toThrow("inference failed");
  });

  test.each([
    { name: "missing", data: undefined },
    { name: "null", data: null },
    { name: "empty", data: [] },
    { name: "too many", data: [vector(), vector()] },
  ])("rejects mismatched result counts: $name", async ({ data }) => {
    respond(data);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    await expect(provider.embedNote("本文")).rejects.toThrow("expected 1 embeddings");
  });

  test.each([
    { name: "null", invalid: null },
    { name: "empty", invalid: [] },
    { name: "wrong dimensions", invalid: [1, 2] },
    { name: "strings", invalid: Array(1024).fill("1") },
    { name: "null values", invalid: Array(1024).fill(null) },
  ])("rejects invalid vectors without poisoning the cache: $name", async ({ invalid }) => {
    respond([invalid]);
    respond([vector()]);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    await expect(provider.embedTag("計算量")).rejects.toThrow("1024-dimensional embedding");
    expect((await provider.embedTag("計算量"))[0]).toBeCloseTo(0.6);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("rejects zero vectors", async () => {
    respond([Array(1024).fill(0)]);
    const provider = new CloudflareEmbeddingProvider("account", "token");
    await expect(provider.embedNote("本文")).rejects.toThrow("invalid embedding norm");
  });
});
