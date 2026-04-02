import type { PreTrainedModel, PreTrainedTokenizer } from "@huggingface/transformers";
import type { IEmbeddingProvider } from "../../application/port/embedding-provider";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private model: PreTrainedModel | null = null;
  private tokenizer: PreTrainedTokenizer | null = null;
  private loading: Promise<void> | null = null;
  private tagCache = new Map<string, Float32Array>();
  private segmenter = new Intl.Segmenter("ja", { granularity: "word" });

  private async ensureLoaded(): Promise<{ model: PreTrainedModel; tokenizer: PreTrainedTokenizer }> {
    if (this.model && this.tokenizer) return { model: this.model, tokenizer: this.tokenizer };
    if (!this.loading) {
      this.loading = (async () => {
        const { AutoModel, AutoTokenizer, env } = await import("@huggingface/transformers");
        env.allowRemoteModels = true;
        env.allowLocalModels = true;
        this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
        this.model = await AutoModel.from_pretrained(MODEL_ID, { dtype: "q8" });
        console.log(`Embedding model loaded: ${MODEL_ID} (q8)`);
      })();
    }

    await this.loading;
    if (!this.model || !this.tokenizer) throw new Error("Failed to load embedding model");
    return { model: this.model, tokenizer: this.tokenizer };
  }

  private async embed(text: string): Promise<Float32Array> {
    const { model, tokenizer } = await this.ensureLoaded();
    const inputs = await tokenizer(text, { padding: true });
    const output = await model(inputs);
    return new Float32Array(output.sentence_embedding.data as Float64Array);
  }

  async preload(): Promise<void> {
    await this.ensureLoaded();
  }

  async embedPassage(text: string): Promise<Float32Array> {
    return this.embed(`title: none | text: ${text}`);
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const cached = this.tagCache.get(tagName);
    if (cached) return cached;

    const emb = await this.embed(`task: search result | query: ${tagName}`);
    this.tagCache.set(tagName, emb);
    return emb;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    for (const name of tagNames) {
      await this.embedTag(name);
    }
    console.log(`Tag embedding cache built: ${tagNames.length} tags`);
  }

  async tokenize(text: string): Promise<string[]> {
    return [...this.segmenter.segment(text)].filter((seg) => seg.isWordLike).map((seg) => seg.segment);
  }
}
