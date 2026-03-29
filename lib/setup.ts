import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists, skipping");
} else {
  const content = readFileSync(".env.example", "utf-8");
  writeFileSync(".env", content);
  console.log("Created .env");
}
