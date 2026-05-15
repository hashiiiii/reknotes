import { restoreBackup } from "../../src/app/application/backup/restore-backup";
import { loadConfig } from "../../src/app/config";
import {
  createBackupStorageProvider,
  createDatabaseBackupProvider,
  createStorageProvider,
} from "../../src/app/infrastructure/container";

const HELP_TEXT = `Usage: bun run restore --date YYYY-MM-DD

Restores a backup into the DB / S3 bucket pointed to by the current env (DATABASE_URL,
S3_BUCKET_NAME 等). Disaster runbook では先に GitHub Secrets を新 infra に向けて deploy
workflow を回し、その VM 上で本コマンドを実行する想定。
`;

async function run(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }

  const date = args[args.indexOf("--date") + 1];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(HELP_TEXT);
    return 1;
  }

  console.log(`Restoring backup ${date} into the env-pointed DB / S3...`);
  try {
    const config = loadConfig();
    if (config.s3BucketName === config.backupS3BucketName) {
      console.error(
        JSON.stringify({ kind: "error", message: "S3_BUCKET_NAME must differ from BACKUP_S3_BUCKET_NAME" }),
      );
      return 1;
    }

    const result = await restoreBackup(
      createBackupStorageProvider(config),
      createStorageProvider(config),
      createDatabaseBackupProvider(config),
      date,
    );

    if (result.kind === "ok") {
      console.log(JSON.stringify(result));
      return 0;
    }
    console.error(JSON.stringify(result));
    return 1;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "error", message }));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await run());
}
