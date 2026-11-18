export type Environment = "development" | "test" | "production";
export type Deployment = "local" | "remote";

// Validate optional provider credentials only when that provider is constructed.
// Local development and unrelated commands must not require placeholder secrets.
export type Config = {
  deployment: Deployment;
  environment: Environment;
  databaseUrl: string;
  s3Endpoint: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
};

// Only remote embeddings require Cloudflare credentials.
export type EmbeddingConfig = { kind: "local" } | { kind: "cloudflare"; accountId: string; apiToken: string };

// Starting the application must not require backup credentials.
export type BackupStorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseDeployment(raw: string): Deployment {
  if (raw !== "local" && raw !== "remote") {
    throw new Error(`DEPLOYMENT must be "local" or "remote", got "${raw}"`);
  }
  return raw;
}

function parseEnvironment(raw: string): Environment {
  if (raw !== "development" && raw !== "test" && raw !== "production") {
    throw new Error(`ENVIRONMENT must be "development" | "test" | "production", got "${raw}"`);
  }
  return raw;
}

export function loadConfig(): Config {
  const deployment = parseDeployment(requireEnv("DEPLOYMENT"));
  const environment = parseEnvironment(requireEnv("ENVIRONMENT"));
  const baseUrl = requireEnv("DATABASE_URL");
  const databaseUrl = deployment === "remote" ? baseUrl : `${baseUrl}/reknotes_${environment}`;

  return {
    deployment,
    environment,
    databaseUrl,
    s3Endpoint: requireEnv("S3_ENDPOINT"),
    s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    s3BucketName: requireEnv("S3_BUCKET_NAME"),
  };
}

export function loadEmbeddingConfig(deployment: Deployment): EmbeddingConfig {
  if (deployment === "local") return { kind: "local" };
  return {
    kind: "cloudflare",
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requireEnv("CLOUDFLARE_API_TOKEN"),
  };
}

export function loadBackupStorageConfig(): BackupStorageConfig {
  return {
    endpoint: requireEnv("BACKUP_S3_ENDPOINT"),
    accessKeyId: requireEnv("BACKUP_S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("BACKUP_S3_SECRET_ACCESS_KEY"),
    bucketName: requireEnv("BACKUP_S3_BUCKET_NAME"),
  };
}
