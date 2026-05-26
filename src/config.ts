import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

dotenv.config({ quiet: true });

export interface AppConfig {
  timezone: string;
  databasePath: string;
  reportOutputDir: string;
  reportWebhookUrl?: string;
  openAiApiKey?: string;
  embeddingProvider?: string;
  enableInternalScheduler: boolean;
  port: number;
  serverHost: string;
  requestTimeoutMs: number;
  requestDelayMs: number;
  rootDir: string;
}

function resolveProjectPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function isConnectionString(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !value.startsWith("file://");
}

function parsePositiveInteger(value: string | undefined, fallback: number, max?: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

export function loadConfig(): AppConfig {
  const rootDir = process.cwd();
  const defaultDatabasePath = "./data/industry-radar.sqlite";
  const databaseInput = process.env.SQLITE_PATH || process.env.DB_FILE || process.env.DATABASE_URL || defaultDatabasePath;
  const databasePath = resolveProjectPath(isConnectionString(databaseInput) ? defaultDatabasePath : databaseInput);
  const reportOutputDir = resolveProjectPath(process.env.REPORT_OUTPUT_DIR || "./data/reports");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.mkdirSync(reportOutputDir, { recursive: true });
  fs.mkdirSync(path.resolve(rootDir, "logs"), { recursive: true });

  return {
    timezone: process.env.TIMEZONE || "Asia/Shanghai",
    databasePath,
    reportOutputDir,
    reportWebhookUrl: process.env.REPORT_WEBHOOK_URL || undefined,
    openAiApiKey: process.env.OPENAI_API_KEY || undefined,
    embeddingProvider: process.env.EMBEDDING_PROVIDER || undefined,
    enableInternalScheduler: process.env.ENABLE_INTERNAL_SCHEDULER === "true",
    port: parsePositiveInteger(process.env.PORT, 3877, 65535),
    serverHost: process.env.HOST || "127.0.0.1",
    requestTimeoutMs: parsePositiveInteger(process.env.REQUEST_TIMEOUT_MS, 12000),
    requestDelayMs: parsePositiveInteger(process.env.REQUEST_DELAY_MS, 900),
    rootDir
  };
}
