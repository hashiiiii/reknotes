export interface IEmbeddingProvider {
  preload(): Promise<void>;
  embedPassage(text: string): Promise<Float32Array>;
  embedTag(tagName: string): Promise<Float32Array>;
  buildTagCache(tagNames: string[]): Promise<void>;
  tokenize(text: string): Promise<string[]>;
}

// embeddinggemma のプレフィックス形式（全プロバイダで共通）
export const PASSAGE_PREFIX = "title: none | text: ";
export const QUERY_PREFIX = "task: search result | query: ";
