import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { LocalEmbeddingProvider } from "./local-embedding-provider";

// Real-model tests require about 300 MB of cached weights. Skip them without a
// HuggingFace cache so CI does not download the model on every run.
const MODEL_CACHED = existsSync("node_modules/@huggingface/transformers/.cache/onnx-community");

// Model loading needs more time than the default test timeout allows.
const TEST_TIMEOUT = 120_000;

// Worker failure paths need no model and must run in CI too.
describe("LocalEmbeddingProvider worker failures", () => {
  const brokenUrl = new URL("./does-not-exist-worker.ts", import.meta.url);

  test("rejects requests without hanging when worker startup fails", async () => {
    const provider = new LocalEmbeddingProvider(brokenUrl);
    await expect(provider.embedNote("テキスト")).rejects.toThrow();
  });

  test("rejects later requests without hanging after worker failure", async () => {
    // Retaining the failed worker would leave the second request waiting forever.
    const provider = new LocalEmbeddingProvider(brokenUrl);
    await expect(provider.embedNote("一度目")).rejects.toThrow();
    await expect(provider.embedNote("二度目")).rejects.toThrow();
  });

  test("recovers from a worker crash on the next request", async () => {
    // One crash must fail the pending request without disabling tagging until a server restart.
    const provider = new LocalEmbeddingProvider(new URL("./flaky-embedding-worker.fixture.ts", import.meta.url));
    await expect(provider.embedNote("crash")).rejects.toThrow();
    const embedding = await provider.embedNote("ok");
    expect(Array.from(embedding)).toEqual([1, 2, 3]);
  });
});

describe.skipIf(!MODEL_CACHED)("LocalEmbeddingProvider", () => {
  const provider = new LocalEmbeddingProvider();

  test(
    "embedNote returns a vector",
    async () => {
      await provider.load();
      const embedding = await provider.embedNote("TypeScript と Bun でノートアプリを作る話");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  test(
    "embedTag returns the same vector for the same tag",
    async () => {
      const first = await provider.embedTag("typescript");
      const second = await provider.embedTag("typescript");
      expect(Array.from(second)).toEqual(Array.from(first));
    },
    TEST_TIMEOUT,
  );

  test(
    "keeps the main event loop responsive during inference",
    async () => {
      await provider.load();

      // One note and 40 sequential tag embeddings approximate suggestion work.
      // A 20 ms timer measures event-loop starvation. Earlier main-thread inference
      // measurements reached maxGap ~800 ms and totalDelay ~2500 ms (issue #178).
      const noteText =
        "ホーナー法による多項式計算の最適化について調べた。計算量を減らすために乗算の回数を削減する手法で、TypeScript で実装すると再帰よりループの方が速かった。".repeat(
          4,
        );
      const candidates = Array.from({ length: 40 }, (_, i) => `候補語その${i}や計算量${i}最適化${i}`);

      let last = performance.now();
      let maxGap = 0;
      let totalDelay = 0;
      const timer = setInterval(() => {
        const now = performance.now();
        const gap = now - last;
        maxGap = Math.max(maxGap, gap);
        totalDelay += Math.max(0, gap - 20);
        last = now;
      }, 20);

      await provider.embedNote(noteText.slice(0, 512));
      for (const candidate of candidates) {
        await provider.embedTag(candidate);
      }

      clearInterval(timer);
      expect(maxGap).toBeLessThan(150);
      expect(totalDelay).toBeLessThan(500);
    },
    TEST_TIMEOUT,
  );
});
