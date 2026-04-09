import type { IEmbeddingProvider } from "../../application/port/embedding-provider";

// モデルに与えるノートとタグにそれぞれ prefix をつける必要がある
// これがついた状態でベクトル変換されることで、ノートとタグの類似度比較が正しく機能する
const NOTE_PREFIX = "title: none | text: ";
const TAG_PREFIX = "task: search result | query: ";

const MODEL_ID = "@cf/google/embeddinggemma-300m";

export class CloudflareEmbeddingProvider implements IEmbeddingProvider {
  private tagCache = new Map<string, Float32Array>();
  private segmenter = new Intl.Segmenter("ja", { granularity: "word" });

  constructor(
    private accountId: string,
    private apiToken: string,
  ) {}

  async preload(): Promise<void> {
    // この provider は API ベースのため事前ロードは不要
  }

  async embedNote(text: string): Promise<Float32Array> {
    const [embedding] = await this.embed([`${NOTE_PREFIX}${text}`]);
    return embedding;
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const cached = this.tagCache.get(tagName);
    if (cached) return cached;

    const [embedding] = await this.embed([`${TAG_PREFIX}${tagName}`]);
    this.tagCache.set(tagName, embedding);
    return embedding;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    if (tagNames.length === 0) return;

    // バッチで一括取得（API は最大100件）
    const prefixed = tagNames.map((name) => `${TAG_PREFIX}${name}`);
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
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${MODEL_ID}`;
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
