import { HuggingFaceEmbeddingService } from "./embedding/huggingface-embedding-service";
import { DrizzleGraphRepository } from "./repositories/drizzle-graph-repository";
import { DrizzleNoteRepository } from "./repositories/drizzle-note-repository";
import { DrizzleTagRepository } from "./repositories/drizzle-tag-repository";
import { S3StorageService } from "./storage/s3-storage-service";

export const noteRepository = new DrizzleNoteRepository();
export const tagRepository = new DrizzleTagRepository();
export const graphRepository = new DrizzleGraphRepository();
export const embeddingService = new HuggingFaceEmbeddingService();
export const storageService = new S3StorageService();
