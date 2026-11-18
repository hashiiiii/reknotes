import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadBackupStorageConfig, loadConfig, loadEmbeddingConfig } from "./config";

// Environment changes must not leak into other tests that use the real configuration loader.
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
  test("loads without Cloudflare or backup variables", () => {
    // Local startup must not require credentials for providers it does not use.
    setCoreEnv();
    deleteCloudflareEnv();
    deleteBackupEnv();
    const config = loadConfig();
    expect(config.deployment).toBe("local");
    expect(config.s3BucketName).toBe("bucket");
  });

  test("appends /reknotes_<environment> to local database URLs", () => {
    setCoreEnv();
    expect(loadConfig().databaseUrl).toBe("postgres://user:pass@localhost:5432/reknotes_development");
  });

  test("preserves remote database URLs", () => {
    setCoreEnv();
    process.env.DEPLOYMENT = "remote";
    process.env.DATABASE_URL = "postgres://user:pass@db.example.com/neondb";
    expect(loadConfig().databaseUrl).toBe("postgres://user:pass@db.example.com/neondb");
  });

  test("rejects missing required configuration", () => {
    setCoreEnv();
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow("DATABASE_URL is required");
  });
});

describe("loadEmbeddingConfig", () => {
  test("selects local inference without Cloudflare variables", () => {
    deleteCloudflareEnv();
    expect(loadEmbeddingConfig("local")).toEqual({ kind: "local" });
  });

  test("rejects missing remote Cloudflare credentials", () => {
    deleteCloudflareEnv();
    expect(() => loadEmbeddingConfig("remote")).toThrow("CLOUDFLARE_ACCOUNT_ID is required");
  });

  test("returns Cloudflare credentials for remote inference", () => {
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
  test("rejects missing backup storage credentials", () => {
    deleteBackupEnv();
    expect(() => loadBackupStorageConfig()).toThrow("BACKUP_S3_ENDPOINT is required");
  });

  test("returns complete backup storage configuration", () => {
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
