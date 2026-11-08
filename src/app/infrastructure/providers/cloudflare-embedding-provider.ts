import type { IEmbeddingProvider } from "../../application/port/embedding-provider";

// EmbeddingGemma の prefix は Qwen に流用しない。ノートは documents、タグは
// instruction 付き queries として渡す (text は documents の別名)。
// https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/schema-input.json
const MODEL_ID = "@cf/qwen/qwen3-embedding-0.6b";
const QUERY_INSTRUCTION = "Given a topic, retrieve relevant notes about that topic";
const EMBEDDING_DIMENSIONS = 1024;
const BATCH_SIZE = 32;

export class CloudflareEmbeddingProvider implements IEmbeddingProvider {
  private tagCache = new Map<string, Float32Array>();

  constructor(
    private accountId: string,
    private apiToken: string,
  ) {}

  async load(): Promise<void> {
    // この provider は API ベースのためロードは不要
  }

  async embedNote(text: string): Promise<Float32Array> {
    const [embedding] = await this.embed([text], "documents");
    return embedding;
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const cached = this.tagCache.get(tagName);
    if (cached) return cached;

    const [embedding] = await this.embed([tagName], "queries");
    this.tagCache.set(tagName, embedding);
    return embedding;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    if (tagNames.length === 0) return;

    for (let i = 0; i < tagNames.length; i += BATCH_SIZE) {
      const batch = tagNames.slice(i, i + BATCH_SIZE);
      const embeddings = await this.embed(batch, "queries");
      for (let j = 0; j < batch.length; j++) {
        this.tagCache.set(tagNames[i + j], embeddings[j]);
      }
    }
  }

  private async embed(texts: string[], kind: "documents" | "queries"): Promise<Float32Array[]> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${MODEL_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        [kind]: texts,
        ...(kind === "queries" ? { instruction: QUERY_INSTRUCTION } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Cloudflare Workers AI error: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { success?: boolean; result?: { data?: unknown } } | null;
    if (json?.success === false) throw new Error("Cloudflare Workers AI: inference failed");
    const data = json?.result?.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new Error(
        `Cloudflare Workers AI: expected ${texts.length} embeddings, got ${
          Array.isArray(data) ? data.length : typeof data
        }`,
      );
    }
    return data.map((arr: unknown) => {
      if (
        !Array.isArray(arr) ||
        arr.length !== EMBEDDING_DIMENSIONS ||
        !arr.every((value) => typeof value === "number" && Number.isFinite(value))
      ) {
        throw new Error(`Cloudflare Workers AI: expected a finite ${EMBEDDING_DIMENSIONS}-dimensional embedding`);
      }
      const norm = Math.hypot(...arr);
      if (!Number.isFinite(norm) || norm === 0) {
        throw new Error("Cloudflare Workers AI: invalid embedding norm");
      }
      // suggestTags の内積が cosine similarity になるよう、API の正規化有無に依存しない。
      return Float32Array.from(arr, (value) => value / norm);
    });
  }
}
