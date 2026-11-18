// Model loading and inference stay in this worker to keep the main thread responsive (issue #178).
import type { PreTrainedModel, PreTrainedTokenizer } from "@huggingface/transformers";

declare var self: Worker;

// The model needs distinct document and query prefixes to compare notes with tags.
const NOTE_PREFIX = "title: none | text: ";
const TAG_PREFIX = "task: search result | query: ";

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";

export type EmbeddingWorkerCommand =
  | { kind: "load" }
  | { kind: "embedNote"; text: string }
  | { kind: "embedTag"; tagName: string }
  | { kind: "buildTagCache"; tagNames: string[] };

export type EmbeddingWorkerRequest = EmbeddingWorkerCommand & { id: number };

// Structured cloning preserves cached arrays; transferring them would detach their buffers.
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
      env.allowLocalModels = true;
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
      // Tag suggestions only need relative similarity, so 8-bit quantization is sufficient.
      model = await AutoModel.from_pretrained(MODEL_ID, { dtype: "q8" });
      console.log(`Embedding model loaded: ${MODEL_ID} (q8)`);
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }

  await loading;

  // TypeScript needs an explicit guard to narrow the optional model instance.
  if (!model || !tokenizer) throw new Error("Failed to load embedding model");
  return { model, tokenizer };
}

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
