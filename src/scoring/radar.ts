import type { EntityHit, EventRecord, EventSourceLink, IndustryCategory, SourceItem } from "../types.js";
import { highValueKeywords, lowValueKeywords } from "./keywords.js";

export type RadarLevel = "S" | "A" | "B" | "C" | "D";
export type ConfidenceLevel = "high" | "medium" | "low";
export type FreshnessLabel = "new" | "recent" | "stale" | "unknown";
export type RadarSection = "must_read" | "developing" | "video_ready" | "background";

export interface RadarSignal {
  source: string;
  url?: string;
  heatScore?: number;
  publishedAt?: string;
  fetchedAt?: string;
}

export interface RadarBreakdown {
  radar_score: number;
  radar_level: RadarLevel;
  radar_section: RadarSection;
  video_potential: number;
  confidence: ConfidenceLevel;
  freshness_label: FreshnessLabel;
  freshness_days: number | null;
  push_reason: string;
  score_parts: {
    relevance: number;
    trend: number;
    freshness: number;
    change: number;
    credibility: number;
    scarcity: number;
  };
  caps: string[];
}

export interface ScoreContext {
  now?: Date;
  sourceCount?: number;
}

const reliableSources = new Set(["official", "ithome", "apple-newsroom", "android-blog"]);
const publicSocialSources = new Set(["bilibili", "zhihu", "weibo"]);
const weakSources = new Set(["mock"]);
const actionTags = new Set(["平台规则", "发布会", "系统更新", "智驾", "AI手机", "争议"]);
export const SCORE_WEIGHTS = {
  relevance: 22,
  trend: 26,
  freshness: 18,
  change: 10,
  credibility: 16,
  scarcity: 8
} as const;

export function scoreItem(item: SourceItem, tags: string[], entities: EntityHit[], sourceCount = 1, now = new Date()): number {
  return buildRadarForItem(item, tags, entities, { sourceCount, now }).radar_score;
}

export function buildRadarForItem(
  item: SourceItem,
  tags: string[],
  entities: EntityHit[],
  context: ScoreContext = {}
): RadarBreakdown {
  const signal: RadarSignal = {
    source: item.source,
    url: item.url,
    heatScore: item.heatScore,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt
  };
  return calculateRadar(
    {
      title: item.title,
      summary: item.summaryRaw || "",
      category: item.category,
      tags,
      entities,
      firstSeenAt: item.publishedAt || item.fetchedAt,
      lastSeenAt: item.fetchedAt,
      sourceCount: context.sourceCount || 1,
      sources: [{ source: item.source, url: item.url, title: item.title, author: item.author }],
      signals: [signal]
    },
    context.now || new Date()
  );
}

export function buildRadarForEvent(event: EventRecord, signals: RadarSignal[] = [], now = new Date()): RadarBreakdown {
  return calculateRadar(
    {
      title: event.title,
      summary: [event.summary, event.what_happened, event.why_it_matters, event.creator_impact, event.content_angle, event.cover_angle].join(" "),
      category: event.category,
      tags: event.tags || [],
      entities: event.entities || [],
      firstSeenAt: event.first_seen_at,
      lastSeenAt: event.last_seen_at,
      sourceCount: Math.max(event.source_count || 1, signals.length || 0, (event.sources || []).length || 0),
      sources: event.sources || [],
      signals
    },
    now
  );
}

function calculateRadar(input: {
  title: string;
  summary: string;
  category: IndustryCategory;
  tags: string[];
  entities: EntityHit[];
  firstSeenAt?: string;
  lastSeenAt?: string;
  sourceCount: number;
  sources: EventSourceLink[];
  signals: RadarSignal[];
}, now: Date): RadarBreakdown {
  const text = `${input.title} ${input.summary}`;
  const lower = text.toLowerCase();
  const ageDays = ageInDays(input.firstSeenAt || input.lastSeenAt, now);
  const hasUnknownTime = ageDays === null;
  const sourceNames = unique(input.sources.map((source) => source.source).concat(input.signals.map((signal) => signal.source)));
  const sourceUrls = unique(input.sources.map((source) => source.url).concat(input.signals.map((signal) => signal.url || "")));
  const sourceCount = Math.max(input.sourceCount || 1, sourceNames.length || 1);
  const isMockLike = sourceNames.includes("mock") || sourceUrls.some((url) => /mock|sample|example/i.test(url));

  const relevance = relevanceScore(input.category, input.tags, input.entities, lower);
  const trend = trendScore(input.signals, sourceCount, input.tags, lower);
  const freshness = freshnessScore(ageDays);
  const change = changeScore(input.tags, lower);
  const credibility = credibilityScore(sourceNames, sourceCount);
  const scarcity = scarcityScore(sourceCount, input.signals, input.tags, lower);

  const score_parts = { relevance, trend, freshness, change, credibility, scarcity };
  let score = relevance + trend + freshness + change + credibility + scarcity;

  if (lowValueKeywords.some((keyword) => lower.includes(keyword.toLowerCase()))) score -= 10;
  if (input.tags.includes("争议")) score += 2;

  const caps: string[] = [];
  if (ageDays !== null && ageDays > 30) {
    score = Math.min(score, 35);
    caps.push("30天以上旧内容封顶");
  }
  if (hasUnknownTime) {
    score = Math.min(score, 55);
    caps.push("发布时间不明确封顶");
  }
  if (isMockLike) {
    score = Math.min(score, 45);
    caps.push("Mock/示例数据封顶");
  }
  if (sourceCount <= 1 && sourceNames.some((source) => weakSources.has(source) || publicSocialSources.has(source))) {
    score = Math.min(score, 60);
    caps.push("单一弱来源封顶");
  }

  const radar_score = clampScore(score);
  const video_potential = videoPotential(input.category, input.tags, input.entities, lower, sourceCount, ageDays);
  const confidence = confidenceLevel(sourceNames, sourceCount, hasUnknownTime);
  const freshness_label = freshnessLabel(ageDays);
  const radar_level = levelForScore(radar_score);
  const radar_section = sectionForScore(radar_score, video_potential, freshness_label, input.tags, confidence);
  const push_reason = pushReason({ radar_score, score_parts, input, freshness_label, video_potential, confidence });

  return {
    radar_score,
    radar_level,
    radar_section,
    video_potential,
    confidence,
    freshness_label,
    freshness_days: ageDays === null ? null : Math.round(ageDays * 10) / 10,
    push_reason,
    score_parts,
    caps
  };
}

function relevanceScore(category: IndustryCategory, tags: string[], entities: EntityHit[], lower: string): number {
  let score = 0;
  if (["digital", "media", "auto", "mixed"].includes(category)) score += category === "mixed" ? 16 : 14;
  score += Math.min(5, entities.length * 1.5);
  if (tags.some((tag) => ["AI手机", "智驾", "平台规则", "发布会", "系统更新"].includes(tag))) score += 3;
  if (["oppo", "小米", "华为", "苹果", "b站", "创作者", "ai", "智驾", "影像"].some((term) => lower.includes(term.toLowerCase()))) score += 2;
  return clampPart(score, SCORE_WEIGHTS.relevance);
}

function trendScore(signals: RadarSignal[], sourceCount: number, tags: string[], lower: string): number {
  const maxHeat = Math.max(0, ...signals.map((signal) => Number(signal.heatScore || 0)));
  const heat = maxHeat > 0 ? Math.min(12, Math.log10(maxHeat + 10) * 3.1) : 0;
  const sourceSpread = Math.min(7, Math.max(0, sourceCount - 1) * 2.2);
  const crossSource = unique(signals.map((signal) => signal.source)).length >= 2 ? 3 : 0;
  const developingTags = tags.some((tag) => ["争议", "平台规则", "发布会", "系统更新", "智驾"].includes(tag)) ? 4 : 0;
  const hotTerms = ["热议", "刷屏", "爆料", "首发", "开放", "调整", "定档"].filter((term) => lower.includes(term)).length;
  const creatorMomentum = highValueKeywords.some((keyword) => lower.includes(keyword.toLowerCase())) ? 2 : 0;
  return clampPart(heat + sourceSpread + crossSource + developingTags + Math.min(2, hotTerms) + creatorMomentum, SCORE_WEIGHTS.trend);
}

function freshnessScore(ageDays: number | null): number {
  if (ageDays === null) return 7;
  if (ageDays <= 1) return 18;
  if (ageDays <= 3) return 15;
  if (ageDays <= 7) return 11;
  if (ageDays <= 14) return 6;
  if (ageDays <= 30) return 3;
  return 0;
}

function changeScore(tags: string[], lower: string): number {
  let score = 0;
  for (const tag of tags) {
    if (["平台规则", "发布会", "系统更新", "智驾", "AI手机", "争议"].includes(tag)) score += 2;
  }
  const changeTerms = ["规则", "调整", "发布", "更新", "推送", "定档", "召回", "涨价", "降价", "开售", "开放", "关闭", "限制", "补贴"];
  score += changeTerms.filter((term) => lower.includes(term)).length;
  return clampPart(score, SCORE_WEIGHTS.change);
}

function credibilityScore(sources: string[], sourceCount: number): number {
  let score = 4;
  if (sources.some((source) => reliableSources.has(source))) score += 6;
  if (sources.some((source) => publicSocialSources.has(source))) score += 2;
  score += Math.min(5, Math.max(0, sourceCount - 1) * 2);
  if (sources.length >= 2) score += 1;
  if (sources.every((source) => weakSources.has(source))) score -= 4;
  return clampPart(score, SCORE_WEIGHTS.credibility);
}

function scarcityScore(sourceCount: number, signals: RadarSignal[], tags: string[], lower: string): number {
  let score = 5;
  if (sourceCount <= 2) score += 2;
  if (sourceCount >= 6) score -= 3;
  if (signals.length >= 8) score -= 2;
  if (tags.includes("争议") || lower.includes("质疑") || lower.includes("反转")) score += 1;
  return clampPart(score, SCORE_WEIGHTS.scarcity);
}

function videoPotential(
  category: IndustryCategory,
  tags: string[],
  entities: EntityHit[],
  lower: string,
  sourceCount: number,
  ageDays: number | null
): number {
  let score = 2;
  if (["digital", "media", "auto", "mixed"].includes(category)) score += 1;
  if (tags.some((tag) => actionTags.has(tag))) score += 1;
  if (tags.includes("争议") || lower.includes("怎么") || lower.includes("为什么") || lower.includes("普通用户")) score += 1;
  if (entities.length > 0 && sourceCount >= 2) score += 1;
  if (ageDays !== null && ageDays > 30) score -= 1;
  return Math.max(1, Math.min(5, score));
}

function confidenceLevel(sources: string[], sourceCount: number, hasUnknownTime: boolean): ConfidenceLevel {
  if (hasUnknownTime) return "low";
  if (sources.some((source) => reliableSources.has(source)) && sourceCount >= 2) return "high";
  if (sourceCount >= 2 && !sources.every((source) => weakSources.has(source))) return "medium";
  return "low";
}

function sectionForScore(
  score: number,
  videoPotentialScore: number,
  freshness: FreshnessLabel,
  tags: string[],
  confidence: ConfidenceLevel
): RadarSection {
  if (freshness === "stale" || freshness === "unknown") {
    return score >= 55 && videoPotentialScore >= 4 && confidence !== "low" ? "video_ready" : "background";
  }
  if (score >= 75) return "must_read";
  if (videoPotentialScore >= 4 && score >= 55 && confidence !== "low") return "video_ready";
  if (score >= 58 || tags.some((tag) => ["争议", "平台规则", "发布会", "系统更新"].includes(tag))) return "developing";
  return "background";
}

function pushReason(input: {
  radar_score: number;
  score_parts: RadarBreakdown["score_parts"];
  input: { tags: string[]; sourceCount: number; entities: EntityHit[] };
  freshness_label: FreshnessLabel;
  video_potential: number;
  confidence: ConfidenceLevel;
}): string {
  const reasons: string[] = [];
  const parts = input.score_parts;
  if (parts.relevance >= 17) reasons.push("与你关注的数码/AI/汽车/平台生态高度相关");
  if (parts.trend >= 18) reasons.push(input.confidence === "low" ? "有热度迹象，但需要先补强来源" : "热度和扩散信号较强，适合优先判断是否跟进");
  if (parts.change >= 7) reasons.push("包含明确变化信号");
  if (input.freshness_label === "new") reasons.push("近期新出现");
  if (input.video_potential >= 4 && input.radar_score >= 55) reasons.push("具备视频选题潜力");
  if (input.confidence === "high") reasons.push("来源交叉验证较强");
  if (!reasons.length) reasons.push(input.radar_score >= 55 ? "适合进入观察池" : "仅适合沉淀为背景知识");
  return reasons.slice(0, 3).join("；");
}

function freshnessLabel(ageDays: number | null): FreshnessLabel {
  if (ageDays === null) return "unknown";
  if (ageDays <= 1) return "new";
  if (ageDays <= 7) return "recent";
  return "stale";
}

function levelForScore(score: number): RadarLevel {
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}

function ageInDays(value: string | undefined, now: Date): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const delta = (now.getTime() - time) / (24 * 60 * 60 * 1000);
  if (delta < -1) return null;
  return Math.max(0, delta);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampPart(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
