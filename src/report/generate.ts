import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { DailyReportType, GeneratedReport, PeriodReportType, SourceFetchResult, SourceItem, SourceStatus } from "../types.js";
import { Store } from "../store/db.js";
import { makeId } from "../utils/ids.js";
import { filenameDate, isBetween, reportWindow, toShanghaiIso } from "../utils/time.js";
import { getSourceAdapters, mockSource } from "../sources/index.js";
import { logger } from "../utils/logger.js";
import { toGeneratedReport } from "./templates.js";
import { pushLocalReport } from "../push/local.js";
import { pushWebhook } from "../push/webhook.js";

export interface RunReportOptions {
  type: DailyReportType;
  date?: string;
  useMock?: boolean;
  mockFallback?: boolean;
}

export async function runReport(config: AppConfig, options: RunReportOptions): Promise<GeneratedReport> {
  const window = reportWindow(options.type, options.date);
  const store = new Store(config);
  const runId = store.startRun(`report:${options.type}`, { date: window.date, mock: Boolean(options.useMock) });
  try {
    const adapters = getSourceAdapters(Boolean(options.useMock));
    const results = await Promise.all(adapters.map((adapter) => adapter.fetch({ window, useMock: Boolean(options.useMock), logger })));
    const windowedResults = filterResultsToWindow(results, window.start, window.end);
    const liveItems = windowedResults.flatMap((result) => result.items);
    let allResults = windowedResults;
    let allItems = liveItems;

    if (!options.useMock && options.mockFallback && allItems.length === 0) {
      const mockResult = await mockSource.fetch({ window, useMock: true, logger });
      allResults = [...results, { ...mockResult, source: "mock-fallback" }];
      allItems = mockResult.items;
    }

    const ingest = store.ingestSourceItems(allItems);
    const touchedEvents = store.getEventsByIds(ingest.eventIds);
    const noonIds = options.type === "night" ? store.getReportEventIds(window.date, "noon") : new Set<string>();
    const updatedEvents = touchedEvents.filter((event) => noonIds.has(event.id) || event.first_seen_at < window.start);
    const updatedIds = new Set(updatedEvents.map((event) => event.id));
    const newEvents = touchedEvents.filter(
      (event) => !updatedIds.has(event.id) && event.first_seen_at >= window.start && event.first_seen_at <= window.end
    );
    const sourceStatuses = toSourceStatuses(allResults);
    const reportId = makeId("report", `${options.type}:${window.date}:${Date.now()}`);
    const fileBase = `${filenameDate(window)}-${options.type}`;
    const htmlPath = path.join(config.reportOutputDir, `${fileBase}.html`);
    const markdownPath = path.join(config.reportOutputDir, `${fileBase}.md`);
    const report = toGeneratedReport(
      {
        id: reportId,
        type: options.type,
        window,
        newEvents,
        updatedEvents,
        sourceStatuses
      },
      htmlPath,
      markdownPath
    );

    fs.mkdirSync(config.reportOutputDir, { recursive: true });
    fs.writeFileSync(markdownPath, report.markdown, "utf8");
    fs.writeFileSync(htmlPath, report.html, "utf8");
    store.saveReport({
      id: report.id,
      reportType: options.type,
      windowStart: window.start,
      windowEnd: window.end,
      htmlPath,
      markdownPath,
      newEventIds: newEvents.map((event) => event.id),
      updatedEventIds: updatedEvents.map((event) => event.id)
    });

    pushLocalReport(report);
    await pushWebhook(config, report);

    const failures = sourceStatuses.filter((status) => !status.ok);
    store.finishRun(runId, failures.length ? "partial_success" : "success", failures.map((item) => `${item.source}: ${item.error}`).join("; "), {
      eventCount: touchedEvents.length,
      sourceStatuses
    });
    store.close();
    return report;
  } catch (error) {
    store.finishRun(runId, "failed", error instanceof Error ? error.message : String(error));
    store.close();
    throw error;
  }
}

export function generatePeriodReport(config: AppConfig, type: PeriodReportType): GeneratedReport {
  const store = new Store(config);
  const window = reportWindow(type);
  const days = type === "weekly" ? 7 : 30;
  const events = store.getRecentEvents(days, type === "weekly" ? 30 : 80);
  const reportId = makeId("report", `${type}:${window.date}:${Date.now()}`);
  const htmlPath = path.join(config.reportOutputDir, `${filenameDate(window)}-${type}.html`);
  const markdownPath = path.join(config.reportOutputDir, `${filenameDate(window)}-${type}.md`);
  const report = toGeneratedReport(
    {
      id: reportId,
      type,
      window,
      newEvents: events,
      updatedEvents: [],
      sourceStatuses: [{ source: "database", ok: true, count: events.length }]
    },
    htmlPath,
    markdownPath
  );
  fs.writeFileSync(markdownPath, report.markdown, "utf8");
  fs.writeFileSync(htmlPath, report.html, "utf8");
  store.saveReport({
    id: report.id,
    reportType: type,
    windowStart: window.start,
    windowEnd: window.end,
    htmlPath,
    markdownPath,
    newEventIds: events.map((event) => event.id),
    updatedEventIds: []
  });
  store.close();
  pushLocalReport(report);
  return report;
}

function toSourceStatuses(results: SourceFetchResult[]): SourceStatus[] {
  return results.map((result) => ({
    source: result.source,
    ok: result.ok,
    count: result.items.length,
    error: result.error,
    warnings: result.warnings
  }));
}

export function filterResultsToWindow(results: SourceFetchResult[], start: string, end: string): SourceFetchResult[] {
  return results.map((result) => {
    const kept = result.items.filter((item) => isBetween(item.publishedAt || item.fetchedAt, start, end) || isImportantBackfillItem(item, start, end));
    const omitted = result.items.length - kept.length;
    return {
      ...result,
      items: kept,
      warnings: omitted > 0 ? [...(result.warnings || []), `${omitted} 条不在报告时间窗口内，已排除`] : result.warnings
    };
  });
}

function isImportantBackfillItem(item: SourceItem, start: string, end: string): boolean {
  const publishedAt = item.publishedAt || item.fetchedAt;
  if (!publishedAt || publishedAt > end) return false;
  if (publishedAt < daysBefore(start, 3)) return false;

  const text = `${item.title} ${item.summaryRaw || ""}`;
  const hasHardTechSignal = item.tags.includes("半导体突破") || /韬|τ|半导体|晶体管|逻辑折叠|产业新原则|技术突破/.test(text);
  const hasOfficialHighValueSignal =
    item.source === "huawei-news" && item.tags.some((tag) => ["半导体突破", "系统更新", "发布会", "平台规则", "智驾", "AI"].includes(tag));
  return hasHardTechSignal || hasOfficialHighValueSignal;
}

function daysBefore(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() - days);
  return toShanghaiIso(date);
}
