import { loadConfig } from "../src/config.js";
import { exportStaticSiteData } from "../src/export/site.js";

interface CliOptions {
  outputDir?: string;
}

const cliOptions = parseCliOptions(process.argv.slice(2));
const config = loadConfig();

const result = await exportStaticSiteData(config, {
  outputDir: cliOptions.outputDir,
  recentDays: parsePositiveEnv("EXPORT_RECENT_DAYS"),
  eventLimit: parsePositiveEnv("EXPORT_EVENT_LIMIT"),
  knowledgeDays: parsePositiveEnv("EXPORT_KNOWLEDGE_DAYS"),
  knowledgeLimit: parsePositiveEnv("EXPORT_KNOWLEDGE_LIMIT"),
  reportLimit: parsePositiveEnv("EXPORT_REPORT_LIMIT")
});

console.log(`静态数据已导出：${result.outputDir}`);
console.log(`更新时间：${result.generatedAt}`);
console.log(`事件：${result.counts.events} 条；知识卡：${result.counts.knowledgeCards} 条；报告：${result.counts.reports} 份`);
for (const file of result.files) {
  console.log(`- ${file}`);
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--out" || arg === "--output-dir") {
      options.outputDir = args[index + 1];
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.outputDir = arg.slice("--out=".length);
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
    }
  }
  return options;
}

function parsePositiveEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
