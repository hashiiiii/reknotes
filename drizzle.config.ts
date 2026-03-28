import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/app/db/schema.ts",
  dbCredentials: {
    url: process.env.DB_PATH ?? "data/reknotes.sqlite",
  },
});
