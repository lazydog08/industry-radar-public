import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

type EnvMap = Record<string, string | undefined>;

interface NotificationPayload {
  body: string;
  dryRun: boolean;
  siteUrl: string;
  targetLabel: string;
  title: string;
}

interface OverviewEvent {
  title?: string;
  radar_score?: number;
  radar_section?: string;
  radar_level?: string;
}

const env = loadEnv();
const payload = buildPayload(env);

if (!hasBarkTarget(env)) {
  const message = "Bark notify skipped: BARK_NOTIFY_URL/BARK_KEY is not configured.";
  if (payload.dryRun) {
    printDryRun(payload, "not configured");
  } else {
    console.log(message);
  }
  process.exit(0);
}

if (payload.dryRun) {
  printDryRun(payload, payload.targetLabel);
  process.exit(0);
}

try {
  const url = buildBarkUrl(env, payload);
  const timeoutMs = parsePositiveInteger(env.BARK_TIMEOUT_MS, 10000);
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseText = await response.text();
  assertBarkResponse(response.status, responseText);
  console.log(`Bark notify sent: ${payload.title}`);
} catch (error) {
  console.error(`Bark notify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function loadEnv(): EnvMap {
  const fromDotEnv = readEnvFile(".env");
  const fromLocal = readEnvFile(".env.local");
  return {
    ...fromDotEnv,
    ...fromLocal,
    ...process.env
  };
}

function readEnvFile(fileName: string): EnvMap {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return {};
  return dotenv.parse(readFileSync(filePath));
}

function buildPayload(values: EnvMap): NotificationPayload {
  const status = normalizeStatus(values.BARK_STATUS);
  const statusText = status === "failed" ? "失败" : "成功";
  const runType = normalizeRunType(values.BARK_RUN_TYPE || values.NAS_RUN_TYPE || extractToken(values.BARK_MESSAGE, "type") || "noon");
  const runDate = normalizeDate(values.NAS_RUN_DATE || extractToken(values.BARK_MESSAGE, "date") || today(values.TIMEZONE));
  const newCount = normalizeCount(values.BARK_NEW_COUNT || extractToken(values.BARK_MESSAGE, "new"));
  const highCount = normalizeCount(values.BARK_HIGH_COUNT || extractToken(values.BARK_MESSAGE, "high"));
  const siteUrl = normalizeHttpUrl(values.BARK_SITE_URL || values.BARK_PUBLIC_URL || values.PUBLIC_SITE_URL || "");

  const title = status === "failed" ? "行业情报更新失败" : "行业情报更新完成";
  const lines = [
    `状态：${statusText}`,
    `日期/类型：${runDate} ${runType}`,
    `新增条数：${newCount}`,
    `高分条数：${highCount}`,
    `网页地址：${siteUrl || "未配置"}`
  ];

  // 成功时尝试附加「今日必看 Top」
  if (status === "success" && isTruthy(values.BARK_INCLUDE_TOP ?? "true")) {
    const topLines = loadTopItems(values);
    if (topLines.length > 0) {
      lines.push("", "今日必看：");
      lines.push(...topLines);
    }
  }

  return {
    body: lines.join("\n"),
    dryRun: isTruthy(values.BARK_DRY_RUN),
    siteUrl,
    targetLabel: values.BARK_NOTIFY_URL ? "BARK_NOTIFY_URL" : "BARK_KEY",
    title
  };
}

/** 读取 overview.json，返回最多 3 条「今日必看」格式行；失败时静默降级返回空数组 */
function loadTopItems(values: EnvMap): string[] {
  const publicDataDir = values.PUBLIC_DATA_DIR?.trim() || "./public-data";
  const overviewPath = resolve(process.cwd(), publicDataDir, "overview.json");

  let events: OverviewEvent[] = [];
  try {
    if (!existsSync(overviewPath)) {
      console.error(`[notify-bark] warning: overview.json not found at ${publicDataDir}/overview.json, skipping Top`);
      return [];
    }
    const raw = readFileSync(overviewPath, "utf-8");
    const parsed = JSON.parse(raw) as { events?: unknown };
    if (!Array.isArray(parsed.events)) {
      console.error("[notify-bark] warning: overview.json has no events array, skipping Top");
      return [];
    }
    events = parsed.events as OverviewEvent[];
  } catch {
    console.error("[notify-bark] warning: failed to parse overview.json, skipping Top");
    return [];
  }

  // 先取 must_read，再按 radar_score 降序补足
  const mustRead = events.filter(e => e.radar_section === "must_read");
  const others = events
    .filter(e => e.radar_section !== "must_read")
    .sort((a, b) => (b.radar_score ?? 0) - (a.radar_score ?? 0));

  const combined = [...mustRead, ...others].slice(0, 3);

  if (combined.length === 0) {
    return ["今日无强信号，可休息一日"];
  }

  return combined.map(e => {
    const level = e.radar_level || "B";
    const rawTitle = (e.title || "").trim();
    // 截断到 30 个字符（中英文均计一位）
    const truncated = rawTitle.length > 30 ? rawTitle.slice(0, 30) + "…" : rawTitle;
    return `• 【${level}】${truncated}`;
  });
}

function buildBarkUrl(values: EnvMap, payload: NotificationPayload): URL {
  const baseUrl = values.BARK_NOTIFY_URL?.trim()
    ? values.BARK_NOTIFY_URL.trim()
    : `https://api.day.app/${encodeURIComponent(required(values.BARK_KEY, "BARK_KEY").trim())}`;
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`BARK_NOTIFY_URL must use http or https, got: ${url.protocol}`);
  }
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${encodeURIComponent(payload.title)}/${encodeURIComponent(payload.body)}`;

  const sound = resolveSound(values);
  if (sound) url.searchParams.set("sound", sound);

  const group = sanitizeQueryValue(values.BARK_GROUP || "行业情报");
  if (group) url.searchParams.set("group", group);

  if (payload.siteUrl) url.searchParams.set("url", payload.siteUrl);

  return url;
}

/** 按优先级决定推送声音：失败强制 alarm；用户显式设置时尊重；否则按 run type 给默认值 */
function resolveSound(values: EnvMap): string {
  const status = normalizeStatus(values.BARK_STATUS);
  if (status === "failed") {
    return "alarm";
  }
  const userSound = sanitizeQueryValue(values.BARK_SOUND);
  if (userSound) return userSound;
  const runType = (values.BARK_RUN_TYPE || values.NAS_RUN_TYPE || "noon").trim().toLowerCase();
  if (runType === "night") return "bell";
  return "birdsong";
}

function assertBarkResponse(httpStatus: number, responseText: string): void {
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new Error(`HTTP ${httpStatus}: ${responseText.slice(0, 200)}`);
  }

  if (!responseText.trim()) return;
  try {
    const parsed = JSON.parse(responseText) as { code?: unknown; message?: unknown };
    if (typeof parsed.code === "number" && parsed.code !== 200) {
      throw new Error(`Bark code ${parsed.code}: ${String(parsed.message || "").slice(0, 160)}`);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return;
    throw error;
  }
}

function hasBarkTarget(values: EnvMap): boolean {
  return Boolean(values.BARK_NOTIFY_URL?.trim() || values.BARK_KEY?.trim());
}

function normalizeStatus(status: string | undefined): "success" | "failed" {
  const normalized = (status || "success").trim().toLowerCase();
  return ["failed", "failure", "error", "fail"].includes(normalized) ? "failed" : "success";
}

function normalizeRunType(runType: string): string {
  const normalized = runType.trim().toLowerCase();
  if (normalized === "morning") return "morning/早报";
  if (normalized === "night") return "night/晚报";
  return "noon/午报";
}

function normalizeDate(value: string): string {
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || today();
}

function normalizeCount(value: string | undefined): string {
  if (!value) return "unknown";
  const match = value.match(/\d+/);
  return match?.[0] || "unknown";
}

function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractToken(message: string | undefined, key: string): string | undefined {
  if (!message) return undefined;
  const match = message.match(new RegExp(`(?:^|[,\\s])${key}=([^,\\s]+)`));
  return match?.[1];
}

function today(timeZone = "Asia/Shanghai"): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).format(new Date());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase());
}

function sanitizeQueryValue(value: string | undefined): string {
  return (value || "").trim().replace(/[\r\n]/g, " ").slice(0, 120);
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function printDryRun(payload: NotificationPayload, target: string): void {
  console.log("Bark dry-run: request not sent.");
  console.log(`target=${target}`);
  console.log(`title=${payload.title}`);
  console.log("body:");
  console.log(payload.body);
}
