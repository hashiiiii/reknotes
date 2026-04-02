import postgres from "postgres";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (process.env.DEPLOYMENT === "remote") {
    return databaseUrl;
  } else {
    const environment = process.env.ENVIRONMENT;
    if (!environment) throw new Error("ENVIRONMENT is not set");
    return `${databaseUrl}/reknotes_${environment}`;
  }
}

const url = getDatabaseUrl();
const isRemote = process.env.DEPLOYMENT === "remote";

// local: Docker PostgreSQL に CREATE DATABASE してからスキーマ同期
// remote: Neon 等のマネージド DB はダッシュボードで作成済みなのでスキーマ同期のみ
if (!isRemote) {
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
}

const proc = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
  env: { ...process.env, DATABASE_URL: url },
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(proc.exitCode ?? 0);
