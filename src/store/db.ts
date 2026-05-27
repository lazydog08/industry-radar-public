import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { EntityHit, EventRecord, FeedbackType, KnowledgeHealth, ReportRecord, SearchFilters, SourceItem } from "../types.js";
import { makeId, stableHash } from "../utils/ids.js";
import { nowIso, toShanghaiIso } from "../utils/time.js";
import { canonicalTitle, titleSimilarity } from "../normalize/title.js";
import { detectCategory, detectEntities, detectTags } from "../scoring/keywords.js";
import { scoreItem } from "../scoring/score.js";
import { buildRadarForEvent, type RadarSignal } from "../scoring/radar.js";
import { buildKnowledgeDraft } from "../kb/knowledge.js";

type Row = Record<string, unknown>;

export interface IngestResult {
  eventIds: string[];
  newEventIds: string[];
  updatedEventIds: string[];
  sourceItemIds: string[];
}

export class Store {
  private db: DatabaseSync;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.db = new DatabaseSync(config.databasePath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    try {
      this.migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
    const version = "001_init";
    const applied = this.db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(version);
    if (applied) return;
    const migrationPath = path.resolve(this.config.rootDir, "migrations/001_init.sql");
    let sql: string;
    try {
      sql = fs.readFileSync(migrationPath, "utf8");
    } catch (error) {
      throw new Error(`数据库迁移文件读取失败：${migrationPath}；${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      this.db.exec("BEGIN IMMEDIATE");
      this.db.exec(sql);
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)").run(version, nowIso());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  startRun(runType: string, meta: Record<string, unknown> = {}): string {
    const id = makeId("run", `${runType}-${Date.now()}`);
    this.db
      .prepare("INSERT INTO run_logs(id, run_type, started_at, status, meta_json) VALUES(?, ?, ?, ?, ?)")
      .run(id, runType, nowIso(), "running", JSON.stringify(meta));
    return id;
  }

  finishRun(id: string, status: string, errorSummary?: string, meta: Record<string, unknown> = {}): void {
    this.db
      .prepare("UPDATE run_logs SET ended_at = ?, status = ?, error_summary = ?, meta_json = ? WHERE id = ?")
      .run(nowIso(), status, errorSummary || null, JSON.stringify(meta), id);
  }

  ingestSourceItems(items: SourceItem[]): IngestResult {
    const result: IngestResult = {
      eventIds: [],
      newEventIds: [],
      updatedEventIds: [],
      sourceItemIds: []
    };

    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const item of items) {
        const sourceItemId = this.upsertSourceItem(item);
        result.sourceItemIds.push(sourceItemId);
        const match = this.findMatchingEvent(item);
        if (match) {
          this.linkEventSource(match.id, sourceItemId, item);
          this.updateEventFromItem(match, item);
          result.updatedEventIds.push(match.id);
          result.eventIds.push(match.id);
        } else {
          const eventId = this.createEventFromItem(item, sourceItemId);
          result.newEventIds.push(eventId);
          result.eventIds.push(eventId);
        }
      }
      result.eventIds = Array.from(new Set(result.eventIds));
      result.newEventIds = Array.from(new Set(result.newEventIds));
      result.updatedEventIds = Array.from(new Set(result.updatedEventIds));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return result;
  }

  upsertSourceItem(item: SourceItem): string {
    const hash = stableHash([item.source, item.url, item.title]);
    const existing = this.db.prepare("SELECT id FROM source_items WHERE hash = ?").get(hash) as Row | undefined;
    if (existing?.id) return String(existing.id);

    const id = item.id || makeId("src", hash);
    this.db
      .prepare(
        `INSERT INTO source_items(
          id, source, title, url, author, category, published_at, fetched_at,
          raw_excerpt, raw_json, hash, heat_score, engagement_json, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        item.source,
        item.title,
        item.url,
        item.author || null,
        item.category,
        item.publishedAt,
        item.fetchedAt,
        item.summaryRaw || null,
        JSON.stringify(item.raw || {}),
        hash,
        item.heatScore || 0,
        JSON.stringify(item.engagement || {}),
        nowIso()
      );
    return id;
  }

  private findMatchingEvent(item: SourceItem): EventRecord | null {
    const canonical = canonicalTitle(item.title);
    const exact = this.db.prepare("SELECT * FROM events WHERE canonical_title = ? LIMIT 1").get(canonical) as Row | undefined;

    const text = `${item.title} ${item.summaryRaw || ""}`;
    const category = item.category === "unknown" ? detectCategory(text) : item.category;
    const tags = new Set([...item.tags, ...detectTags(text, category)]);
    const entities = detectEntities(text);
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY updated_at DESC LIMIT 500")
      .all() as Row[];
    let best: { row: Row; score: number } | null = exact ? { row: exact, score: 0.94 } : null;
    for (const row of rows) {
      const event = this.rowToEvent(row);
      const score = this.eventMatchScore(event, item, tags, entities, category);
      if (score >= 0.82 && isBetterMatch(row, score, best)) {
        best = { row, score };
      }
    }
    return best ? this.rowToEvent(best.row) : null;
  }

  private eventMatchScore(
    event: EventRecord,
    item: SourceItem,
    itemTags: Set<string>,
    itemEntities: EntityHit[],
    itemCategory: EventRecord["category"]
  ): number {
    const titleScore = titleSimilarity(item.title, event.title);
    if (titleScore >= 0.9) return titleScore;

    const eventTags = this.getEventTags(event.id);
    const eventEntities = this.getEventEntities(event.id);
    const sharedTags = eventTags.filter((tag) => itemTags.has(tag));
    const sharedEntities = countEntityOverlap(eventEntities, itemEntities);
    const strongSharedTags = sharedTags.filter((tag) =>
      ["发布会", "系统更新", "智驾", "平台规则", "AI手机", "影像", "争议"].includes(tag)
    );
    const sameCategory =
      event.category === itemCategory || event.category === "mixed" || itemCategory === "mixed" || event.category === "unknown";
    const dayGap = daysBetween(item.publishedAt || item.fetchedAt, event.last_seen_at);
    const recentEnough = dayGap <= (strongSharedTags.includes("发布会") ? 30 : 18);

    let score = titleScore * 0.62;
    score += Math.min(sharedTags.length, 3) * 0.08;
    score += Math.min(sharedEntities, 2) * 0.1;
    score += Math.min(strongSharedTags.length, 2) * 0.08;
    if (sameCategory) score += 0.1;
    if (sharedEntities > 0 && strongSharedTags.length > 0 && recentEnough) score += 0.18;
    if (sharedEntities > 0 && sharedTags.length >= 2 && recentEnough) score += 0.12;
    if (!recentEnough) score -= 0.24;
    return Math.max(0, Math.min(1, score));
  }

  private createEventFromItem(item: SourceItem, sourceItemId: string): string {
    const text = `${item.title} ${item.summaryRaw || ""}`;
    const category = item.category === "unknown" ? detectCategory(text) : item.category;
    const tags = Array.from(new Set([...item.tags, ...detectTags(text, category)]));
    const entities = detectEntities(text);
    const draft = buildKnowledgeDraft({ ...item, category }, tags, entities);
    const score = scoreItem({ ...item, category }, tags, entities, 1);
    const id = makeId("evt", `${item.source}-${item.title}-${item.url}`);
    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO events(
          id, title, canonical_title, summary, what_happened, why_it_matters,
          creator_impact, content_angle, cover_angle, category, importance_score,
          worth_following, first_seen_at, last_seen_at, status, source_count,
          embedding_provider, embedding_json, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        item.title,
        canonicalTitle(item.title),
        draft.summary,
        draft.whatHappened,
        draft.whyItMatters,
        draft.creatorImpact,
        draft.contentAngle,
        draft.coverAngle,
        category,
        score,
        draft.worthFollowing ? 1 : 0,
        item.publishedAt || item.fetchedAt,
        item.fetchedAt,
        "active",
        1,
        null,
        null,
        now,
        now
      );

    this.linkEventSource(id, sourceItemId, item);
    this.attachTags(id, tags);
    this.attachEntities(id, entities);
    this.reindexEvent(id);
    return id;
  }

  private updateEventFromItem(event: EventRecord, item: SourceItem): void {
    const text = `${item.title} ${item.summaryRaw || ""}`;
    const category = event.category === "unknown" ? detectCategory(text) : event.category;
    const existingTags = this.getEventTags(event.id);
    const tags = Array.from(new Set([...existingTags, ...item.tags, ...detectTags(text, category)]));
    const existingEntities = this.getEventEntities(event.id);
    const entities = mergeEntities(existingEntities, detectEntities(text));
    const sourceCount = this.getSourceCount(event.id);
    const draft = buildKnowledgeDraft({ ...item, category }, tags, entities);
    const nextScore = scoreItem({ ...item, category }, tags, entities, sourceCount);
    const worthFollowing = event.worth_following || tags.some((tag) => ["发布会", "系统更新", "智驾", "平台规则", "争议"].includes(tag));

    this.db
      .prepare(
        `UPDATE events
         SET summary = ?, what_happened = ?, why_it_matters = ?, creator_impact = ?,
             content_angle = ?, cover_angle = ?, last_seen_at = ?, source_count = ?,
             importance_score = ?, worth_following = ?, updated_at = ?, category = ?
         WHERE id = ?`
      )
      .run(
        preferText(event.summary, draft.summary, event.importance_score, nextScore),
        preferText(event.what_happened, draft.whatHappened, event.importance_score, nextScore),
        preferText(event.why_it_matters, draft.whyItMatters, event.importance_score, nextScore),
        preferText(event.creator_impact, draft.creatorImpact, event.importance_score, nextScore),
        preferText(event.content_angle, draft.contentAngle, event.importance_score, nextScore),
        preferText(event.cover_angle, draft.coverAngle, event.importance_score, nextScore),
        item.fetchedAt,
        sourceCount,
        nextScore,
        worthFollowing ? 1 : 0,
        nowIso(),
        category,
        event.id
      );

    this.attachTags(event.id, tags);
    this.attachEntities(event.id, entities);
    this.reindexEvent(event.id);
  }

  private linkEventSource(eventId: string, sourceItemId: string, item: SourceItem): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO event_sources(event_id, source_item_id, source, url, created_at) VALUES(?, ?, ?, ?, ?)"
      )
      .run(eventId, sourceItemId, item.source, item.url, nowIso());
  }

  private attachTags(eventId: string, tags: string[]): void {
    for (const tag of tags.filter(Boolean)) {
      const id = makeId("tag", tag);
      this.db.prepare("INSERT OR IGNORE INTO tags(id, name) VALUES(?, ?)").run(id, tag);
      this.db.prepare("INSERT OR IGNORE INTO event_tags(event_id, tag_id) VALUES(?, ?)").run(eventId, id);
    }
  }

  private attachEntities(eventId: string, entities: EntityHit[]): void {
    for (const entity of entities) {
      const id = makeId("ent", `${entity.type}:${entity.name}`);
      this.db
        .prepare("INSERT OR IGNORE INTO entities(id, name, type, aliases) VALUES(?, ?, ?, ?)")
        .run(id, entity.name, entity.type, JSON.stringify(entity.aliases));
      this.db.prepare("INSERT OR IGNORE INTO event_entities(event_id, entity_id) VALUES(?, ?)").run(eventId, id);
    }
  }

  private reindexEvent(eventId: string): void {
    const event = this.getEvent(eventId);
    if (!event) return;
    const tags = this.getEventTags(eventId).join(" ");
    const entities = this.getEventEntities(eventId).map((entity) => `${entity.name} ${entity.aliases.join(" ")}`).join(" ");
    this.db.prepare("DELETE FROM event_fts WHERE event_id = ?").run(eventId);
    this.db
      .prepare(
        `INSERT INTO event_fts(
          event_id, title, summary, what_happened, why_it_matters,
          creator_impact, content_angle, tags, entities
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.title,
        event.summary,
        event.what_happened,
        event.why_it_matters,
        event.creator_impact,
        event.content_angle,
        tags,
        entities
      );
  }

  getEvent(id: string): EventRecord | null {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as Row | undefined;
    return row ? this.hydrateEvent(this.rowToEvent(row)) : null;
  }

  getEventsByIds(ids: string[]): EventRecord[] {
    const unique = Array.from(new Set(ids));
    return unique
      .map((id) => this.getEvent(id))
      .filter((event): event is EventRecord => Boolean(event))
      .sort(sortHydratedEvents);
  }

  getRecentEvents(days = 7, limit = 80): EventRecord[] {
    const start = toShanghaiIso(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    const rows = this.db
      .prepare("SELECT * FROM events WHERE updated_at >= ? ORDER BY importance_score DESC, updated_at DESC LIMIT ?")
      .all(start, limit) as Row[];
    return this.collapseSimilarEvents(rows.map((row) => this.hydrateEvent(this.rowToEvent(row)))).sort(sortHydratedEvents);
  }

  searchEvents(query: string, filters: SearchFilters = {}): EventRecord[] {
    try {
      this.db
        .prepare("INSERT INTO search_history(id, query, filters, created_at) VALUES(?, ?, ?, ?)")
        .run(makeId("search", `${query}-${Date.now()}`), query, JSON.stringify(filters), nowIso());
    } catch {
      // Search history is helpful metadata; it must not block the actual knowledge-base search.
    }

    const ids = new Set<string>();
    const ftsQuery = buildFtsQuery(query);
    if (ftsQuery) {
      try {
        const rows = this.db
          .prepare("SELECT event_id FROM event_fts WHERE event_fts MATCH ? LIMIT ?")
          .all(ftsQuery, filters.limit || 50) as Row[];
        for (const row of rows) ids.add(String(row.event_id));
      } catch {
        // LIKE fallback below handles malformed or poorly segmented FTS queries.
      }
    }

    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT DISTINCT e.id
         FROM events e
         LEFT JOIN event_tags et ON et.event_id = e.id
         LEFT JOIN tags t ON t.id = et.tag_id
         LEFT JOIN event_entities ee ON ee.event_id = e.id
         LEFT JOIN entities ent ON ent.id = ee.entity_id
         WHERE e.title LIKE ? OR e.summary LIKE ? OR e.why_it_matters LIKE ?
            OR e.content_angle LIKE ? OR t.name LIKE ? OR ent.name LIKE ?
         ORDER BY e.importance_score DESC, e.updated_at DESC
         LIMIT ?`
      )
      .all(like, like, like, like, like, like, filters.limit || 50) as Row[];
    for (const row of rows) ids.add(String(row.id));

    for (const event of this.keywordFallbackSearch(query, Math.max(filters.limit || 50, 200))) {
      ids.add(event.id);
    }

    const filtered = this.applyFilters(Array.from(ids).map((id) => this.getEvent(id)).filter((event): event is EventRecord => Boolean(event)), filters)
      .sort(sortHydratedEvents)
    return this.collapseSimilarEvents(filtered).slice(0, filters.limit || 50);
  }

  private keywordFallbackSearch(query: string, limit: number): EventRecord[] {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length === 0) return [];

    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY importance_score DESC, updated_at DESC LIMIT ?")
      .all(limit) as Row[];

    return rows
      .map((row) => this.hydrateEvent(this.rowToEvent(row)))
      .filter((event) => {
        const haystack = [
          event.title,
          event.summary,
          event.what_happened,
          event.why_it_matters,
          event.creator_impact,
          event.content_angle,
          event.tags?.join(" "),
          event.entities?.map((entity) => `${entity.name} ${entity.aliases.join(" ")}`).join(" ")
        ]
          .join(" ")
          .toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
  }

  private applyFilters(events: EventRecord[], filters: SearchFilters): EventRecord[] {
    return events.filter((event) => {
      if (filters.category && event.category !== filters.category) return false;
      if (filters.from && event.first_seen_at < filters.from) return false;
      if (filters.to && event.first_seen_at > filters.to) return false;
      if (filters.source && !(event.sources || []).some((source) => source.source === filters.source)) return false;
      if (filters.tag && !(event.tags || []).includes(filters.tag)) return false;
      if (filters.entity && !(event.entities || []).some((entity) => entity.name.includes(filters.entity || ""))) return false;
      if (filters.favorite && !(event.feedback || []).includes("favorite")) return false;
      if (filters.follow && !(event.feedback || []).includes("follow")) return false;
      if (filters.ignored && !(event.feedback || []).includes("ignore")) return false;
      if (filters.usedForVideo && !(event.feedback || []).includes("used_for_video")) return false;
      return true;
    });
  }

  private collapseSimilarEvents(events: EventRecord[]): EventRecord[] {
    const result: EventRecord[] = [];
    for (const event of events) {
      if (result.some((kept) => areHydratedEventsSimilar(kept, event))) continue;
      result.push(event);
    }
    return result;
  }

  saveReport(input: {
    id: string;
    reportType: string;
    windowStart: string;
    windowEnd: string;
    htmlPath: string;
    markdownPath: string;
    newEventIds: string[];
    updatedEventIds: string[];
  }): void {
    const eventCount = new Set([...input.newEventIds, ...input.updatedEventIds]).size;
    this.db
      .prepare(
        "INSERT INTO reports(id, report_type, window_start, window_end, html_path, markdown_path, event_count, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(input.id, input.reportType, input.windowStart, input.windowEnd, input.htmlPath, input.markdownPath, eventCount, nowIso());

    for (const eventId of input.newEventIds) {
      this.db
        .prepare("INSERT OR IGNORE INTO report_events(report_id, event_id, section, is_new) VALUES(?, ?, ?, ?)")
        .run(input.id, eventId, "new", 1);
    }
    for (const eventId of input.updatedEventIds) {
      this.db
        .prepare("INSERT OR IGNORE INTO report_events(report_id, event_id, section, is_new) VALUES(?, ?, ?, ?)")
        .run(input.id, eventId, "updated", 0);
    }
  }

  getReportEventIds(date: string, reportType: string): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT re.event_id
         FROM reports r
         JOIN report_events re ON re.report_id = r.id
         WHERE r.report_type = ? AND r.window_start LIKE ?
         ORDER BY r.created_at DESC`
      )
      .all(reportType, `${date}%`) as Row[];
    return new Set(rows.map((row) => String(row.event_id)));
  }

  listReports(limit = 60): ReportRecord[] {
    return this.db
      .prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT ?")
      .all(limit) as unknown as ReportRecord[];
  }

  listFacets(): {
    sources: string[];
    tags: string[];
    entities: Array<{ name: string; type: string }>;
    categories: Array<{ name: string; count: number }>;
  } {
    const sources = this.db
      .prepare("SELECT DISTINCT source FROM event_sources ORDER BY source")
      .all() as Row[];
    const tags = this.db
      .prepare(
        `SELECT t.name, COUNT(*) AS count
         FROM tags t
         JOIN event_tags et ON et.tag_id = t.id
         GROUP BY t.id
         ORDER BY count DESC, t.name
         LIMIT 80`
      )
      .all() as Row[];
    const entities = this.db
      .prepare(
        `SELECT ent.name, ent.type, COUNT(*) AS count
         FROM entities ent
         JOIN event_entities ee ON ee.entity_id = ent.id
         GROUP BY ent.id
         ORDER BY count DESC, ent.name
         LIMIT 80`
      )
      .all() as Row[];
    const categories = this.db
      .prepare("SELECT category AS name, COUNT(*) AS count FROM events GROUP BY category ORDER BY count DESC")
      .all() as Row[];
    return {
      sources: sources.map((row) => String(row.source)),
      tags: tags.map((row) => String(row.name)),
      entities: entities.map((row) => ({ name: String(row.name), type: String(row.type) })),
      categories: categories.map((row) => ({ name: String(row.name), count: Number(row.count || 0) }))
    };
  }

  setFeedback(eventId: string, feedbackType: FeedbackType, enabled: boolean): void {
    if (enabled) {
      this.db
        .prepare(
          `INSERT INTO user_feedback(event_id, feedback_type, created_at, updated_at)
           VALUES(?, ?, ?, ?)
           ON CONFLICT(event_id, feedback_type) DO UPDATE SET updated_at = excluded.updated_at`
        )
        .run(eventId, feedbackType, nowIso(), nowIso());
    } else {
      this.db.prepare("DELETE FROM user_feedback WHERE event_id = ? AND feedback_type = ?").run(eventId, feedbackType);
    }
  }

  getTimeline(query: string, limit = 80): EventRecord[] {
    return this.searchEvents(query, { limit })
      .sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at));
  }

  getKnowledgeHealth(limit = 8): KnowledgeHealth {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY updated_at DESC LIMIT 300")
      .all() as Row[];
    const events = this.collapseSimilarEvents(rows.map((row) => this.hydrateEvent(this.rowToEvent(row)))).sort(sortHydratedEvents);
    const needsEvidence = events.filter((event) => {
      const isCapped = (event.caps || []).length > 0;
      const isLowConfidence = event.confidence === "low";
      const isSingleSource = (event.sources || []).length <= 1;
      return isCapped || (isLowConfidence && isSingleSource);
    });
    const videoCandidates = events.filter(
      (event) => (event.video_potential || 0) >= 4 && !event.feedback?.includes("used_for_video") && !event.feedback?.includes("ignore")
    );
    const followUp = events.filter((event) => event.feedback?.includes("follow") || event.radar_section === "developing" || event.worth_following);
    const staleButUseful = events.filter((event) => event.freshness_label === "stale" && (event.video_potential || 0) >= 4);
    return {
      metrics: {
        total: events.length,
        highConfidence: events.filter((event) => event.confidence === "high").length,
        lowConfidence: events.filter((event) => event.confidence === "low").length,
        singleSource: events.filter((event) => (event.sources || []).length <= 1).length,
        capped: events.filter((event) => (event.caps || []).length > 0).length,
        videoReady: events.filter((event) => (event.video_potential || 0) >= 4).length,
        followed: events.filter((event) => event.feedback?.includes("follow")).length,
        usedForVideo: events.filter((event) => event.feedback?.includes("used_for_video")).length
      },
      queueCounts: {
        needsEvidence: needsEvidence.length,
        videoCandidates: videoCandidates.length,
        followUp: followUp.length,
        staleButUseful: staleButUseful.length
      },
      queues: {
        needsEvidence: needsEvidence.slice(0, limit),
        videoCandidates: videoCandidates.slice(0, limit),
        followUp: followUp.slice(0, limit),
        staleButUseful: staleButUseful.slice(0, limit)
      }
    };
  }

  private getEventRadarSignals(eventId: string): RadarSignal[] {
    const rows = this.db
      .prepare(
        `SELECT si.source, si.url, si.heat_score, si.published_at, si.fetched_at
         FROM event_sources es
         JOIN source_items si ON si.id = es.source_item_id
         WHERE es.event_id = ?
         ORDER BY si.fetched_at DESC`
      )
      .all(eventId) as Row[];
    return rows.map((row) => ({
      source: String(row.source),
      url: row.url ? String(row.url) : undefined,
      heatScore: Number(row.heat_score || 0),
      publishedAt: row.published_at ? String(row.published_at) : undefined,
      fetchedAt: row.fetched_at ? String(row.fetched_at) : undefined
    }));
  }

  private getSourceCount(eventId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT si.source) AS count
         FROM event_sources es
         JOIN source_items si ON si.id = es.source_item_id
         WHERE es.event_id = ?`
      )
      .get(eventId) as Row;
    return Number(row.count || 1);
  }

  private getEventTags(eventId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT t.name
         FROM tags t
         JOIN event_tags et ON et.tag_id = t.id
         WHERE et.event_id = ?
         ORDER BY t.name`
      )
      .all(eventId) as Row[];
    return rows.map((row) => String(row.name));
  }

  private getEventEntities(eventId: string): EntityHit[] {
    const rows = this.db
      .prepare(
        `SELECT ent.name, ent.type, ent.aliases
         FROM entities ent
         JOIN event_entities ee ON ee.entity_id = ent.id
         WHERE ee.event_id = ?
         ORDER BY ent.name`
      )
      .all(eventId) as Row[];
    return rows.map((row) => ({
      name: String(row.name),
      type: String(row.type),
      aliases: safeJsonArray(row.aliases)
    }));
  }

  private getEventSources(eventId: string): Array<{ source: string; url: string; title?: string; author?: string }> {
    const rows = this.db
      .prepare(
        `SELECT es.source, es.url, si.title, si.author
         FROM event_sources es
         JOIN source_items si ON si.id = es.source_item_id
         WHERE es.event_id = ?
         ORDER BY es.created_at`
      )
      .all(eventId) as Row[];
    return rows.map((row) => ({
      source: String(row.source),
      url: String(row.url),
      title: row.title ? String(row.title) : undefined,
      author: row.author ? String(row.author) : undefined
    }));
  }

  private getFeedback(eventId: string): FeedbackType[] {
    const rows = this.db
      .prepare("SELECT feedback_type FROM user_feedback WHERE event_id = ? ORDER BY updated_at DESC")
      .all(eventId) as Row[];
    return rows.map((row) => String(row.feedback_type) as FeedbackType);
  }

  private rowToEvent(row: Row): EventRecord {
    return {
      id: String(row.id),
      title: String(row.title),
      canonical_title: String(row.canonical_title),
      summary: String(row.summary),
      what_happened: String(row.what_happened),
      why_it_matters: String(row.why_it_matters),
      creator_impact: String(row.creator_impact),
      content_angle: String(row.content_angle),
      cover_angle: String(row.cover_angle),
      category: String(row.category) as EventRecord["category"],
      importance_score: Number(row.importance_score),
      worth_following: Number(row.worth_following),
      first_seen_at: String(row.first_seen_at),
      last_seen_at: String(row.last_seen_at),
      status: String(row.status),
      source_count: Number(row.source_count),
      embedding_provider: row.embedding_provider ? String(row.embedding_provider) : null,
      embedding_json: row.embedding_json ? String(row.embedding_json) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    };
  }

  private hydrateEvent(event: EventRecord): EventRecord {
    const hydrated = {
      ...event,
      tags: this.getEventTags(event.id),
      entities: this.getEventEntities(event.id),
      sources: this.getEventSources(event.id),
      feedback: this.getFeedback(event.id)
    };
    return {
      ...hydrated,
      ...buildRadarForEvent(hydrated, this.getEventRadarSignals(event.id))
    };
  }
}

function sortHydratedEvents(a: EventRecord, b: EventRecord): number {
  return (b.radar_score || b.importance_score) - (a.radar_score || a.importance_score) || b.updated_at.localeCompare(a.updated_at);
}

function preferText(current: string, next: string, currentScore: number, nextScore: number): string {
  if (!current) return next;
  if (!next) return current;
  if (next.length >= current.length + 20) return next;
  if (nextScore >= currentScore && next.length >= Math.max(48, current.length * 0.85)) return next;
  return current;
}

function safeJsonArray(input: unknown): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(String(input));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mergeEntities(left: EntityHit[], right: EntityHit[]): EntityHit[] {
  const map = new Map<string, EntityHit>();
  for (const entity of [...left, ...right]) {
    map.set(`${entity.type}:${entity.name}`, entity);
  }
  return Array.from(map.values());
}

function isBetterMatch(candidate: Row, score: number, best: { row: Row; score: number } | null): boolean {
  if (!best) return true;
  if (score > best.score) return true;
  const candidateFirstSeen = String(candidate.first_seen_at || "");
  const bestFirstSeen = String(best.row.first_seen_at || "");
  return candidateFirstSeen < bestFirstSeen && best.score - score <= 0.05;
}

function areHydratedEventsSimilar(left: EventRecord, right: EventRecord): boolean {
  if (left.id === right.id) return true;
  if (titleSimilarity(left.title, right.title) >= 0.86) return true;
  const sharedTags = (left.tags || []).filter((tag) => (right.tags || []).includes(tag));
  const strongSharedTags = sharedTags.filter((tag) =>
    ["发布会", "系统更新", "智驾", "平台规则", "AI手机", "影像", "争议"].includes(tag)
  );
  const sharedEntities = countEntityOverlap(left.entities || [], right.entities || []);
  const sameCategory = left.category === right.category || left.category === "mixed" || right.category === "mixed";
  return sharedEntities > 0 && sharedTags.length >= 2 && strongSharedTags.length > 0 && sameCategory && daysBetween(left.first_seen_at, right.first_seen_at) <= 30;
}

function countEntityOverlap(left: EntityHit[], right: EntityHit[]): number {
  const leftTerms = new Set<string>();
  for (const entity of left) {
    for (const term of [entity.name, ...entity.aliases]) leftTerms.add(term.toLowerCase());
  }
  let count = 0;
  for (const entity of right) {
    const terms = [entity.name, ...entity.aliases].map((term) => term.toLowerCase());
    if (terms.some((term) => leftTerms.has(term))) count += 1;
  }
  return count;
}

function daysBetween(left: string, right: string): number {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000);
}

function buildFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["']/g, "").replace(/[():^]/g, " ").trim())
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, "\"\"")}"*`)
    .join(" AND ");
}
