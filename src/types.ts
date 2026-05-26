export type ReportType = "noon" | "night" | "weekly" | "monthly";

export type IndustryCategory = "digital" | "media" | "auto" | "mixed" | "unknown";

export type FeedbackType =
  | "useful"
  | "not_useful"
  | "follow"
  | "ignore"
  | "used_for_video"
  | "favorite";

export interface ReportWindow {
  type: ReportType;
  date: string;
  start: string;
  end: string;
  label: string;
}

export interface Engagement {
  views?: number;
  comments?: number;
  likes?: number;
  shares?: number;
  favorites?: number;
  coins?: number;
  replies?: number;
  heatText?: string;
  [key: string]: unknown;
}

export interface SourceItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  author?: string;
  category: IndustryCategory;
  tags: string[];
  summaryRaw?: string;
  heatScore?: number;
  engagement?: Engagement;
  raw?: unknown;
}

export interface SourceFetchResult {
  source: string;
  ok: boolean;
  items: SourceItem[];
  startedAt: string;
  endedAt: string;
  error?: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
}

export interface SourceAdapter {
  name: string;
  fetch(ctx: SourceContext): Promise<SourceFetchResult>;
}

export interface SourceContext {
  window: ReportWindow;
  useMock: boolean;
  logger: Logger;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface EntityHit {
  name: string;
  type: string;
  aliases: string[];
}

export interface EventRecord {
  id: string;
  title: string;
  canonical_title: string;
  summary: string;
  what_happened: string;
  why_it_matters: string;
  creator_impact: string;
  content_angle: string;
  cover_angle: string;
  category: IndustryCategory;
  importance_score: number;
  worth_following: number;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
  source_count: number;
  embedding_provider?: string | null;
  embedding_json?: string | null;
  created_at: string;
  updated_at: string;
  tags?: string[];
  entities?: EntityHit[];
  sources?: EventSourceLink[];
  feedback?: FeedbackType[];
  radar_score?: number;
  radar_level?: "S" | "A" | "B" | "C" | "D";
  radar_section?: "must_read" | "developing" | "video_ready" | "background";
  video_potential?: number;
  confidence?: "high" | "medium" | "low";
  freshness_label?: "new" | "recent" | "stale" | "unknown";
  freshness_days?: number | null;
  push_reason?: string;
  score_parts?: {
    relevance: number;
    trend: number;
    freshness: number;
    change: number;
    credibility: number;
    scarcity: number;
  };
  caps?: string[];
}

export interface EventSourceLink {
  source: string;
  url: string;
  title?: string;
  author?: string;
}

export interface KnowledgeHealth {
  metrics: {
    total: number;
    highConfidence: number;
    lowConfidence: number;
    singleSource: number;
    capped: number;
    videoReady: number;
    followed: number;
    usedForVideo: number;
  };
  queueCounts: {
    needsEvidence: number;
    videoCandidates: number;
    followUp: number;
    staleButUseful: number;
  };
  queues: {
    needsEvidence: EventRecord[];
    videoCandidates: EventRecord[];
    followUp: EventRecord[];
    staleButUseful: EventRecord[];
  };
}

export interface ReportRecord {
  id: string;
  report_type: ReportType;
  window_start: string;
  window_end: string;
  html_path: string;
  markdown_path: string;
  event_count: number;
  created_at: string;
}

export interface SourceStatus {
  source: string;
  ok: boolean;
  count: number;
  error?: string;
  warnings?: string[];
}

export interface GeneratedReport {
  id: string;
  type: ReportType;
  window: ReportWindow;
  htmlPath: string;
  markdownPath: string;
  markdown: string;
  html: string;
  newEvents: EventRecord[];
  updatedEvents: EventRecord[];
  sourceStatuses: SourceStatus[];
}

export interface SearchFilters {
  category?: IndustryCategory;
  source?: string;
  tag?: string;
  entity?: string;
  favorite?: boolean;
  follow?: boolean;
  ignored?: boolean;
  usedForVideo?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}
