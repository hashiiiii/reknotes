import { S3Client } from "@aws-sdk/client-s3";
import type { IEmbeddingProvider } from "../application/port/embedding-provider";
import type { IStorageProvider } from "../application/port/storage-provider";
import type { IGraphRepository } from "../domain/graph/graph-repository";
import type { INoteRepository } from "../domain/note/note-repository";
import type { ITagRepository } from "../domain/tag/tag-repository";
import { db } from "./db";
import { CloudflareEmbeddingProvider } from "./embedding/cloudflare-embedding-provider";
import { LocalEmbeddingProvider } from "./embedding/local-embedding-provider";
import { DrizzleKitSchemaSync } from "./migration/drizzle-kit-schema-sync";
import { FsHookSource } from "./migration/fs-hook-source";
import { PostgresMigrationDatabase } from "./migration/postgres-migration-database";
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

// Migration runner 用の DI ファクトリ。scripts/migration/migrate.ts から呼ばれる。
// Web app と異なり module-level singleton にせず、CLI 起動ごとに新規生成する。
const HOOKS_DIR = "scripts/migration/hooks";
const SCHEMA_PATH = "./src/app/infrastructure/db/schema.ts";

export function createMigrationDeps(): {
  db: PostgresMigrationDatabase;
  schema: DrizzleKitSchemaSync;
  hooks: FsHookSource;
} {
  const environment = requireEnv("ENVIRONMENT");
  const databaseUrlBase = requireEnv("DATABASE_URL");
  const isRemote = process.env.DEPLOYMENT === "remote";
  // local 環境では共有 DATABASE_URL に環境別 DB 名 (reknotes_development / reknotes_test) を suffix。
  // remote (Neon 等) では DATABASE_URL がそのまま完全な接続先を指す。
  const url = isRemote ? databaseUrlBase : `${databaseUrlBase}/reknotes_${environment}`;
  return {
    db: new PostgresMigrationDatabase(url, isRemote),
    schema: new DrizzleKitSchemaSync(url, SCHEMA_PATH),
    hooks: new FsHookSource(HOOKS_DIR),
  };
}

export { embeddingProvider, graphRepository, noteRepository, storageProvider, tagRepository };
