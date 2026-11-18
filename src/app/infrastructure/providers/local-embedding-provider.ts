import type { IEmbeddingProvider } from "../../application/port/embedding-provider";
import type { EmbeddingWorkerCommand, EmbeddingWorkerResponse } from "./local-embedding-worker";

// Inference blocks the main thread, so a worker owns both the model and tag cache
// while this provider forwards requests (issue #178).
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (response: EmbeddingWorkerResponse) => void; reject: (error: Error) => void }
  >();

  // A configurable URL lets tests exercise real worker startup and failure paths.
  constructor(private workerUrl: URL = new URL("./local-embedding-worker.ts", import.meta.url)) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(this.workerUrl);
    worker.onmessage = (event: MessageEvent<EmbeddingWorkerResponse>) => {
      const entry = this.pending.get(event.data.id);
      if (!entry) return;
      this.pending.delete(event.data.id);
      // An idle worker must not keep a completed CLI process alive.
      if (this.pending.size === 0) worker.unref();
      entry.resolve(event.data);
    };
    worker.onerror = (event) => {
      // A failed worker cannot answer pending requests; reject them instead of hanging.
      const error = new Error(`embedding worker error: ${event.message}`);
      for (const entry of this.pending.values()) {
        entry.reject(error);
      }
      this.pending.clear();
      // Recreate the worker on the next request so one crash does not disable all future inference.
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private async request(command: EmbeddingWorkerCommand): Promise<Float32Array | undefined> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    const response = await new Promise<EmbeddingWorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Pending requests must keep the process alive until the worker responds.
      if (this.pending.size === 1) worker.ref();
      worker.postMessage({ ...command, id });
    });
    if (!response.ok) throw new Error(response.message);
    return response.embedding;
  }

  async load(): Promise<void> {
    await this.request({ kind: "load" });
  }

  async embedNote(text: string): Promise<Float32Array> {
    const embedding = await this.request({ kind: "embedNote", text });
    if (!embedding) throw new Error("embedding worker returned no embedding");
    return embedding;
  }

  async embedTag(tagName: string): Promise<Float32Array> {
    const embedding = await this.request({ kind: "embedTag", tagName });
    if (!embedding) throw new Error("embedding worker returned no embedding");
    return embedding;
  }

  async buildTagCache(tagNames: string[]): Promise<void> {
    await this.request({ kind: "buildTagCache", tagNames });
  }
}
