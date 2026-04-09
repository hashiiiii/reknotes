export interface IEmbeddingProvider {
  preload(): Promise<void>;
  embedNote(text: string): Promise<Float32Array>;
  embedTag(tagName: string): Promise<Float32Array>;
  buildTagCache(tagNames: string[]): Promise<void>;
  tokenize(text: string): Promise<string[]>;
}
