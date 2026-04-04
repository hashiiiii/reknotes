import type { IEmbeddingProvider } from "../application/port/embedding-provider";
import type { IStorageProvider } from "../application/port/storage-provider";
import type { IGraphRepository } from "../domain/graph/graph-repository";
import type { INoteRepository } from "../domain/note/note-repository";
import type { ITagRepository } from "../domain/tag/tag-repository";
import { db } from "./db";
import { CloudflareEmbeddingProvider } from "./embedding/cloudflare-embedding-provider";
import { LocalEmbeddingProvider } from "./embedding/local-embedding-provider";
import { DrizzleGraphRepository } from "./repositories/drizzle-graph-repository";
import { DrizzleNoteRepository } from "./repositories/drizzle-note-repository";
import { DrizzleTagRepository } from "./repositories/drizzle-tag-repository";
import { S3StorageProvider } from "./storage/s3-storage-provider";

const noteRepository: INoteRepository = new DrizzleNoteRepository(db);
const tagRepository: ITagRepository = new DrizzleTagRepository(db);
const graphRepository: IGraphRepository = new DrizzleGraphRepository(db);
const storageProvider: IStorageProvider = new S3StorageProvider();
const embeddingProvider: IEmbeddingProvider =
  process.env.DEPLOYMENT === "remote" ? new CloudflareEmbeddingProvider() : new LocalEmbeddingProvider();

export { embeddingProvider, graphRepository, noteRepository, storageProvider, tagRepository };
