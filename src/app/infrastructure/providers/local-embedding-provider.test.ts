import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { LocalEmbeddingProvider } from "./local-embedding-provider";

// 実モデル (~300MB) が必要なテスト。ローカルの HuggingFace キャッシュがあるときだけ実行する。
// CI にはキャッシュが無く、毎回ダウンロードさせるのは重すぎるため明示的に skip する。
const MODEL_CACHED = existsSync("node_modules/@huggingface/transformers/.cache/onnx-community");

// モデルロードを含むため各テストのタイムアウトを長めに取る
const TEST_TIMEOUT = 120_000;

describe.skipIf(!MODEL_CACHED)("LocalEmbeddingProvider", () => {
  const provider = new LocalEmbeddingProvider();

  test(
    "embedNote がベクトルを返す",
    async () => {
      await provider.load();
      const embedding = await provider.embedNote("TypeScript と Bun でノートアプリを作る話");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  test(
    "embedTag は同じタグ名に対して同じベクトルを返す",
    async () => {
      const first = await provider.embedTag("typescript");
      const second = await provider.embedTag("typescript");
      expect(Array.from(second)).toEqual(Array.from(first));
    },
    TEST_TIMEOUT,
  );

  test(
    "推論中もメインスレッドのイベントループが応答し続ける",
    async () => {
      await provider.load();

      // suggestTags 相当の負荷 (ノート全文 1 回 + 候補語 40 個の逐次 embed) をかけ、
      // 20ms 間隔のタイマーの遅延でイベントループの飢餓を計測する。
      // 推論がメインスレッドで走る実装では maxGap ~800ms / totalDelay ~2500ms になる (issue #178 の実測)。
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
