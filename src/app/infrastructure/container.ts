import { S3Client } from "@aws-sdk/client-s3";
import type { IEmbeddingProvider } from "../application/port/embedding-provider";
import type { IHookProvider } from "../application/port/hook-provider";
import type { IMigrationProvider } from "../application/port/migration-provider";
import type { ISchemaSyncProvider } from "../application/port/schema-sync-provider";
import type { IStorageProvider } from "../application/port/storage-provider";
import type { IGraphRepository } from "../domain/graph/graph-repository";
import type { INoteRepository } from "../domain/note/note-repository";
import type { ITagRepository } from "../domain/tag/tag-repository";
import { db } from "./db";
import { CloudflareEmbeddingProvider } from "./embedding/cloudflare-embedding-provider";
import { LocalEmbeddingProvider } from "./embedding/local-embedding-provider";
import { DrizzleKitSchemaSyncProvider } from "./migration/drizzle-kit-schema-sync-provider";
import { FsHookProvider } from "./migration/fs-hook-provider";
import { PostgresMigrationProvider } from "./migration/postgres-migration-provider";
import { DrizzleGraphRepository } from "./repositories/drizzle-graph-repository";
import { DrizzleNoteRepository } from "./repositories/drizzle-note-repository";
import { DrizzleTagRepository } from "./repositories/drizzle-tag-repository";
import { S3StorageProvider } from "./storage/s3-storage-provider";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// ── Granular factories ──
// テストや特殊な script が「必要な依存だけ」を組み立てたいとき用。
// 呼ばれない factory は env 検証も走らないので、test の起動条件が最小化される。

export function createNoteRepository(): INoteRepository {
  return new DrizzleNoteRepository(db);
}

export function createTagRepository(): ITagRepository {
  return new DrizzleTagRepository(db);
}

export function createGraphRepository(): IGraphRepository {
  return new DrizzleGraphRepository(db);
}

export function createStorageProvider(): IStorageProvider {
  const endpoint = requireEnv("S3_ENDPOINT");
  const accessKeyId = requireEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("S3_SECRET_ACCESS_KEY");
  const bucket = requireEnv("S3_BUCKET_NAME");

  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  return new S3StorageProvider(s3, bucket);
}

export function createEmbeddingProvider(): IEmbeddingProvider {
  if (process.env.DEPLOYMENT === "remote") {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
    return new CloudflareEmbeddingProvider(accountId, apiToken);
  }

  return new LocalEmbeddingProvider();
}

// ── Bundle factories ──
// 各 entry point (web app / seed / migration) が起動時に 1 回呼ぶ。
// granular factory を組み合わせて「この起動コンテキストが必要な束」を返す。

export type WebDeps = {
  noteRepository: INoteRepository;
  tagRepository: ITagRepository;
  graphRepository: IGraphRepository;
  storageProvider: IStorageProvider;
  embeddingProvider: IEmbeddingProvider;
};

export type SeedDeps = {
  noteRepository: INoteRepository;
  tagRepository: ITagRepository;
};

export type MigrationDeps = {
  db: IMigrationProvider;
  schema: ISchemaSyncProvider;
  hooks: IHookProvider;
};

export function createWebDeps(): WebDeps {
  return {
    noteRepository: createNoteRepository(),
    tagRepository: createTagRepository(),
    graphRepository: createGraphRepository(),
    storageProvider: createStorageProvider(),
    embeddingProvider: createEmbeddingProvider(),
  };
}

export function createSeedDeps(): SeedDeps {
  return {
    noteRepository: createNoteRepository(),
    tagRepository: createTagRepository(),
  };
}

const HOOKS_DIR = "scripts/migration/hooks";
const SCHEMA_PATH = "./src/app/infrastructure/db/schema.ts";

export function createMigrationDeps(): MigrationDeps {
  const environment = requireEnv("ENVIRONMENT");
  const databaseUrlBase = requireEnv("DATABASE_URL");
  const isRemote = process.env.DEPLOYMENT === "remote";
  // local 環境では共有 DATABASE_URL に環境別 DB 名 (reknotes_development / reknotes_test) を suffix。
  // remote (Neon 等) では DATABASE_URL がそのまま完全な接続先を指す。
  const url = isRemote ? databaseUrlBase : `${databaseUrlBase}/reknotes_${environment}`;
  return {
    db: new PostgresMigrationProvider(url, isRemote),
    schema: new DrizzleKitSchemaSyncProvider(url, SCHEMA_PATH),
    hooks: new FsHookProvider(HOOKS_DIR),
  };
}
