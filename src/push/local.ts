import type { GeneratedReport } from "../types.js";

export function pushLocalReport(report: GeneratedReport): void {
  const top = report.newEvents.slice(0, 3).map((event) => `- ${event.title}`).join("\n");
  process.stdout.write(
    [
      "",
      "报告已生成：",
      `HTML: ${report.htmlPath}`,
      `Markdown: ${report.markdownPath}`,
      `新增事件: ${report.newEvents.length}`,
      `持续更新: ${report.updatedEvents.length}`,
      top ? `摘要:\n${top}` : "摘要: 暂无新增事件",
      ""
    ].join("\n")
  );
}
