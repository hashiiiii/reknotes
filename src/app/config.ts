export type Environment = "development" | "test" | "production";
export type Deployment = "local" | "remote";

export type Config = {
  deployment: Deployment;
  environment: Environment;
  databaseUrl: string;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  s3Endpoint: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
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
    deployment: deployment,
    environment: environment,
    databaseUrl: databaseUrl,
    cloudflareAccountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    cloudflareApiToken: requireEnv("CLOUDFLARE_API_TOKEN"),
    s3Endpoint: requireEnv("S3_ENDPOINT"),
    s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    s3BucketName: requireEnv("S3_BUCKET_NAME"),
  };
}
