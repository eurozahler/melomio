import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Lädt .env.local genauso wie Next.js
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
