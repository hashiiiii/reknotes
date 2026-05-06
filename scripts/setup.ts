import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists, skipping");
} else {
  const content = readFileSync(".env.example", "utf-8");
  writeFileSync(".env", content);
  console.log("Created .env");
}

try {
  execSync("git config core.hooksPath .githooks", { stdio: "inherit" });
  console.log("Configured git hooks path to .githooks");
} catch {
  console.log("Not a git repository, skipping hook setup");
}
