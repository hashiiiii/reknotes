import { S3Client } from "@aws-sdk/client-s3";
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createStorageProvider(): IStorageProvider {
  const endpoint = requireEnv("R2_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");

  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  return new S3StorageProvider(s3, bucket);
}

function createEmbeddingProvider(): IEmbeddingProvider {
  if (process.env.DEPLOYMENT === "remote") {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
    return new CloudflareEmbeddingProvider(accountId, apiToken);
  }

  return new LocalEmbeddingProvider();
}

const noteRepository: INoteRepository = new DrizzleNoteRepository(db);
const tagRepository: ITagRepository = new DrizzleTagRepository(db);
const graphRepository: IGraphRepository = new DrizzleGraphRepository(db);
const storageProvider: IStorageProvider = createStorageProvider();
const embeddingProvider: IEmbeddingProvider = createEmbeddingProvider();

export { embeddingProvider, graphRepository, noteRepository, storageProvider, tagRepository };
