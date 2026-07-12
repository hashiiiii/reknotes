// LocalEmbeddingProvider (proxy) と対になる Bun Worker。
// モデルのロードと推論はメインスレッドを飢餓させるため、この worker 内に隔離する (issue #178)。
import type { PreTrainedModel, PreTrainedTokenizer } from "@huggingface/transformers";

declare var self: Worker;

// モデルに与えるノートとタグにそれぞれ prefix をつける必要がある
// これがついた状態でベクトル変換されることで、ノートとタグの類似度比較が正しく機能する
const NOTE_PREFIX = "title: none | text: ";
const TAG_PREFIX = "task: search result | query: ";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";

export type EmbeddingWorkerCommand =
  | { kind: "load" }
  | { kind: "embedNote"; text: string }
  | { kind: "embedTag"; tagName: string }
  | { kind: "buildTagCache"; tagNames: string[] };

export type EmbeddingWorkerRequest = EmbeddingWorkerCommand & { id: number };

// embedding は structured clone でコピーされて返る (キャッシュ済み Float32Array を transfer すると detach されるため転送はしない)
export type EmbeddingWorkerResponse =
  | { id: number; ok: true; embedding?: Float32Array }
  | { id: number; ok: false; message: string };

let model: PreTrainedModel | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
let loading: Promise<void> | null = null;
const tagCache = new Map<string, Float32Array>();

async function ensureLoaded(): Promise<{ model: PreTrainedModel; tokenizer: PreTrainedTokenizer }> {
  if (!loading) {
    loading = (async () => {
      const { AutoModel, AutoTokenizer, env } = await import("@huggingface/transformers");
      // ローカルキャッシュがあればそれを使う
      env.allowLocalModels = true;
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
      // reknotes ではタグの自動提案に embedding モデルを利用しており
      // タグ候補とノート全体の類似度が高いものをいくつか採用するというプロトコル
      // 量子化による細かい数値のズレが影響するほど厳密なものではないため 8 bit で十分
      model = await AutoModel.from_pretrained(MODEL_ID, { dtype: "q8" });
      console.log(`Embedding model loaded: ${MODEL_ID} (q8)`);
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }

  await loading;

  // type narrowing のため必要
  if (!model || !tokenizer) throw new Error("Failed to load embedding model");
  return { model, tokenizer };
}

// 入力をベクトル変換する
async function embed(text: string): Promise<Float32Array> {
  const loaded = await ensureLoaded();
  const inputs = await loaded.tokenizer(text);
  const output = await loaded.model(inputs);
  return Float32Array.from(output.sentence_embedding.data as ArrayLike<number>);
}

async function embedTag(tagName: string): Promise<Float32Array> {
  const cached = tagCache.get(tagName);
  if (cached) return cached;

  const embedding = await embed(`${TAG_PREFIX}${tagName}`);
  tagCache.set(tagName, embedding);
  return embedding;
}

async function handle(request: EmbeddingWorkerRequest): Promise<EmbeddingWorkerResponse> {
  switch (request.kind) {
    case "load":
      await ensureLoaded();
      return { id: request.id, ok: true };
    case "embedNote":
      return { id: request.id, ok: true, embedding: await embed(`${NOTE_PREFIX}${request.text}`) };
    case "embedTag":
      return { id: request.id, ok: true, embedding: await embedTag(request.tagName) };
    case "buildTagCache": {
      for (const name of request.tagNames) {
        await embedTag(name);
      }
      return { id: request.id, ok: true };
    }
  }
}

self.onmessage = async (event: MessageEvent<EmbeddingWorkerRequest>) => {
  try {
    postMessage(await handle(event.data));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    postMessage({ id: event.data.id, ok: false, message } satisfies EmbeddingWorkerResponse);
  }
};
