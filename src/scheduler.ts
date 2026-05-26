import type { AppConfig } from "./config.js";
import { runReport } from "./report/generate.js";
import { dateOnly } from "./utils/time.js";

export function startInternalScheduler(config: AppConfig): void {
  const executed = new Set<string>();
  setInterval(() => {
    const now = new Date();
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(now);
    const date = dateOnly(now);
    if (time === "12:00") runOnce(config, "noon", date, executed);
    if (time === "22:00") runOnce(config, "night", date, executed);
  }, 30_000);
}

function runOnce(config: AppConfig, type: "noon" | "night", date: string, executed: Set<string>): void {
  const key = `${date}:${type}`;
  if (executed.has(key)) return;
  executed.add(key);
  void runReport(config, { type, date }).catch((error) => {
    process.stderr.write(`内部调度执行失败：${error instanceof Error ? error.message : String(error)}\n`);
  });
}
