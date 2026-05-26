import type { Logger } from "../types.js";

function write(level: string, message: string, meta?: Record<string, unknown>): void {
  const payload = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  process.stdout.write(`[${new Date().toISOString()}] ${level} ${message}${payload}\n`);
}

export const logger: Logger = {
  info(message, meta) {
    write("INFO", message, meta);
  },
  warn(message, meta) {
    write("WARN", message, meta);
  },
  error(message, meta) {
    write("ERROR", message, meta);
  }
};
