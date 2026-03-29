import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

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
  env: process.env,
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(proc.exitCode ?? 0);
