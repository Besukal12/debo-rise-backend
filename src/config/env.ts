import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
loadEnv({ path: path.join(backendDir, ".env") });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.url().refine(
    (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    { message: "DATABASE_URL must be a PostgreSQL connection URL" },
  ),
  LOG_DIR: z.string().default("./logs"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
