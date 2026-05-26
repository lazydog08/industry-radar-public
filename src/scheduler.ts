import type { AppConfig } from "./config.js";
import { exportStaticSiteData } from "./export/site.js";
import { runReport } from "./report/generate.js";
import type { DailyReportType } from "./types.js";
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
    if (time === "12:00") {
      void runScheduledReportOnce(config, "noon", date, executed);
    }
    if (time === "22:00") {
      void runScheduledReportOnce(config, "night", date, executed);
    }
  }, 30_000);
}

export async function runScheduledReportOnce(
  config: AppConfig,
  type: DailyReportType,
  date: string,
  executed: Set<string> = new Set<string>()
): Promise<void> {
  const key = `${date}:${type}`;
  if (executed.has(key)) return;
  executed.add(key);

  try {
    await runReport(config, { type, date });
  } catch (error) {
    process.stderr.write(`内部调度执行失败：${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }

  try {
    const result = await exportStaticSiteData(config);
    process.stdout.write(`内部调度静态数据已导出：${result.outputDir}\n`);
  } catch (error) {
    process.stderr.write(`内部调度静态导出失败：${error instanceof Error ? error.message : String(error)}\n`);
  }
}
