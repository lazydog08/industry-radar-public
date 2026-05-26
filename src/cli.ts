import { Command } from "commander";
import { loadConfig } from "./config.js";
import { Store } from "./store/db.js";
import { generatePeriodReport, runReport } from "./report/generate.js";
import { reportWindow } from "./utils/time.js";
import { getSourceAdapters } from "./sources/index.js";
import { logger } from "./utils/logger.js";
import type { DailyReportType } from "./types.js";

const program = new Command();
const dailyReportTypes = new Set<string>(["morning", "noon", "night"]);

function isDailyReportType(value: string): value is DailyReportType {
  return dailyReportTypes.has(value);
}

program
  .name("industry-radar")
  .description("行业情报雷达 + 个人知识库")
  .version("0.1.0");

program
  .command("kb:init")
  .description("初始化 SQLite 数据库和 FTS 表")
  .action(() => {
    const config = loadConfig();
    const store = new Store(config);
    store.close();
    console.log(`数据库已初始化：${config.databasePath}`);
  });

program
  .command("report:run")
  .description("生成早间、中午或晚间报告")
  .option("--type <type>", "报告类型：morning、noon 或 night", "noon")
  .option("--date <date>", "报告日期，格式 YYYY-MM-DD")
  .option("--mock", "只使用 sample/mock 数据")
  .option("--mock-fallback", "真实采集没有任何条目时使用 mock 数据兜底")
  .action(async (options: { type: string; date?: string; mock?: boolean; mockFallback?: boolean }) => {
    if (!isDailyReportType(options.type)) {
      throw new Error("--type 只能是 morning、noon 或 night");
    }
    const config = loadConfig();
    await runReport(config, {
      type: options.type,
      date: options.date,
      useMock: Boolean(options.mock),
      mockFallback: Boolean(options.mockFallback)
    });
  });

program
  .command("kb:search")
  .description("全文搜索知识库")
  .argument("[query...]", "搜索关键词")
  .option("--category <category>", "分类：digital/media/auto/mixed")
  .option("--source <source>", "来源平台")
  .option("--tag <tag>", "标签")
  .option("--entity <entity>", "实体/品牌/平台")
  .option("--favorite", "只看收藏")
  .option("--used-for-video", "只看已用于视频")
  .option("--limit <limit>", "数量限制", "20")
  .action((queryParts: string[], options) => {
    const query = queryParts.join(" ").trim();
    if (!query) {
      throw new Error("请输入搜索关键词，例如：pnpm kb:search -- \"OPPO 影像\"");
    }
    const config = loadConfig();
    const store = new Store(config);
    try {
      const results = store.searchEvents(query, {
        category: options.category,
        source: options.source,
        tag: options.tag,
        entity: options.entity,
        favorite: Boolean(options.favorite),
        usedForVideo: Boolean(options.usedForVideo),
        limit: Number.parseInt(options.limit, 10)
      });
      if (results.length === 0) {
        console.log("没有找到匹配事件。");
        return;
      }
      for (const [index, event] of results.entries()) {
        const tags = event.tags?.join("、") || "无标签";
        const sources = event.sources?.map((source) => `${source.source}: ${source.url}`).join("、") || "无来源";
        console.log(`${index + 1}. ${event.title}`);
        console.log(`   Radar：${event.radar_level || "D"} ${event.radar_score ?? event.importance_score}｜视频潜力：${event.video_potential || 1}/5｜置信度：${event.confidence || "low"}｜分类：${event.category}`);
        console.log(`   标签：${tags}｜来源：${sources}`);
        console.log(`   推荐理由：${event.push_reason || "适合进入观察池。"}`);
        console.log(`   一句话：${event.summary}`);
        console.log(`   角度：${event.content_angle}`);
        console.log("");
      }
    } finally {
      store.close();
    }
  });

program
  .command("report:weekly")
  .description("基于数据库生成周报 MVP")
  .action(async () => {
    await generatePeriodReport(loadConfig(), "weekly");
  });

program
  .command("report:monthly")
  .description("基于数据库生成月报 MVP")
  .action(async () => {
    await generatePeriodReport(loadConfig(), "monthly");
  });

program
  .command("sources:test")
  .description("测试真实数据源公开访问状态")
  .option("--type <type>", "窗口类型 morning/noon/night", "noon")
  .action(async (options: { type: string }) => {
    if (!isDailyReportType(options.type)) {
      throw new Error("--type 只能是 morning、noon 或 night");
    }
    const window = reportWindow(options.type || "noon");
    const adapters = getSourceAdapters(false);
    for (const adapter of adapters) {
      try {
        const result = await adapter.fetch({ window, useMock: false, logger });
        console.log(`${result.ok ? "OK" : "异常"} ${result.source}: ${result.items.length} 条${result.error ? `；${result.error}` : ""}`);
        if (result.warnings?.length) {
          for (const warning of result.warnings) console.log(`  - ${warning}`);
        }
      } catch (error) {
        console.log(`异常 ${adapter.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

const separatorIndex = process.argv.findIndex((arg, index) => index > 1 && arg === "--");
const argv = separatorIndex === -1 ? process.argv : [...process.argv.slice(0, separatorIndex), ...process.argv.slice(separatorIndex + 1)];

program.parseAsync(argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
