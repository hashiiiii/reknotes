export type Environment = "development" | "test" | "production";
export type Deployment = "local" | "remote";

export type Config = {
  deployment: Deployment;
  environment: Environment;
  databaseUrl: string;
  s3Endpoint: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
};

// backup (dump / restore) は任意機能。BACKUP_S3_* は loadBackupConfig 経由で
// backup 実行時にのみ要求する。Cloudflare 認証 (remote embedding 用) も同様に
// createEmbeddingProvider が remote のときだけ requireEnv する。
// こうすることで local 開発・CI・migrate は backup / Cloudflare 変数を必要としない。
export type BackupConfig = Config & {
  backupS3Endpoint: string;
  backupS3AccessKeyId: string;
  backupS3SecretAccessKey: string;
  backupS3BucketName: string;
};

export function requireEnv(name: string): string {
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

export function loadBackupConfig(): BackupConfig {
  return {
    ...loadConfig(),
    backupS3Endpoint: requireEnv("BACKUP_S3_ENDPOINT"),
    backupS3AccessKeyId: requireEnv("BACKUP_S3_ACCESS_KEY_ID"),
    backupS3SecretAccessKey: requireEnv("BACKUP_S3_SECRET_ACCESS_KEY"),
    backupS3BucketName: requireEnv("BACKUP_S3_BUCKET_NAME"),
  };
}
