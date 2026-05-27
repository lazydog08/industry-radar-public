import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { isNoiseContent } from "../scoring/keywords.js";
import { Store } from "../store/db.js";
import type { EntityHit, EventRecord, EventSourceLink, KnowledgeHealth, ReportRecord } from "../types.js";
import { dateOnly, nowIso } from "../utils/time.js";

type PublicRadarSection = "must_read" | "developing" | "video_ready" | "background";

export interface StaticExportOptions {
  outputDir?: string;
  recentDays?: number;
  eventLimit?: number;
  knowledgeDays?: number;
  knowledgeLimit?: number;
  reportLimit?: number;
  copyReports?: boolean;
}

export interface StaticExportResult {
  outputDir: string;
  generatedAt: string;
  files: string[];
  counts: {
    events: number;
    knowledgeCards: number;
    reports: number;
  };
}

interface PublicSourceLink {
  source: string;
  url?: string;
  title?: string;
  author?: string;
}

interface PublicEvent {
  id: string;
  title: string;
  summary: string;
  what_happened: string;
  why_it_matters: string;
  creator_impact: string;
  content_angle: string;
  cover_angle: string;
  category: EventRecord["category"];
  importance_score: number;
  worth_following: number;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
  source_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  entities: EntityHit[];
  sources: PublicSourceLink[];
  feedback: string[];
  radar_score: number | null;
  radar_level: EventRecord["radar_level"] | null;
  radar_section: PublicRadarSection;
  video_potential: number | null;
  confidence: EventRecord["confidence"] | null;
  freshness_label: EventRecord["freshness_label"] | null;
  freshness_days: number | null;
  push_reason: string;
  score_parts: EventRecord["score_parts"] | null;
  caps: string[];
}

interface PublicReport {
  id: string;
  report_type: ReportRecord["report_type"];
  window_start: string;
  window_end: string;
  event_count: number;
  created_at: string;
  html_url?: string;
  markdown_url?: string;
  files: {
    html?: PublicReportFile;
    markdown?: PublicReportFile;
  };
}

interface PublicReportFile {
  name: string;
  url: string;
  copied: boolean;
  available: boolean;
}

interface PublicKnowledgeHealth {
  metrics: KnowledgeHealth["metrics"];
  queueCounts: KnowledgeHealth["queueCounts"];
  queues: {
    needsEvidence: PublicEvent[];
    videoCandidates: PublicEvent[];
    followUp: PublicEvent[];
    staleButUseful: PublicEvent[];
  };
}

const schemaVersion = 1;

export async function exportStaticSiteData(
  config: AppConfig,
  options: StaticExportOptions = {}
): Promise<StaticExportResult> {
  const outputDir = path.resolve(options.outputDir || process.env.EXPORT_SITE_DIR || process.env.PUBLIC_DATA_DIR || process.env.STATIC_EXPORT_DIR || "public-data");
  const generatedAt = nowIso();
  const recentDays = positiveInt(options.recentDays, 7);
  const eventLimit = positiveInt(options.eventLimit, 300);
  const knowledgeDays = positiveInt(options.knowledgeDays, 90);
  const knowledgeLimit = positiveInt(options.knowledgeLimit, 300);
  const reportLimit = positiveInt(options.reportLimit, 120);
  const copyReports = options.copyReports ?? process.env.EXPORT_COPY_REPORTS !== "false";
  const databaseExistedBeforeExport = fs.existsSync(config.databasePath);
  const databaseSizeBeforeExport = databaseExistedBeforeExport ? statSize(config.databasePath) : 0;

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.mkdir(path.join(outputDir, "reports"), { recursive: true });

  const store = new Store(config);
  try {
    const events = store.getRecentEvents(recentDays, eventLimit).map(toPublicEvent).filter(isPublicEventAllowed);
    const knowledgeEvents = store.getRecentEvents(knowledgeDays, knowledgeLimit).map(toPublicEvent).filter(isPublicEventAllowed);
    const reports = await Promise.all(
      store.listReports(reportLimit).map((report) => toPublicReport(report, config.reportOutputDir, outputDir, copyReports))
    );
    const facets = store.listFacets();
    const knowledgeHealth = filterPublicKnowledgeHealth(toPublicKnowledgeHealth(store.getKnowledgeHealth(12)));
    const sections = groupBySection(events);
    const today = dateOnly();
    const todayEvents = events.filter((event) => event.first_seen_at.startsWith(today) || event.last_seen_at.startsWith(today) || event.updated_at.startsWith(today));
    const todaySections = groupBySection(todayEvents);
    const metrics = buildMetrics(events, reports, sections);
    const notes = buildMetaNotes({
      databaseExistedBeforeExport,
      databaseSizeBeforeExport,
      events: events.length,
      reports: reports.length
    });

    const files: string[] = [];
    files.push(
      await writeJson(outputDir, "overview.json", {
        schemaVersion,
        generatedAt,
        timezone: config.timezone,
        metrics,
        sections,
        today,
        todaySections,
        eventTotal: events.length,
        eventPreviewCount: Math.min(events.length, 80),
        links: {
          events: "events.json",
          knowledge: "knowledge.json",
          reports: "reports/index.json",
          meta: "meta.json"
        },
        events: events.slice(0, 80),
        reports: reports.slice(0, 20),
        facets,
        knowledgeHealth
      })
    );
    files.push(
      await writeJson(outputDir, "events.json", {
        schemaVersion,
        generatedAt,
        timezone: config.timezone,
        recentDays,
        total: events.length,
        events
      })
    );
    files.push(
      await writeJson(outputDir, "knowledge.json", {
        schemaVersion,
        generatedAt,
        timezone: config.timezone,
        total: knowledgeEvents.length,
        metrics: knowledgeHealth.metrics,
        queueCounts: knowledgeHealth.queueCounts,
        queues: knowledgeHealth.queues,
        cards: knowledgeEvents
      })
    );
    files.push(
      await writeJson(outputDir, path.join("reports", "index.json"), {
        schemaVersion,
        generatedAt,
        timezone: config.timezone,
        total: reports.length,
        reports
      })
    );
    files.push(
      await writeJson(outputDir, "meta.json", {
        schemaVersion,
        generatedAt,
        timezone: config.timezone,
        exporter: "industry-radar-static-export",
        output: {
          layout: "public-data",
          files: ["overview.json", "events.json", "knowledge.json", "reports/index.json", "meta.json"]
        },
        source: {
          databaseFile: path.basename(config.databasePath),
          databaseExistedBeforeExport,
          databaseSizeBytesBeforeExport: databaseSizeBeforeExport,
          reportDirectory: path.basename(config.reportOutputDir)
        },
        counts: {
          events: events.length,
          knowledgeCards: knowledgeEvents.length,
          reports: reports.length,
          todayEvents: todayEvents.length
        },
        empty: events.length === 0 && knowledgeEvents.length === 0 && reports.length === 0,
        notes
      })
    );

    return {
      outputDir,
      generatedAt,
      files,
      counts: {
        events: events.length,
        knowledgeCards: knowledgeEvents.length,
        reports: reports.length
      }
    };
  } finally {
    store.close();
  }
}

function toPublicEvent(event: EventRecord): PublicEvent {
  return {
    id: event.id,
    title: event.title,
    summary: cleanPublicCopy(event.summary),
    what_happened: cleanPublicCopy(event.what_happened),
    why_it_matters: cleanPublicCopy(event.why_it_matters),
    creator_impact: cleanPublicCopy(event.creator_impact),
    content_angle: cleanPublicCopy(event.content_angle),
    cover_angle: cleanPublicCopy(event.cover_angle),
    category: event.category,
    importance_score: event.importance_score,
    worth_following: event.worth_following,
    first_seen_at: event.first_seen_at,
    last_seen_at: event.last_seen_at,
    status: event.status,
    source_count: event.source_count,
    created_at: event.created_at,
    updated_at: event.updated_at,
    tags: event.tags || [],
    entities: event.entities || [],
    sources: (event.sources || []).map(toPublicSourceLink),
    feedback: event.feedback || [],
    radar_score: event.radar_score ?? null,
    radar_level: event.radar_level ?? null,
    radar_section: normalizeSection(event.radar_section) || fallbackSection(event),
    video_potential: event.video_potential ?? null,
    confidence: event.confidence ?? null,
    freshness_label: event.freshness_label ?? null,
    freshness_days: event.freshness_days ?? null,
    push_reason: cleanPublicCopy(event.push_reason),
    score_parts: event.score_parts || null,
    caps: event.caps || []
  };
}

function toPublicSourceLink(source: EventSourceLink): PublicSourceLink {
  return {
    source: source.source,
    url: safePublicUrl(source.url),
    title: source.title,
    author: source.author
  };
}

async function toPublicReport(
  report: ReportRecord,
  reportOutputDir: string,
  outputDir: string,
  copyReports: boolean
): Promise<PublicReport> {
  const html = await buildReportFile(report.html_path, "html", reportOutputDir, outputDir, copyReports);
  const markdown = await buildReportFile(report.markdown_path, "markdown", reportOutputDir, outputDir, copyReports);
  return {
    id: report.id,
    report_type: report.report_type,
    window_start: report.window_start,
    window_end: report.window_end,
    event_count: report.event_count,
    created_at: report.created_at,
    html_url: html?.url,
    markdown_url: markdown?.url,
    files: {
      html,
      markdown
    }
  };
}

async function buildReportFile(
  filePath: string,
  _kind: "html" | "markdown",
  reportOutputDir: string,
  outputDir: string,
  copyReports: boolean
): Promise<PublicReportFile | undefined> {
  const name = path.basename(filePath || "");
  if (!name) return undefined;
  const url = `reports/${name}`;
  const sourcePath = path.resolve(filePath);
  const reportDir = path.resolve(reportOutputDir);
  const available = sourcePath.startsWith(`${reportDir}${path.sep}`) && fs.existsSync(sourcePath);
  if (copyReports && available) {
    await fs.promises.copyFile(sourcePath, path.join(outputDir, "reports", name));
  }
  return {
    name,
    url,
    copied: Boolean(copyReports && available),
    available
  };
}

function toPublicKnowledgeHealth(health: KnowledgeHealth): PublicKnowledgeHealth {
  return {
    metrics: health.metrics,
    queueCounts: health.queueCounts,
    queues: {
      needsEvidence: health.queues.needsEvidence.map(toPublicEvent),
      videoCandidates: health.queues.videoCandidates.map(toPublicEvent),
      followUp: health.queues.followUp.map(toPublicEvent),
      staleButUseful: health.queues.staleButUseful.map(toPublicEvent)
    }
  };
}

function filterPublicKnowledgeHealth(health: PublicKnowledgeHealth): PublicKnowledgeHealth {
  const queues = {
    needsEvidence: health.queues.needsEvidence.filter(isPublicEventAllowed),
    videoCandidates: health.queues.videoCandidates.filter(isPublicEventAllowed),
    followUp: health.queues.followUp.filter(isPublicEventAllowed),
    staleButUseful: health.queues.staleButUseful.filter(isPublicEventAllowed)
  };
  return {
    ...health,
    queueCounts: {
      needsEvidence: queues.needsEvidence.length,
      videoCandidates: queues.videoCandidates.length,
      followUp: queues.followUp.length,
      staleButUseful: queues.staleButUseful.length
    },
    queues
  };
}

function isPublicEventAllowed(event: PublicEvent): boolean {
  return !isNoiseContent(event.title);
}

function cleanPublicCopy(value: string | undefined | null): string {
  return String(value || "")
    .replace(/；?具备视频选题潜力/g, "")
    .replace(/、可信度和视频潜力决定是否推到首页/g, "和可信度决定是否推到首页")
    .replace(/可信度和视频潜力决定是否推到首页/g, "可信度决定是否推到首页")
    .replace(/视频潜力决定是否推到首页/g, "内容价值决定是否推到首页")
    .replace(/、可信度和视频潜力/g, "和可信度")
    .replace(/、视频潜力/g, "")
    .replace(/视频潜力/g, "内容价值")
    .replace(/；{2,}/g, "；")
    .replace(/^；|；$/g, "")
    .trim();
}

function groupBySection(events: PublicEvent[]): Record<PublicRadarSection, PublicEvent[]> {
  return {
    must_read: events.filter((event) => event.radar_section === "must_read"),
    developing: events.filter((event) => event.radar_section === "developing"),
    video_ready: events.filter((event) => event.radar_section === "video_ready"),
    background: events.filter((event) => event.radar_section === "background")
  };
}

function buildMetrics(
  events: PublicEvent[],
  reports: PublicReport[],
  sections: Record<PublicRadarSection, PublicEvent[]>
): Record<string, number> {
  return {
    recentEvents: events.length,
    important: events.filter((event) => (event.radar_score || event.importance_score) >= 70).length,
    following: events.filter((event) => event.feedback.includes("follow")).length,
    reports: reports.length,
    mustRead: sections.must_read.length,
    developing: sections.developing.length,
    videoReady: sections.video_ready.length,
    background: sections.background.length,
    highConfidence: events.filter((event) => event.confidence === "high").length
  };
}

function fallbackSection(event: EventRecord): PublicRadarSection {
  const score = event.radar_score || event.importance_score || 0;
  if (score >= 75) return "must_read";
  if (score >= 58) return "developing";
  return "background";
}

function normalizeSection(value: unknown): PublicRadarSection | undefined {
  if (value === "video_ready") return "developing";
  if (value === "must_read" || value === "developing" || value === "video_ready" || value === "background") {
    return value;
  }
  return undefined;
}

function safePublicUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeJson(outputDir: string, relativePath: string, value: unknown): Promise<string> {
  const filePath = path.join(outputDir, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.promises.rename(tempPath, filePath);
  return filePath;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

function statSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function buildMetaNotes(input: {
  databaseExistedBeforeExport: boolean;
  databaseSizeBeforeExport: number;
  events: number;
  reports: number;
}): string[] {
  const notes: string[] = [];
  if (!input.databaseExistedBeforeExport) {
    notes.push("导出前数据库文件不存在，脚本已按当前迁移创建空库并导出空结构。");
  } else if (input.databaseSizeBeforeExport === 0) {
    notes.push("导出前数据库文件为空，当前 JSON 可能只包含空结构。");
  }
  if (input.events === 0) notes.push("当前最近窗口没有事件，线上页面应展示空状态。");
  if (input.reports === 0) notes.push("当前没有报告归档，reports/index.json 已保留空数组。");
  return notes;
}
