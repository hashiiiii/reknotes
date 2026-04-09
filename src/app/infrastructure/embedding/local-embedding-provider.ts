import type { PreTrainedModel, PreTrainedTokenizer } from "@huggingface/transformers";
import { NOTE_PREFIX, TAG_PREFIX } from "../../application/port/embedding-prefix";
import type { IEmbeddingProvider } from "../../application/port/embedding-provider";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private model: PreTrainedModel | null = null;
  private tokenizer: PreTrainedTokenizer | null = null;
  private loading: Promise<void> | null = null;
  private tagCache = new Map<string, Float32Array>();
  private segmenter = new Intl.Segmenter("ja", { granularity: "word" });

  private async ensureLoaded(): Promise<{ model: PreTrainedModel; tokenizer: PreTrainedTokenizer }> {
    if (!this.loading) {
      this.loading = (async () => {
        const { AutoModel, AutoTokenizer, env } = await import("@huggingface/transformers");
        // ローカルキャッシュがあればそれを使う
        env.allowLocalModels = true;
        this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
        // reknotes ではタグの自動提案に embedding モデルを利用しており
        // タグ候補とノート全体の類似度が高いものをいくつか採用するというプロトコル
        // 量子化による細かい数値のズレが影響するほど厳密なものではないため 8 bit で十分
        this.model = await AutoModel.from_pretrained(MODEL_ID, { dtype: "q8" });
        console.log(`Embedding model loaded: ${MODEL_ID} (q8)`);
      })().catch((err) => {
        this.loading = null;
        throw err;
      });
    }

    await this.loading;

    // type narrowing のため必要
    if (!this.model || !this.tokenizer) throw new Error("Failed to load embedding model");
    return { model: this.model, tokenizer: this.tokenizer };
  }

  // 入力をベクトル変換する
  private async embed(text: string): Promise<Float32Array> {
    const { model, tokenizer } = await this.ensureLoaded();
    const inputs = await tokenizer(text);
    const output = await model(inputs);
    return Float32Array.from(output.sentence_embedding.data as ArrayLike<number>);
  }

  async preload(): Promise<void> {
    await this.ensureLoaded();
  }

  async embedNote(text: string): Promise<Float32Array> {
    return this.embed(`${NOTE_PREFIX}${text}`);
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const cached = this.tagCache.get(tagName);
    if (cached) return cached;

    const emb = await this.embed(`${TAG_PREFIX}${tagName}`);
    this.tagCache.set(tagName, emb);
    return emb;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    for (const name of tagNames) {
      await this.embedTag(name);
    }
  }

  async tokenize(text: string): Promise<string[]> {
    return [...this.segmenter.segment(text)].filter((seg) => seg.isWordLike).map((seg) => seg.segment);
  }
}
