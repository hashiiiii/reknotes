import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { IEmbeddingService } from "../../domain/embedding/embedding-service";

const MODEL_NAME = "Xenova/multilingual-e5-small";

export class HuggingFaceEmbeddingService implements IEmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private loading: Promise<FeatureExtractionPipeline> | null = null;
  private tagCache = new Map<string, Float32Array>();

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (this.extractor) return this.extractor;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowRemoteModels = true;
      env.allowLocalModels = true;
      // @ts-expect-error -- pipeline() overloads produce a union too complex for TS
      this.extractor = await pipeline("feature-extraction", MODEL_NAME, { dtype: "fp32" });
      console.log(`Embedding model loaded: ${MODEL_NAME}`);
      return this.extractor;
    })();

    return this.loading;
  }

  async preload(): Promise<void> {
    await this.getExtractor();
  }

  async embedPassage(text: string): Promise<Float32Array> {
    const ext = await this.getExtractor();
    const output = await ext(`passage: ${text}`, { pooling: "mean", normalize: true });
    return new Float32Array(output.data as Float64Array);
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const cached = this.tagCache.get(tagName);
    if (cached) return cached;

    const ext = await this.getExtractor();
    const output = await ext(`query: ${tagName}`, { pooling: "mean", normalize: true });
    const emb = new Float32Array(output.data as Float64Array);
    this.tagCache.set(tagName, emb);
    return emb;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    for (const name of tagNames) {
      await this.embedTag(name);
    }
    console.log(`Tag embedding cache built: ${tagNames.length} tags`);
  }

  clearTagCache(): void {
    this.tagCache.clear();
  }
}
