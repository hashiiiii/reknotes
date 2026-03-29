import postgres from "postgres";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = process.env.NODE_ENV;
  if (!env) throw new Error("NODE_ENV is not set");
  const base = process.env.DATABASE_URL_BASE;
  if (!base) throw new Error("DATABASE_URL_BASE is not set");
  return `${base}/reknotes_${env}`;
}

const url = getDatabaseUrl();
const dbName = new URL(url).pathname.slice(1);
const adminUrl = url.replace(`/${dbName}`, "/postgres");

const admin = postgres(adminUrl);

try {
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database: ${dbName}`);
} catch (e) {
  if ((e as { code?: string }).code !== "42P04") throw e; // 42P04 = duplicate_database（既に存在する）
}

await admin.end();

const proc = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
  env: { ...process.env, DATABASE_URL: url },
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(proc.exitCode ?? 0);
