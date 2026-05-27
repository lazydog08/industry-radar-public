import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "./config.js";
import { Store } from "./store/db.js";
import type { FeedbackType, SearchFilters } from "./types.js";
import type { EventRecord } from "./types.js";
import { startInternalScheduler } from "./scheduler.js";

const config = loadConfig();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "web");
const publicDataDir = path.resolve(process.env.PUBLIC_DATA_DIR || process.env.EXPORT_SITE_DIR || "public-data");

app.use(express.json());
app.use("/public-data", express.static(publicDataDir, { fallthrough: true, index: false }));

app.get("/", (_req, res) => {
  res.type("html").send(fs.readFileSync(path.join(webDir, "index.html"), "utf8"));
});

app.get("/styles.css", (_req, res) => {
  res.type("css").send(fs.readFileSync(path.join(webDir, "styles.css"), "utf8"));
});

app.get("/app.js", (_req, res) => {
  const jsPath = path.join(webDir, "app.js");
  if (!fs.existsSync(jsPath)) {
    res.status(404).type("text/plain").send("app.js not found");
    return;
  }
  res.type("application/javascript").send(fs.readFileSync(jsPath, "utf8"));
});

app.get("/filter-summary.js", (_req, res) => {
  const jsPath = path.join(webDir, "filter-summary.js");
  if (!fs.existsSync(jsPath)) {
    res.status(404).type("text/plain").send("filter-summary.js not found");
    return;
  }
  res.type("application/javascript").send(fs.readFileSync(jsPath, "utf8"));
});

app.get("/editorial-frontpage.js", (_req, res) => {
  const jsPath = path.join(webDir, "editorial-frontpage.js");
  if (!fs.existsSync(jsPath)) {
    res.status(404).type("text/plain").send("editorial-frontpage.js not found");
    return;
  }
  res.type("application/javascript").send(fs.readFileSync(jsPath, "utf8"));
});

function withStore<T>(fn: (store: Store) => T): T {
  const store = new Store(config);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

app.get("/api/events/recent", (req, res) => {
  const days = parseDays(req.query.days);
  const events = withStore((store) => store.getRecentEvents(days));
  res.json({ events });
});

app.get("/api/overview", (_req, res) => {
  const payload = withStore((store) => {
    const events = store.getRecentEvents(7, 80);
    const reports = store.listReports(20).map(withReportUrl);
    const facets = store.listFacets();
    const knowledgeHealth = store.getKnowledgeHealth(6);
    return { events, reports, facets, knowledgeHealth };
  });
  const { events, reports, facets, knowledgeHealth } = payload;
  const important = events.filter((event) => (event.radar_score || event.importance_score) >= 70).length;
  const following = events.filter((event) => event.feedback?.includes("follow")).length;
  const sections = countSections(events);
  res.json({
    metrics: {
      recentEvents: events.length,
      important,
      following,
      reports: reports.length,
      mustRead: sections.must_read,
      developing: sections.developing,
      videoReady: sections.video_ready,
      background: sections.background,
      highConfidence: events.filter((event) => event.confidence === "high").length
    },
    events,
    reports,
    facets,
    knowledgeHealth
  });
});

app.get("/api/facets", (_req, res) => {
  const facets = withStore((store) => store.listFacets());
  res.json({ facets });
});

app.get("/api/knowledge/health", (_req, res) => {
  const knowledgeHealth = withStore((store) => store.getKnowledgeHealth(12));
  res.json({ knowledgeHealth });
});

app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  const filters: SearchFilters = {
    category: parseCategory(req.query.category),
    source: req.query.source ? String(req.query.source) : undefined,
    tag: req.query.tag ? String(req.query.tag) : undefined,
    entity: req.query.entity ? String(req.query.entity) : undefined,
    favorite: req.query.favorite === "true",
    follow: req.query.follow === "true",
    ignored: req.query.ignored === "true",
    usedForVideo: req.query.usedForVideo === "true",
    from: parseDateFilter(req.query.from, "start"),
    to: parseDateFilter(req.query.to, "end"),
    limit: 80
  };
  const hasFilters = Boolean(filters.category || filters.source || filters.tag || filters.entity || filters.favorite || filters.follow || filters.ignored || filters.usedForVideo || filters.from || filters.to);
  const events = withStore((store) => (q || hasFilters ? store.searchEvents(q, filters) : store.getRecentEvents(7, 80)));
  res.json({ events });
});

app.get("/api/events/:id", (req, res) => {
  const event = withStore((store) => store.getEvent(req.params.id));
  if (!event) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ event });
});

app.post("/api/events/:id/feedback", (req, res) => {
  const feedbackType = String(req.body.feedbackType || "") as FeedbackType;
  const allowed: FeedbackType[] = ["useful", "not_useful", "follow", "ignore", "used_for_video", "favorite"];
  if (!allowed.includes(feedbackType)) {
    res.status(400).json({ error: "invalid feedbackType" });
    return;
  }
  const event = withStore((store) => {
    store.setFeedback(req.params.id, feedbackType, Boolean(req.body.enabled));
    return store.getEvent(req.params.id);
  });
  res.json({ event });
});

app.get("/api/reports", (_req, res) => {
  const reports = withStore((store) => store.listReports().map(withReportUrl));
  res.json({ reports });
});

app.get("/api/timeline", (req, res) => {
  const q = String(req.query.q || "").trim();
  const events = q ? withStore((store) => store.getTimeline(q)) : [];
  res.json({ events });
});

app.get("/reports/:file", (req, res, next) => {
  const file = path.basename(req.params.file);
  const reportDir = path.resolve(config.reportOutputDir);
  const fullPath = path.resolve(reportDir, file);
  if (!fullPath.startsWith(`${reportDir}${path.sep}`)) {
    res.status(400).send("invalid report path");
    return;
  }
  if (!fs.existsSync(fullPath)) {
    res.status(404).send("not found");
    return;
  }
  res.sendFile(fullPath, (error) => {
    if (error) next(error);
  });
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: "internal server error" });
});

app.listen(config.port, config.serverHost, () => {
  console.log(`行业情报雷达 Web UI: http://${config.serverHost}:${config.port}`);
  if (config.enableInternalScheduler) {
    startInternalScheduler(config);
  }
});

function withReportUrl<T extends { html_path: string; markdown_path: string }>(report: T): T & { html_url: string; markdown_url: string } {
  return {
    ...report,
    html_url: `/reports/${path.basename(report.html_path)}`,
    markdown_url: `/reports/${path.basename(report.markdown_path)}`
  };
}

function countSections(events: EventRecord[]): Record<"must_read" | "developing" | "video_ready" | "background", number> {
  const result = {
    must_read: 0,
    developing: 0,
    video_ready: 0,
    background: 0
  };
  for (const event of events) {
    const section = normalizeSection(event.radar_section) || fallbackSection(event);
    result[section] += 1;
  }
  return result;
}

function normalizeSection(value: unknown): keyof ReturnType<typeof countSections> | undefined {
  if (value === "video_ready") return "developing";
  if (value === "must_read" || value === "developing" || value === "video_ready" || value === "background") {
    return value;
  }
  return undefined;
}

function parseCategory(value: unknown): SearchFilters["category"] | undefined {
  const text = value ? String(value) : "";
  if (text === "digital" || text === "media" || text === "auto" || text === "mixed" || text === "unknown") return text;
  return undefined;
}

function parseDateFilter(value: unknown, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return `${text}${boundary === "start" ? "T00:00:00+08:00" : "T23:59:59+08:00"}`;
}

function parseDays(value: unknown): number {
  const days = Number.parseInt(String(value || "7"), 10);
  if (!Number.isFinite(days) || days < 1) return 7;
  return Math.min(days, 90);
}

function fallbackSection(event: EventRecord): keyof ReturnType<typeof countSections> {
  const score = event.radar_score || event.importance_score || 0;
  if (score >= 75) return "must_read";
  if (score >= 58) return "developing";
  return "background";
}
