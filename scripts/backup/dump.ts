import { dumpBackup } from "../../src/app/application/backup/dump-backup";
import { loadConfig } from "../../src/app/config";
import {
  createBackupStorageProvider,
  createDatabaseBackupProvider,
  createStorageProvider,
} from "../../src/app/infrastructure/container";

const HELP_TEXT = `Usage: bun run dump

Snapshots DATABASE_URL and uploads S3_* objects into BACKUP_S3_* (must point at a different bucket).
`;

async function run(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }

  console.log("Running dump...");
  try {
    const config = loadConfig();
    if (config.backupS3BucketName === config.s3BucketName) {
      console.error(
        JSON.stringify({ kind: "error", message: "BACKUP_S3_BUCKET_NAME must differ from S3_BUCKET_NAME" }),
      );
      return 1;
    }

    const result = await dumpBackup(
      createStorageProvider(config),
      createBackupStorageProvider(config),
      createDatabaseBackupProvider(config),
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
