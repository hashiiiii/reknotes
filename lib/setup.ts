import { existsSync, readFileSync, writeFileSync } from "node:fs";

const example = readFileSync(".env.example", "utf-8");

const envFiles: { path: string; env: string; db: string }[] = [
  { path: ".env.development", env: "development", db: "reknotes_dev" },
  { path: ".env.test", env: "test", db: "reknotes_test" },
  { path: ".env.production", env: "production", db: "reknotes_prod" },
];

for (const { path, env, db } of envFiles) {
  if (existsSync(path)) {
    console.log(`${path} already exists, skipping`);
    continue;
  }
  const content = example.replace(/^NODE_ENV=.*/m, `NODE_ENV=${env}`).replace(/reknotes_dev/g, db);
  writeFileSync(path, content);
  console.log(`Created ${path}`);
}
