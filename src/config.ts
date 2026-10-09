import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
loadEnv({ path: path.join(backendDir, ".env") });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
});

export const env = envSchema.parse(process.env);
