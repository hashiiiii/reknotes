export interface IEmbeddingProvider {
  preload(): Promise<void>;
  embedPassage(text: string): Promise<Float32Array>;
  embedTag(tagName: string): Promise<Float32Array>;
  buildTagCache(tagNames: string[]): Promise<void>;
}
