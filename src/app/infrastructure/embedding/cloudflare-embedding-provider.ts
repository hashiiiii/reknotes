import { type IEmbeddingProvider, PASSAGE_PREFIX, QUERY_PREFIX } from "../../application/port/embedding-provider";

const MODEL = "@cf/google/embeddinggemma-300m";

export class CloudflareEmbeddingProvider implements IEmbeddingProvider {
  private accountId: string;
  private apiToken: string;
  private tagCache = new Map<string, Float32Array>();
  private segmenter = new Intl.Segmenter("ja", { granularity: "word" });

  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
    if (!this.accountId || !this.apiToken) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
    }
  }

  async preload(): Promise<void> {
    // API ベースのため事前ロード不要。接続確認として空リクエストを送る
    await this.embed(["ping"]);
    console.log(`Embedding model ready: Cloudflare Workers AI ${MODEL}`);
  }

  async embedPassage(text: string): Promise<Float32Array> {
    const [embedding] = await this.embed([`${PASSAGE_PREFIX}${text}`]);
    return embedding;
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const cached = this.tagCache.get(tagName);
    if (cached) return cached;

    const [embedding] = await this.embed([`${QUERY_PREFIX}${tagName}`]);
    this.tagCache.set(tagName, embedding);
    return embedding;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    if (tagNames.length === 0) return;

    // バッチで一括取得（API は最大100件）
    const prefixed = tagNames.map((name) => `${QUERY_PREFIX}${name}`);
    for (let i = 0; i < prefixed.length; i += 100) {
      const batch = prefixed.slice(i, i + 100);
      const embeddings = await this.embed(batch);
      for (let j = 0; j < batch.length; j++) {
        this.tagCache.set(tagNames[i + j], embeddings[j]);
      }
    }
    console.log(`Tag embedding cache built: ${tagNames.length} tags`);
  }

  async tokenize(text: string): Promise<string[]> {
    // Intl.Segmenter で日本語対応の分かち書き
    return [...this.segmenter.segment(text)].filter((seg) => seg.isWordLike).map((seg) => seg.segment);
  }

  private async embed(texts: string[]): Promise<Float32Array[]> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
    });

    if (!res.ok) {
      throw new Error(`Cloudflare Workers AI error: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { result?: { data?: unknown } };
    const data = json.result?.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new Error(
        `Cloudflare Workers AI: expected ${texts.length} embeddings, got ${
          Array.isArray(data) ? data.length : typeof data
        }`,
      );
    }
    return data.map((arr: number[]) => new Float32Array(arr));
  }
}
