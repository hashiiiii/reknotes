import { HuggingFaceEmbeddingProvider } from "./embedding/huggingface-embedding-provider";
import { DrizzleGraphRepository } from "./repositories/drizzle-graph-repository";
import { DrizzleNoteRepository } from "./repositories/drizzle-note-repository";
import { DrizzleTagRepository } from "./repositories/drizzle-tag-repository";
import { S3StorageProvider } from "./storage/s3-storage-provider";

export const noteRepository = new DrizzleNoteRepository();
export const tagRepository = new DrizzleTagRepository();
export const graphRepository = new DrizzleGraphRepository();
export const embeddingProvider = new HuggingFaceEmbeddingProvider();
export const storageProvider = new S3StorageProvider();
