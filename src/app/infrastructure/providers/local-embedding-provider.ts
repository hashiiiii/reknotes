import type { IEmbeddingProvider } from "../../application/port/embedding-provider";
import type { EmbeddingWorkerCommand, EmbeddingWorkerResponse } from "./local-embedding-worker";

// 推論はメインスレッドを飢餓させるため local-embedding-worker.ts に隔離し、
// この class は postMessage の proxy に徹する (issue #178)。タグキャッシュも worker 側が持つ。
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (response: EmbeddingWorkerResponse) => void; reject: (error: Error) => void }
  >();

  // テストから壊れた worker を注入して失敗経路を検証できるよう、URL を差し替え可能にする
  constructor(private workerUrl: URL = new URL("./local-embedding-worker.ts", import.meta.url)) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(this.workerUrl);
    worker.onmessage = (event: MessageEvent<EmbeddingWorkerResponse>) => {
      const entry = this.pending.get(event.data.id);
      if (!entry) return;
      this.pending.delete(event.data.id);
      // 要求が無い間は worker がプロセスの終了を妨げないようにする (CLI スクリプトが完走後に hang しないため)
      if (this.pending.size === 0) worker.unref();
      entry.resolve(event.data);
    };
    worker.onerror = (event) => {
      // worker 自体が落ちたら全 pending を明示的に失敗させる (握りつぶして hang させない)
      const error = new Error(`embedding worker error: ${event.message}`);
      for (const entry of this.pending.values()) {
        entry.reject(error);
      }
      this.pending.clear();
      // 死んだ worker を掴み続けると以降の要求が全て失敗し続けるため、破棄して次の要求で作り直す
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
      // リクエスト実行中はプロセスを維持する (unref した worker からの応答待ちで exit しないため)
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
