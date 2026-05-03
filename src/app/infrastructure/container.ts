import { S3Client } from "@aws-sdk/client-s3";
import type { IEmbeddingProvider } from "../application/port/embedding-provider";
import type { IHookProvider } from "../application/port/hook-provider";
import type { IMigrationProvider } from "../application/port/migration-provider";
import type { ISchemaSyncProvider } from "../application/port/schema-sync-provider";
import type { IStorageProvider } from "../application/port/storage-provider";
import type { Config } from "../config";
import type { IGraphRepository } from "../domain/graph/graph-repository";
import type { INoteRepository } from "../domain/note/note-repository";
import type { ITagRepository } from "../domain/tag/tag-repository";
import { createDb, type DrizzleDb } from "./db";
import { CloudflareEmbeddingProvider } from "./providers/cloudflare-embedding-provider";
import { DrizzleKitSchemaSyncProvider } from "./providers/drizzle-kit-schema-sync-provider";
import { FsHookProvider } from "./providers/fs-hook-provider";
import { LocalEmbeddingProvider } from "./providers/local-embedding-provider";
import { PostgresMigrationProvider } from "./providers/postgres-migration-provider";
import { S3StorageProvider } from "./providers/s3-storage-provider";
import { DrizzleGraphRepository } from "./repositories/drizzle-graph-repository";
import { DrizzleNoteRepository } from "./repositories/drizzle-note-repository";
import { DrizzleTagRepository } from "./repositories/drizzle-tag-repository";

const HOOKS_DIR = "scripts/migration/hooks";
const SCHEMA_PATH = "./src/app/infrastructure/db/schema.ts";

///////////////
// Singleton
///////////////

let dbInstance: DrizzleDb | null = null;
function getOrCreateDb(config: Config): DrizzleDb {
  if (dbInstance) return dbInstance;
  dbInstance = createDb(config.databaseUrl);
  return dbInstance;
}

let embeddingInstance: IEmbeddingProvider | null = null;
export function createEmbeddingProvider(config: Config): IEmbeddingProvider {
  if (embeddingInstance) return embeddingInstance;

  if (config.deployment === "remote") {
    embeddingInstance = new CloudflareEmbeddingProvider(config.cloudflareAccountId, config.cloudflareApiToken);
  } else {
    embeddingInstance = new LocalEmbeddingProvider();
  }
  return embeddingInstance;
}

let storageInstance: IStorageProvider | null = null;
export function createStorageProvider(config: Config): IStorageProvider {
  if (storageInstance) return storageInstance;

  const s3 = new S3Client({
    region: "auto",
    endpoint: config.s3Endpoint,
    credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
    forcePathStyle: true,
  });

  storageInstance = new S3StorageProvider(s3, config.s3BucketName);
  return storageInstance;
}

///////////////
// Transient
///////////////

export function createNoteRepository(config: Config): INoteRepository {
  return new DrizzleNoteRepository(getOrCreateDb(config));
}

export function createTagRepository(config: Config): ITagRepository {
  return new DrizzleTagRepository(getOrCreateDb(config));
}

export function createGraphRepository(config: Config): IGraphRepository {
  return new DrizzleGraphRepository(getOrCreateDb(config));
}

export function createMigrationProvider(config: Config): IMigrationProvider {
  return new PostgresMigrationProvider(config.databaseUrl, config.deployment === "remote");
}

export function createSchemaSyncProvider(config: Config): ISchemaSyncProvider {
  return new DrizzleKitSchemaSyncProvider(config.databaseUrl, SCHEMA_PATH);
}

export function createHookProvider(): IHookProvider {
  return new FsHookProvider(HOOKS_DIR);
}
