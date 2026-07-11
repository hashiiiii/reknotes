import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadBackupStorageConfig, loadConfig, loadEmbeddingConfig } from "./config";

// process.env を直接操作するので、各テストの前後で対象キーを退避・復元する
const MANAGED_KEYS = [
  "DEPLOYMENT",
  "ENVIRONMENT",
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
  "BACKUP_S3_BUCKET_NAME",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

// loadConfig が要求する共通の変数だけをセットする
function setCoreEnv() {
  process.env.DEPLOYMENT = "local";
  process.env.ENVIRONMENT = "development";
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432";
  process.env.S3_ENDPOINT = "http://localhost:9000";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  process.env.S3_BUCKET_NAME = "bucket";
}

function deleteCloudflareEnv() {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
}

function deleteBackupEnv() {
  delete process.env.BACKUP_S3_ENDPOINT;
  delete process.env.BACKUP_S3_ACCESS_KEY_ID;
  delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  delete process.env.BACKUP_S3_BUCKET_NAME;
}

describe("loadConfig", () => {
  test("Cloudflare と backup の変数なしで読み込める", () => {
    // ローカル開発 (bun run dev) が dummy 値を要求しないことの担保
    setCoreEnv();
    deleteCloudflareEnv();
    deleteBackupEnv();
    const config = loadConfig();
    expect(config.deployment).toBe("local");
    expect(config.s3BucketName).toBe("bucket");
  });

  test("local では DATABASE_URL に /reknotes_<environment> を付与する", () => {
    setCoreEnv();
    expect(loadConfig().databaseUrl).toBe("postgres://user:pass@localhost:5432/reknotes_development");
  });

  test("remote では DATABASE_URL をそのまま使う", () => {
    setCoreEnv();
    process.env.DEPLOYMENT = "remote";
    process.env.DATABASE_URL = "postgres://user:pass@db.example.com/neondb";
    expect(loadConfig().databaseUrl).toBe("postgres://user:pass@db.example.com/neondb");
  });

  test("共通の必須変数が無ければ throw する", () => {
    setCoreEnv();
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow("DATABASE_URL is required");
  });
});

describe("loadEmbeddingConfig", () => {
  test("local では Cloudflare の変数なしで local 種別を返す", () => {
    deleteCloudflareEnv();
    expect(loadEmbeddingConfig("local")).toEqual({ kind: "local" });
  });

  test("remote で Cloudflare の変数が無ければ throw する", () => {
    deleteCloudflareEnv();
    expect(() => loadEmbeddingConfig("remote")).toThrow("CLOUDFLARE_ACCOUNT_ID is required");
  });

  test("remote では Cloudflare の認証情報を返す", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    expect(loadEmbeddingConfig("remote")).toEqual({
      kind: "cloudflare",
      accountId: "account",
      apiToken: "token",
    });
  });
});

describe("loadBackupStorageConfig", () => {
  test("BACKUP_S3_* が無ければ throw する", () => {
    deleteBackupEnv();
    expect(() => loadBackupStorageConfig()).toThrow("BACKUP_S3_ENDPOINT is required");
  });

  test("BACKUP_S3_* が揃っていれば値を返す", () => {
    process.env.BACKUP_S3_ENDPOINT = "http://localhost:9002";
    process.env.BACKUP_S3_ACCESS_KEY_ID = "backup-key";
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = "backup-secret";
    process.env.BACKUP_S3_BUCKET_NAME = "backup-bucket";
    expect(loadBackupStorageConfig()).toEqual({
      endpoint: "http://localhost:9002",
      accessKeyId: "backup-key",
      secretAccessKey: "backup-secret",
      bucketName: "backup-bucket",
    });
  });
});
