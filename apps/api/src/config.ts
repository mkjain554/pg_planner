import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters."),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid server configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("The API environment configuration is invalid.");
}

export const config = {
  ...parsed.data,
  cookieSecure: parsed.data.COOKIE_SECURE === "true",
};
