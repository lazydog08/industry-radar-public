import type { AppConfig } from "../config.js";
import type { GeneratedReport } from "../types.js";

export async function pushWebhook(config: AppConfig, report: GeneratedReport): Promise<void> {
  if (!config.reportWebhookUrl) return;
  try {
    const response = await fetch(config.reportWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType: report.type,
        markdown: report.markdown,
        htmlPath: report.htmlPath,
        markdownPath: report.markdownPath,
        eventCount: report.newEvents.length
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      process.stderr.write(`Webhook 推送失败：HTTP ${response.status}\n`);
    }
  } catch (error) {
    process.stderr.write(`Webhook 推送失败：${error instanceof Error ? error.message : String(error)}\n`);
  }
}
