import path from "node:path";
import type { EventRecord, GeneratedReport, ReportType, ReportWindow, SourceStatus } from "../types.js";
import { displayRange } from "../utils/time.js";

export interface ReportTemplateInput {
  id: string;
  type: ReportType;
  window: ReportWindow;
  newEvents: EventRecord[];
  updatedEvents: EventRecord[];
  sourceStatuses: SourceStatus[];
}

interface SectionModel {
  top: EventRecord[];
  mainline: string[];
  digital: EventRecord[];
  media: EventRecord[];
  auto: EventRecord[];
  brand: EventRecord[];
  updated: EventRecord[];
  failed: SourceStatus[];
  importantCount: number;
}

const typeLabel: Record<ReportType, string> = {
  morning: "早间报告",
  noon: "中午报告",
  night: "晚间报告",
  weekly: "周报",
  monthly: "月报"
};

const categoryLabels: Record<string, string> = {
  digital: "数码行业",
  media: "自媒体 / 平台生态",
  auto: "汽车行业",
  mixed: "跨行业",
  unknown: "其他"
};

export function renderMarkdown(input: ReportTemplateInput): string {
  const sections = buildSections(input);
  const lines: string[] = [
    `# 行业情报雷达 - ${typeLabel[input.type]}`,
    "",
    `- 日期：${input.window.date}`,
    `- 报告类型：${typeLabel[input.type]}`,
    `- 时间窗口：${displayRange(input.window)}`,
    `- 数据源状态：${input.sourceStatuses.filter((status) => status.ok).length}/${input.sourceStatuses.length} 可用`,
    `- 新增事件数：${input.newEvents.length}`,
    `- 重要事件数：${sections.importantCount}`,
    input.type === "night" ? "- 说明：仅展示中午后新增；中午已出现但新增来源的事件放入“持续发酵/有更新”。" : "",
    "",
    "## 采集平台状态",
    ...input.sourceStatuses.map((status) =>
      `- ${status.ok ? "OK" : "异常"} ${status.source}：${status.count} 条${status.error ? `；${status.error}` : ""}${
        status.warnings?.length ? `；${status.warnings.join("；")}` : ""
      }`
    ),
    "",
    "## 今日必看",
    sections.top.length ? renderEventList(sections.top, true) : "- 暂无新增 Top 事件。",
    "",
    "## 今日主线判断",
    ...sections.mainline.map((line) => `- ${line}`),
    "",
    "## 数码行业",
    sections.digital.length ? renderEventList(sections.digital) : "- 暂无新增。",
    "",
    "## 自媒体 / 平台生态",
    sections.media.length ? renderEventList(sections.media) : "- 暂无新增。",
    "",
    "## 汽车行业",
    sections.auto.length ? renderEventList(sections.auto) : "- 暂无新增。",
    "",
    "## 品牌 / 高管 / 博主动态",
    sections.brand.length ? renderEventList(sections.brand) : "- 暂无单独新增。",
    "",
    "## 持续发酵 / 有更新",
    sections.updated.length ? renderEventList(sections.updated) : "- 暂无中午已出现后的新增来源或持续更新。",
    "",
    "## 数据源异常与限制",
    sections.failed.length
      ? sections.failed.map((status) => `- ${status.source}：${status.error || status.warnings?.join("；") || "部分接口异常"}`).join("\n")
      : "- 本次未记录数据源异常。"
  ];

  return lines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n");
}

function renderEventList(events: EventRecord[], ranked = false): string {
  return events
    .map((event, index) => {
      const sources = (event.sources || []).map(markdownSourceLink).join("、");
      const tags = (event.tags || []).slice(0, 8).join("、") || "未标注";
      const prefix = ranked ? `Top ${index + 1}` : `${index + 1}.`;
      return [
        `${prefix} **${event.title}**`,
        `   - Radar：${event.radar_level || "D"} ${event.radar_score ?? event.importance_score}；置信度：${confidenceLabel(event.confidence)}`,
        `   - 推荐理由：${event.push_reason || "适合进入观察池。"}`,
        `   - 一句话：${event.summary}`,
        `   - 为什么重要：${event.why_it_matters}`,
        `   - 跟我做内容的关系：${event.creator_impact}`,
        `   - 内容切入：${event.content_angle}`,
        `   - 标题/封面角度：${event.cover_angle}`,
        `   - 标签：${tags}`,
        `   - 来源：${sources || "暂无"}`,
        `   - 评分拆解：相关度 ${event.score_parts?.relevance ?? 0}，趋势 ${event.score_parts?.trend ?? 0}，新鲜度 ${event.score_parts?.freshness ?? 0}，变化 ${event.score_parts?.change ?? 0}，可信度 ${event.score_parts?.credibility ?? 0}，稀缺性 ${event.score_parts?.scarcity ?? 0}`
      ].join("\n");
    })
    .join("\n");
}

export function renderHtml(input: ReportTemplateInput): string {
  const sections = buildSections(input);
  const okCount = input.sourceStatuses.filter((status) => status.ok).length;
  const totalSources = input.sourceStatuses.length || 1;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>行业情报雷达 - ${escapeHtml(typeLabel[input.type])}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --surface: #ffffff;
      --surface-soft: #fbfbfd;
      --text: #1d1d1f;
      --muted: #6e6e73;
      --line: #e5e5ea;
      --accent: #0066cc;
      --good: #1f7a4d;
      --bad: #b42318;
    }
    * { box-sizing: border-box; }
    html {
      min-height: 100%;
      overflow-x: clip;
      overflow-y: auto;
      overscroll-behavior-y: contain;
    }
    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      overflow-x: clip;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    .page { width: min(1120px, calc(100vw - 28px)); min-height: 100dvh; margin: 0 auto; padding: 28px 0 56px; }
    .masthead { display: grid; gap: 18px; padding: 10px 0 18px; }
    .eyebrow { color: var(--muted); font-size: 14px; line-height: 1.5; }
    h1 { margin: 0; font-size: clamp(30px, 4vw, 44px); line-height: 1.1; font-weight: 720; }
    h2 { margin: 0 0 12px; font-size: 22px; line-height: 1.25; }
    h3 { margin: 0; font-size: 18px; line-height: 1.38; overflow-wrap: anywhere; }
    p { margin: 0; line-height: 1.65; }
    a { color: var(--accent); text-decoration: none; overflow-wrap: anywhere; }
    a:hover { text-decoration: underline; }
    .summary-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .metric, .status-strip, .mainline, .event-card, .empty, .idea-list, .source-note {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .metric { padding: 13px 14px; min-width: 0; }
    .metric b { display: block; font-size: 22px; line-height: 1.15; }
    .metric span { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; }
    .status-strip { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
    .pill {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      color: var(--muted);
      background: var(--surface-soft);
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .status-ok { color: var(--good); }
    .status-bad { color: var(--bad); }
    section { margin-top: 28px; }
    .mainline { padding: 18px; }
    .mainline ul, .idea-list ol { margin: 0; padding-left: 20px; line-height: 1.75; }
    .event-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .top-list { grid-template-columns: 1fr; }
    .event-card { padding: 16px; display: grid; gap: 10px; min-width: 0; }
    .event-card.top { border-color: #d2d2d7; }
    .card-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; min-width: 0; }
    .card-head:has(.rank) { grid-template-columns: auto minmax(0, 1fr) auto; }
    .card-head h3 { min-width: 0; }
    .rank {
      width: 28px;
      height: 28px;
      display: inline-grid;
      place-items: center;
      border-radius: 50%;
      background: #1d1d1f;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      flex: 0 0 auto;
    }
    .score { color: var(--accent); font-weight: 700; white-space: nowrap; justify-self: end; }
    .summary { color: #303033; }
    .why { color: var(--text); }
    .creator { color: #3d3d40; }
    .label { color: var(--muted); font-size: 12px; font-weight: 650; margin-right: 4px; }
    .meta, .sources { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    .sources { padding-top: 2px; }
    .sources a {
      display: inline-grid;
      gap: 2px;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 6px 8px;
      background: var(--surface-soft);
    }
    .sources code {
      color: var(--muted);
      font-size: 11px;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .empty { padding: 16px; color: var(--muted); }
    .idea-list { padding: 16px 18px; }
    .source-note { padding: 14px 16px; margin-bottom: 10px; }
    @media (max-width: 860px) {
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .event-list { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .page { width: min(100vw - 20px, 1120px); padding-top: 18px; }
      .summary-grid { grid-template-columns: 1fr; }
      .card-head, .card-head:has(.rank) { grid-template-columns: auto minmax(0, 1fr); }
      .score { grid-column: 2; justify-self: start; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <div>
        <div class="eyebrow">${escapeHtml(input.window.date)} · ${escapeHtml(typeLabel[input.type])} · ${escapeHtml(displayRange(input.window))}</div>
        <h1>行业情报雷达</h1>
      </div>
      <div class="summary-grid">
        <div class="metric"><b>${escapeHtml(input.window.date)}</b><span>日期</span></div>
        <div class="metric"><b>${escapeHtml(typeLabel[input.type])}</b><span>报告类型</span></div>
        <div class="metric"><b>${escapeHtml(input.newEvents.length)}</b><span>新增事件</span></div>
        <div class="metric"><b>${escapeHtml(sections.importantCount)}</b><span>重要事件</span></div>
        <div class="metric"><b>${escapeHtml(okCount)}/${escapeHtml(totalSources)}</b><span>数据源可用</span></div>
      </div>
      <div class="status-strip" aria-label="数据源状态">${input.sourceStatuses.map(renderStatus).join("")}</div>
    </header>
    ${input.type === "night" ? `<p class="eyebrow">晚间报告只展示中午后新增；中午已出现但新增来源的事件放入“持续发酵 / 有更新”。</p>` : ""}
    ${renderSection("今日必看", sections.top, { ranked: true, top: true })}
    <section>
      <h2>今日主线判断</h2>
      <div class="mainline"><ul>${sections.mainline.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>
    </section>
    ${renderSection("数码行业", sections.digital)}
    ${renderSection("自媒体 / 平台生态", sections.media)}
    ${renderSection("汽车行业", sections.auto)}
    ${renderSection("品牌 / 高管 / 博主动态", sections.brand)}
    ${renderSection("持续发酵 / 有更新", sections.updated)}
    <section>
      <h2>数据源异常与限制</h2>
      ${
        sections.failed.length
          ? sections.failed.map((status) => `<div class="source-note"><strong>${escapeHtml(status.source)}</strong><p>${escapeHtml(status.error || status.warnings?.join("；") || "部分接口异常")}</p></div>`).join("")
          : `<div class="empty">本次未记录数据源异常。</div>`
      }
    </section>
  </main>
  ${renderRootScrollFallbackScript()}
</body>
</html>`;
}

function renderRootScrollFallbackScript(): string {
  return `<script>
    (() => {
      function isPageScrollable() {
        const root = document.scrollingElement || document.documentElement;
        return root.scrollHeight > root.clientHeight + 1;
      }
      function normalizedWheelDelta(event) {
        const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
        return { x: event.deltaX * unit, y: event.deltaY * unit };
      }
      function isInteractiveTarget(target) {
        return target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, [contenteditable='true'], [tabindex]:not([tabindex='-1'])"));
      }
      function hasScrollableAncestor(target, deltaY) {
        for (let node = target instanceof Element ? target : target?.parentElement; node && node !== document.body; node = node.parentElement) {
          const style = window.getComputedStyle(node);
          if (!/(auto|scroll)/.test(style.overflowY)) continue;
          const canScrollDown = deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1;
          const canScrollUp = deltaY < 0 && node.scrollTop > 1;
          if (canScrollDown || canScrollUp) return true;
        }
        return false;
      }
      function keyScrollDelta(event) {
        const viewportStep = Math.max(240, Math.floor(window.innerHeight * 0.85));
        if (event.key === " ") return event.shiftKey ? -viewportStep : viewportStep;
        return {
          ArrowDown: 80,
          ArrowUp: -80,
          PageDown: viewportStep,
          PageUp: -viewportStep,
          Home: "home",
          End: "end"
        }[event.key];
      }
      window.addEventListener("wheel", (event) => {
        const delta = normalizedWheelDelta(event);
        if (event.defaultPrevented || event.ctrlKey || Math.abs(delta.y) <= Math.abs(delta.x)) return;
        if (!isPageScrollable() || hasScrollableAncestor(event.target, delta.y)) return;
        const previousY = window.scrollY;
        window.requestAnimationFrame(() => {
          if (window.scrollY === previousY) {
            window.scrollBy({ top: delta.y, left: 0, behavior: "auto" });
          }
        });
      }, { capture: true, passive: true });
      window.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        if (!isPageScrollable() || isInteractiveTarget(event.target)) return;
        const delta = keyScrollDelta(event);
        if (!delta) return;
        event.preventDefault();
        if (delta === "home") {
          window.scrollTo({ top: 0, behavior: "auto" });
        } else if (delta === "end") {
          const root = document.scrollingElement || document.documentElement;
          window.scrollTo({ top: root.scrollHeight, behavior: "auto" });
        } else {
          window.scrollBy({ top: delta, left: 0, behavior: "auto" });
        }
      }, { capture: true });
    })();
  </script>`;
}

function buildSections(input: ReportTemplateInput): SectionModel {
  const newEvents = sortEvents(input.newEvents);
  const top = selectTopEvents(newEvents, 5);
  const used = new Set(top.map((event) => event.id));
  const remaining = newEvents.filter((event) => !used.has(event.id));
  const brand = takeUnique(
    remaining.filter((event) => hasEntityType(event, ["brand", "person", "platform"]) && scoreOf(event) >= 58),
    used,
    8
  );
  const digital = takeUnique(
    remaining.filter((event) => event.category === "digital" || event.category === "mixed"),
    used,
    12
  );
  const media = takeUnique(
    remaining.filter((event) => event.category === "media"),
    used,
    12
  );
  const auto = takeUnique(
    remaining.filter((event) => event.category === "auto"),
    used,
    12
  );
  const updated = sortEvents(input.updatedEvents).slice(0, 10);
  return {
    top,
    mainline: buildMainline(input, [...top, ...brand, ...digital, ...media, ...auto], updated),
    digital,
    media,
    auto,
    brand,
    updated,
    failed: input.sourceStatuses.filter((status) => !status.ok || status.warnings?.length),
    importantCount: input.newEvents.filter((event) => scoreOf(event) >= 70).length
  };
}

function selectTopEvents(events: EventRecord[], limit: number): EventRecord[] {
  const sorted = sortEvents(events);
  const promoted = sorted.filter(isTopStoryCandidate);
  const fallback = sorted.filter((event) => !isTopStoryCandidate(event));
  return [...promoted, ...fallback].slice(0, limit);
}

function isTopStoryCandidate(event: EventRecord): boolean {
  return !hasNoHeadlineCap(event);
}

function hasNoHeadlineCap(event: EventRecord): boolean {
  return (event.caps || []).some((cap) => cap.includes("不做头条"));
}

function takeUnique(events: EventRecord[], used: Set<string>, limit: number): EventRecord[] {
  const result: EventRecord[] = [];
  for (const event of sortEvents(events)) {
    if (used.has(event.id)) continue;
    used.add(event.id);
    result.push(event);
    if (result.length >= limit) break;
  }
  return result;
}

function buildMainline(input: ReportTemplateInput, events: EventRecord[], updated: EventRecord[]): string[] {
  if (events.length === 0 && updated.length === 0) {
    return ["本窗口没有形成明确新增主线，建议先看数据源异常与限制，等待下一次运行补齐。"];
  }
  const category = topKey(countBy(events, (event) => categoryLabels[event.category] || "其他"));
  const entities = topEntities(events).slice(0, 4).join("、") || "多个主体";
  const tags = topTags(events).slice(0, 5).join("、") || "行业动态";
  const lines = [
    `${category || "行业动态"}是本窗口的主要信号，集中在 ${entities}，关键词是 ${tags}。`,
    `Top 事件优先关注“为什么重要”和“内容创作影响”，它们比单条标题更适合直接转成选题。`
  ];
  if (updated.length > 0) {
    lines.push(`有 ${updated.length} 个事件出现新增来源或持续发酵，适合进入持续跟踪列表，避免被同一话题的二次传播带偏。`);
  }
  const sourceFailures = input.sourceStatuses.filter((status) => !status.ok).length;
  if (sourceFailures > 0) {
    lines.push(`本次有 ${sourceFailures} 个数据源异常，结论更适合当作雷达提示，而不是最终行业定论。`);
  }
  return lines;
}

function renderSection(title: string, events: EventRecord[], options: { ranked?: boolean; top?: boolean } = {}): string {
  if (events.length === 0) {
    return `<section><h2>${escapeHtml(title)}</h2><div class="empty">暂无新增。</div></section>`;
  }
  return `<section><h2>${escapeHtml(title)}</h2><div class="event-list ${options.top ? "top-list" : ""}">${events
    .map((event, index) => renderCard(event, options.ranked ? index + 1 : undefined, options.top))
    .join("")}</div></section>`;
}

function renderCard(event: EventRecord, rank?: number, top = false): string {
  const tags = (event.tags || []).slice(0, 7);
  const sources = event.sources || [];
  return `<article class="event-card ${top ? "top" : ""}">
    <div class="card-head">
      ${rank ? `<span class="rank">${rank}</span>` : ""}
      <h3>${escapeHtml(event.title)}</h3>
      <span class="score">${escapeHtml(event.radar_level || "D")} ${scoreOf(event)}</span>
    </div>
    <p class="summary"><span class="label">推荐理由</span>${escapeHtml(event.push_reason || "适合进入观察池。")}</p>
    <p class="summary"><span class="label">一句话</span>${escapeHtml(event.summary)}</p>
    <p class="why"><span class="label">为什么重要</span>${escapeHtml(event.why_it_matters)}</p>
    <p class="creator"><span class="label">内容关系</span>${escapeHtml(event.creator_impact)}</p>
    <p><span class="label">内容切入</span>${escapeHtml(event.content_angle)}</p>
    <p><span class="label">标题/封面</span>${escapeHtml(event.cover_angle)}</p>
    <div class="meta">
      <span class="pill">已入库</span>
      <span class="pill">${escapeHtml(confidenceLabel(event.confidence))}</span>
      <span class="pill">${escapeHtml(categoryLabels[event.category] || event.category)}</span>
      ${tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
    </div>
    <div class="sources">${sources.map((source, index) => `<a href="${escapeAttribute(safeHref(source.url))}" target="_blank" rel="noreferrer"><span>${escapeHtml(sourceLinkLabel(sources, source.source, index))}</span><code>${escapeHtml(source.url)}</code></a>`).join("")}</div>
  </article>`;
}

function sourceLinkLabel(sources: EventRecord["sources"], source: string, index: number): string {
  const sameSourceCount = (sources || []).filter((item) => item.source === source).length;
  if (sameSourceCount <= 1) return source;
  const ordinal = (sources || []).slice(0, index + 1).filter((item) => item.source === source).length;
  return `${source} ${ordinal}`;
}

function renderStatus(status: SourceStatus): string {
  const cls = status.ok ? "status-ok" : "status-bad";
  return `<span class="pill ${cls}">${status.ok ? "OK" : "异常"} ${escapeHtml(status.source)} ${escapeHtml(status.count)}</span>`;
}

function sortEvents(events: EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => scoreOf(b) - scoreOf(a) || b.updated_at.localeCompare(a.updated_at));
}

function scoreOf(event: EventRecord): number {
  return event.radar_score ?? event.importance_score ?? 0;
}

function confidenceLabel(value: EventRecord["confidence"]): string {
  const labels: Record<string, string> = {
    high: "高置信",
    medium: "中置信",
    low: "低置信"
  };
  return labels[value || "low"] ?? "低置信";
}

function hasEntityType(event: EventRecord, types: string[]): boolean {
  return (event.entities || []).some((entity) => types.includes(entity.type));
}

function topEntities(events: EventRecord[]): string[] {
  return topKeys(countBy(events.flatMap((event) => event.entities || []), (entity) => entity.name));
}

function topTags(events: EventRecord[]): string[] {
  return topKeys(countBy(events.flatMap((event) => event.tags || []), (tag) => tag));
}

function countBy<T>(items: T[], getter: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = getter(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function topKey(map: Map<string, number>): string {
  return topKeys(map)[0] || "";
}

function topKeys(map: Map<string, number>): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([key]) => key);
}

function escapeHtml(input: string | number): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/'/g, "&#39;");
}

function safeHref(input: string): string {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "#";
  } catch {
    return "#";
  }
}

function markdownSourceLink(source: NonNullable<EventRecord["sources"]>[number]): string {
  const href = safeHref(source.url);
  const label = escapeMarkdownLinkText(source.source || "来源");
  if (href === "#") {
    return escapeMarkdownText(`${source.source || "来源"}: ${source.url || "无可用地址"}`);
  }
  return `[${label}](<${escapeMarkdownUrl(href)}>)`;
}

function escapeMarkdownLinkText(input: string): string {
  return escapeMarkdownText(input).replace(/\]/g, "\\]");
}

function escapeMarkdownText(input: string): string {
  return String(input).replace(/\\/g, "\\\\").replace(/\[/g, "\\[");
}

function escapeMarkdownUrl(input: string): string {
  return input.replace(/</g, "%3C").replace(/>/g, "%3E");
}

export function toGeneratedReport(input: ReportTemplateInput, htmlPath: string, markdownPath: string): GeneratedReport {
  return {
    id: input.id,
    type: input.type,
    window: input.window,
    htmlPath: path.resolve(htmlPath),
    markdownPath: path.resolve(markdownPath),
    markdown: renderMarkdown(input),
    html: renderHtml(input),
    newEvents: input.newEvents,
    updatedEvents: input.updatedEvents,
    sourceStatuses: input.sourceStatuses
  };
}
