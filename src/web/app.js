import { buildFrontpageModel, frontpageStateForView } from "./editorial-frontpage.js";
import { summarizeActiveFilters } from "./filter-summary.js";

const SECTION_PREVIEW_LIMIT = 4;
const REPORT_PREVIEW_LIMIT = 8;
const HOTSPOT_POLL_INTERVAL_MS = 3000;
const STATIC_FEEDBACK_STORAGE_KEY = "industry-radar.staticFeedback.v1";
const STATIC_FEEDBACK_TYPES = ["favorite", "follow", "ignore"];

const state = {
  events: [],
  selectedId: "",
  detailRequestId: 0,
  dataMode: "unknown",
  apiOverviewError: null,
  viewMode: "home",
  readOnly: false,
  expandedSections: new Set(),
  reportsExpanded: false,
  staticOverview: null,
  staticOverviewUrl: "",
  staticAllEvents: null,
  staticEventsUrl: "",
  staticEventsLoadPromise: null,
  staticEventsError: null,
  staticNoticeShown: false,
  staticEventIndex: new Map(),
  staticFeedback: loadStaticFeedback(),
  hotspotPollTimer: 0,
  hotspotRefreshLastCompletedId: "",
  knowledgeHealth: null,
  facets: {
    sources: [],
    tags: [],
    entities: [],
    categories: []
  }
};

const STATIC_OVERVIEW_CANDIDATES = ["./public-data/overview.json", "/public-data/overview.json"];

const els = {
  updatedAt: requireElement("updatedAt"),
  hotspotRefreshBtn: requireElement("hotspotRefreshBtn"),
  hotspotStatus: requireElement("hotspotStatus"),
  metricRecent: requireElement("metricRecent"),
  metricImportant: requireElement("metricImportant"),
  metricFollow: requireElement("metricFollow"),
  metricReports: requireElement("metricReports"),
  frontpageLead: requireElement("frontpageLead"),
  frontpageStats: requireElement("frontpageStats"),
  editorialStrips: requireElement("editorialStrips"),
  sectionStats: requireElement("sectionStats"),
  sourceStatus: requireElement("sourceStatus"),
  infographic: requireElement("infographic"),
  query: requireElement("query"),
  filterSummary: requireElement("filterSummary"),
  category: requireElement("category"),
  source: requireElement("source"),
  entity: requireElement("entity"),
  tag: requireElement("tag"),
  favorite: requireElement("favorite"),
  follow: requireElement("follow"),
  ignored: requireElement("ignored"),
  entityList: requireElement("entityList"),
  tagList: requireElement("tagList"),
  searchBtn: requireElement("searchBtn"),
  resultTitle: requireElement("resultTitle"),
  count: requireElement("count"),
  sections: requireElement("sections"),
  results: requireElement("results"),
  detail: requireElement("detail"),
  knowledgeHealth: requireElement("knowledgeHealth"),
  reports: requireElement("reports"),
  reportJsonLink: document.getElementById("reportJsonLink"),
  timelineQuery: requireElement("timelineQuery"),
  timelineBtn: requireElement("timelineBtn"),
  timeline: requireElement("timeline")
};

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required DOM element: #${id}`);
  return element;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json();
}

function loadStaticFeedback() {
  try {
    const raw = localStorage.getItem(STATIC_FEEDBACK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const normalized = {};
    for (const [eventId, feedback] of Object.entries(parsed)) {
      if (!eventId || !feedback || typeof feedback !== "object" || Array.isArray(feedback)) continue;
      const entry = {};
      for (const type of STATIC_FEEDBACK_TYPES) {
        if (feedback[type] === true) entry[type] = true;
        if (feedback[type] === false) entry[type] = false;
      }
      if (Object.keys(entry).length) normalized[eventId] = entry;
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveStaticFeedback() {
  try {
    localStorage.setItem(STATIC_FEEDBACK_STORAGE_KEY, JSON.stringify(state.staticFeedback));
    return true;
  } catch {
    return false;
  }
}

async function bootstrap() {
  try {
    setLoading("正在读取知识库...");
    const data = await loadOverview();
    state.facets = data.facets || state.facets;
    renderOverview(data);
    renderFacetControls(state.facets);
    renderKnowledgeHealth(data.knowledgeHealth);
    renderReports(data.reports || []);
    renderHome(data.events || []);
    syncHotspotRefreshStatus();
  } catch (error) {
    renderError(error);
    syncHotspotRefreshStatus();
  }
}

async function loadOverview() {
  const apiOverview = await tryLoadApiOverview();
  if (apiOverview) return apiOverview;

  const staticError = await tryLoadStaticOverview();
  if (state.staticOverview) return state.staticOverview;

  const apiError = state.apiOverviewError;
  const message = [
    "没有找到线上静态数据，也无法连接本地 API。",
    "请确认 public-data/overview.json 已发布，或本地服务正在运行。",
    staticError ? `静态数据：${staticError.message}` : "",
    apiError ? `本地 API：${apiError.message}` : ""
  ]
    .filter(Boolean)
    .join(" ");
  throw new Error(message);
}

async function tryLoadApiOverview() {
  try {
    state.dataMode = "api";
    state.readOnly = false;
    const data = await fetchJson("/api/overview");
    state.apiOverviewError = null;
    state.staticOverview = null;
    state.staticOverviewUrl = "";
    resetStaticAllEvents();
    state.staticEventIndex = new Map();
    return normalizeOverviewPayload(data);
  } catch (apiError) {
    state.apiOverviewError = apiError;
    return null;
  }
}

async function tryLoadStaticOverview() {
  let lastError;
  for (const url of staticOverviewUrls()) {
    try {
      const data = normalizeOverviewPayload(await fetchJson(url, { cache: "no-store" }));
      state.dataMode = "static";
      state.readOnly = true;
      state.staticOverview = data;
      state.staticOverviewUrl = url;
      resetStaticAllEvents();
      state.staticEventIndex = indexStaticEvents(data);
      return undefined;
    } catch (error) {
      lastError = error;
    }
  }
  state.dataMode = "unknown";
  state.readOnly = false;
  state.staticOverview = null;
  state.staticOverviewUrl = "";
  resetStaticAllEvents();
  state.staticEventIndex = new Map();
  return lastError;
}

function staticOverviewUrls() {
  const seen = new Set();
  return STATIC_OVERVIEW_CANDIDATES.map((candidate) => new URL(candidate, window.location.href).href).filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function staticEventsUrls() {
  const candidates = [];
  const configured = state.staticOverview?.links?.events || state.staticOverview?.events_url || state.staticOverview?.eventsUrl;
  if (configured && state.staticOverviewUrl) candidates.push(new URL(configured, state.staticOverviewUrl).href);
  if (state.staticOverviewUrl) candidates.push(new URL("events.json", state.staticOverviewUrl).href);
  for (const overviewUrl of staticOverviewUrls()) {
    candidates.push(new URL("events.json", overviewUrl).href);
  }
  const seen = new Set();
  return candidates.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function resetStaticAllEvents() {
  state.staticAllEvents = null;
  state.staticEventsUrl = "";
  state.staticEventsLoadPromise = null;
  state.staticEventsError = null;
  state.staticNoticeShown = false;
}

function normalizeOverviewPayload(payload) {
  const source = payload?.overview || payload || {};
  const events = Array.isArray(source.events) ? source.events : Array.isArray(payload?.events) ? payload.events : [];
  const reports = Array.isArray(source.reports) ? source.reports : Array.isArray(payload?.reports) ? payload.reports : [];
  return {
    ...source,
    metrics: source.metrics || buildStaticMetrics(events, reports),
    events,
    reports,
    facets: source.facets || buildStaticFacets(events),
    knowledgeHealth: source.knowledgeHealth || source.knowledge_health || payload?.knowledgeHealth || buildStaticKnowledgeHealth(events),
    meta: source.meta || payload?.meta || {}
  };
}

function indexStaticEvents(data) {
  const entries = new Map();
  for (const event of data.events || []) {
    if (event?.id) entries.set(String(event.id), event);
  }
  const detailCollections = [data.eventDetails, data.event_details, data.details];
  for (const collection of detailCollections) {
    if (!collection) continue;
    if (Array.isArray(collection)) {
      for (const event of collection) {
        if (event?.id) entries.set(String(event.id), event);
      }
    } else {
      for (const [id, event] of Object.entries(collection)) {
        entries.set(String(event?.id || id), { id, ...event });
      }
    }
  }
  return entries;
}

async function ensureStaticAllEvents() {
  if (!state.readOnly) return state.events || [];
  if (Array.isArray(state.staticAllEvents)) return state.staticAllEvents;
  if (!state.staticEventsLoadPromise) {
    state.staticEventsLoadPromise = loadStaticAllEvents().finally(() => {
      state.staticEventsLoadPromise = null;
    });
  }
  return state.staticEventsLoadPromise;
}

async function loadStaticAllEvents() {
  let lastError;
  for (const url of staticEventsUrls()) {
    try {
      const payload = await fetchJson(url, { cache: "no-store" });
      const exportedEvents = normalizeStaticEventsPayload(payload);
      const events = mergeStaticEvents(state.staticOverview?.events || [], exportedEvents);
      state.staticAllEvents = events;
      state.staticEventsUrl = url;
      state.staticEventsError = null;
      addStaticEventsToIndex(events);
      return events;
    } catch (error) {
      lastError = error;
    }
  }

  const fallbackEvents = state.staticOverview?.events || [];
  state.staticAllEvents = fallbackEvents;
  state.staticEventsUrl = "";
  state.staticEventsError = lastError || new Error("events.json 未找到");
  addStaticEventsToIndex(fallbackEvents);
  showStaticDataNotice("全量事件加载失败，搜索范围已降级为首页预览数据。");
  console.warn("Static events fallback to overview preview", state.staticEventsError);
  return fallbackEvents;
}

function normalizeStaticEventsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  const source = payload?.events ? payload : payload?.data || payload || {};
  return Array.isArray(source.events) ? source.events : [];
}

function mergeStaticEvents(...collections) {
  const events = new Map();
  for (const collection of collections) {
    for (const event of collection || []) {
      if (!event?.id) continue;
      events.set(String(event.id), event);
    }
  }
  return [...events.values()];
}

function addStaticEventsToIndex(events) {
  for (const event of events || []) {
    if (event?.id) state.staticEventIndex.set(String(event.id), event);
  }
}

function showStaticDataNotice(message) {
  if (state.staticNoticeShown) return;
  state.staticNoticeShown = true;
  if (els.sourceStatus) {
    const current = els.sourceStatus.textContent || "";
    els.sourceStatus.textContent = current ? `${current} · ${message}` : message;
  }
}

async function syncHotspotRefreshStatus() {
  clearHotspotPollTimer();
  try {
    const data = await fetchJson("/api/hotspots/refresh");
    renderHotspotRefreshStatus(data.job || { status: "idle" });
    if (data.job?.status === "running") scheduleHotspotRefreshPoll();
  } catch (error) {
    if (state.readOnly) {
      renderHotspotRefreshStatus({ status: "static" });
      return;
    }
    renderHotspotRefreshStatus({ status: "unavailable", error: error.message });
  }
}

async function startHotspotRefresh() {
  clearHotspotPollTimer();
  renderHotspotRefreshStatus({ status: "requesting" });
  try {
    const data = await fetchJson("/api/hotspots/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const job = data.job || { status: data.started ? "running" : "idle" };
    renderHotspotRefreshStatus(job);
    if (job.status === "running") scheduleHotspotRefreshPoll();
    else if (job.status === "success") await refreshAfterHotspotJob(job);
  } catch (error) {
    if (state.readOnly) {
      renderHotspotRefreshStatus({ status: "static" });
      return;
    }
    renderHotspotRefreshStatus({ status: "failed", error: error.message });
  }
}

function scheduleHotspotRefreshPoll(delay = HOTSPOT_POLL_INTERVAL_MS) {
  clearHotspotPollTimer();
  state.hotspotPollTimer = window.setTimeout(pollHotspotRefreshStatus, delay);
}

function clearHotspotPollTimer() {
  if (!state.hotspotPollTimer) return;
  window.clearTimeout(state.hotspotPollTimer);
  state.hotspotPollTimer = 0;
}

async function pollHotspotRefreshStatus() {
  try {
    const data = await fetchJson("/api/hotspots/refresh", { cache: "no-store" });
    const job = data.job || { status: "idle" };
    renderHotspotRefreshStatus(job);
    if (job.status === "running") {
      scheduleHotspotRefreshPoll();
      return;
    }
    if (job.status === "success") await refreshAfterHotspotJob(job);
  } catch (error) {
    if (state.readOnly) {
      renderHotspotRefreshStatus({ status: "static" });
      return;
    }
    renderHotspotRefreshStatus({ status: "unavailable", error: error.message });
  }
}

async function refreshAfterHotspotJob(job) {
  if (!job?.id || state.hotspotRefreshLastCompletedId === job.id) return;
  state.hotspotRefreshLastCompletedId = job.id;
  try {
    const data = await loadOverview();
    state.facets = data.facets || state.facets;
    renderOverview(data);
    renderFacetControls(state.facets);
    renderKnowledgeHealth(data.knowledgeHealth);
    renderReports(data.reports || []);
    renderHome(data.events || []);
  } catch (error) {
    renderHotspotRefreshStatus({ status: "failed", error: `刷新页面数据失败：${error.message}` });
  }
}

function renderHotspotRefreshStatus(job) {
  const status = job?.status || "idle";
  const isBusy = status === "running" || status === "requesting";
  const isStatic = status === "static";
  els.hotspotRefreshBtn.disabled = isBusy || isStatic;
  els.hotspotRefreshBtn.classList.toggle("is-running", isBusy);
  els.hotspotRefreshBtn.classList.toggle("is-static", isStatic);
  els.hotspotRefreshBtn.classList.toggle("is-failed", status === "failed" || status === "unavailable");
  els.hotspotStatus.className = `hotspot-status is-${escapeStatusClass(status)}`;

  if (status === "requesting") {
    setHotspotButtonLabel("正在发送命令", "连接 NAS 任务管线");
    els.hotspotStatus.textContent = "正在向 NAS 发送抓取命令...";
    return;
  }
  if (status === "running") {
    setHotspotButtonLabel("NAS 正在抓取", `${runTypeLabel(job.runType)} · 完成后 Bark 提醒`);
    els.hotspotStatus.textContent = `${targetLabel(job.target)}运行中${job.startedAt ? ` · ${formatDateTime(job.startedAt)}` : ""}`;
    return;
  }
  if (status === "success") {
    setHotspotButtonLabel("再次发送 NAS 命令", "远程触发 · 重算权重 · Bark 提醒");
    els.hotspotStatus.textContent = `抓取完成，权重已重算${job.finishedAt ? ` · ${formatDateTime(job.finishedAt)}` : ""}`;
    return;
  }
  if (status === "failed") {
    setHotspotButtonLabel("重新发送 NAS 命令", "上次任务失败");
    els.hotspotStatus.textContent = `抓取失败：${job.error || "请查看 NAS 日志"}`;
    return;
  }
  if (status === "unavailable") {
    setHotspotButtonLabel("发送 NAS 抓取命令", "等待命令接口");
    els.hotspotStatus.textContent = `命令接口不可用：${job.error || "未知错误"}`;
    return;
  }
  if (isStatic) {
    setHotspotButtonLabel("打开内网服务发命令", "公开页只读");
    els.hotspotStatus.textContent = "公开页只读：发送 NAS 命令需要内网 Web 服务。";
    return;
  }

  setHotspotButtonLabel("发送 NAS 抓取命令", "远程触发 · 重算权重 · Bark 提醒");
  els.hotspotStatus.textContent = "NAS 命令通道待命";
}

function setHotspotButtonLabel(title, subtitle) {
  const titleEl = els.hotspotRefreshBtn.querySelector("span");
  const subtitleEl = els.hotspotRefreshBtn.querySelector("small");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
}

function runTypeLabel(type) {
  return {
    morning: "早报",
    noon: "午报",
    night: "晚报"
  }[type] || "即时";
}

function targetLabel(target) {
  return target === "nas-ssh" ? "NAS 命令" : "本机任务";
}

function escapeStatusClass(value) {
  return String(value || "idle").replace(/[^a-z0-9_-]/gi, "");
}

function enableRootScrollFallback() {
  window.addEventListener(
    "wheel",
    (event) => {
      const delta = normalizedWheelDelta(event);
      if (event.defaultPrevented || event.ctrlKey || Math.abs(delta.y) <= Math.abs(delta.x)) return;
      if (!isPageScrollable() || hasScrollableAncestor(event.target, delta.y)) return;

      const previousY = window.scrollY;
      window.requestAnimationFrame(() => {
        if (window.scrollY === previousY) {
          window.scrollBy({ top: delta.y, left: 0, behavior: "auto" });
        }
      });
    },
    { capture: true, passive: true }
  );
  window.addEventListener(
    "keydown",
    (event) => {
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
    },
    { capture: true }
  );
}

function isPageScrollable() {
  const root = document.scrollingElement || document.documentElement;
  return root.scrollHeight > root.clientHeight + 1;
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

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, [contenteditable='true'], [tabindex]:not([tabindex='-1'])"));
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

function normalizedWheelDelta(event) {
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
  return {
    x: event.deltaX * unit,
    y: event.deltaY * unit
  };
}

function renderOverview(data) {
  const metrics = data.metrics || {};
  const events = data.events || [];
  const grouped = groupBySection(events);
  const updatedAt = data.meta?.updated_at || data.meta?.updatedAt || data.updated_at || data.updatedAt || data.generated_at || data.generatedAt;
  const modeLabel = state.readOnly ? "线上数据更新时间" : "本地更新时间";
  els.metricRecent.textContent = String(metrics.recentEvents || 0);
  els.metricImportant.textContent = String(metrics.mustRead ?? grouped.must_read.length);
  els.metricFollow.textContent = String(metrics.developing ?? grouped.developing.length);
  els.metricReports.textContent = String(metrics.reports || 0);
  els.updatedAt.textContent = `${modeLabel} ${formatFullDateTime(updatedAt || new Date())}`;
  els.sourceStatus.textContent = `${state.readOnly ? "线上静态 · " : ""}高置信 ${metrics.highConfidence ?? countBy(events, (event) => event.confidence === "high")} 条 · 旧闻/背景 ${metrics.background ?? grouped.background.length} 条 · 降级或示例数据会被封顶标注`;
  els.sectionStats.innerHTML = [
    ["今日必看", metrics.mustRead ?? grouped.must_read.length],
    ["正在发酵", metrics.developing ?? grouped.developing.length],
    ["待补证据", evidenceCount(events, data.knowledgeHealth)],
    ["背景知识", metrics.background ?? grouped.background.length]
  ]
    .map(([label, value]) => `<div><b>${Number(value || 0)}</b><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function renderFacetControls(facets) {
  const currentSource = els.source.value;
  els.source.innerHTML = `<option value="">全部来源</option>${(facets.sources || [])
    .map((source) => `<option value="${escapeAttr(source)}">${escapeHtml(source)}</option>`)
    .join("")}`;
  els.source.value = currentSource;

  els.entityList.innerHTML = (facets.entities || [])
    .map((entity) => `<option value="${escapeAttr(entity.name)}"></option>`)
    .join("");
  els.tagList.innerHTML = (facets.tags || [])
    .map((tag) => `<option value="${escapeAttr(tag)}"></option>`)
    .join("");
  updateFilterSummary();
}

function renderReports(reports) {
  if (els.reportJsonLink) {
    els.reportJsonLink.href = state.readOnly ? staticReportsIndexUrl() : "/api/reports";
    els.reportJsonLink.textContent = state.readOnly ? "数据" : "JSON";
  }
  if (!reports.length) {
    els.reports.innerHTML = `<p class="muted">暂无报告。先运行一次报告生成。</p>`;
    return;
  }
  const visible = state.reportsExpanded ? reports : reports.slice(0, REPORT_PREVIEW_LIMIT);
  const toggle =
    reports.length > REPORT_PREVIEW_LIMIT
      ? `<button type="button" class="list-toggle" data-reports-toggle aria-expanded="${state.reportsExpanded ? "true" : "false"}">${
          state.reportsExpanded ? "收起" : `显示全部 ${reports.length} 份`
        }</button>`
      : "";
  els.reports.innerHTML = visible
    .map((report) => {
      const label = reportLabel(report.report_type);
      const date = formatDateTime(report.created_at);
      return `<article class="report-row">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(date)} · ${Number(report.event_count || 0)} 条</span>
        </div>
        <nav>
          <a href="${escapeAttr(reportAssetUrl(report.html_url))}" target="_blank" rel="noreferrer">HTML</a>
          <a href="${escapeAttr(reportAssetUrl(report.markdown_url))}" target="_blank" rel="noreferrer">MD</a>
        </nav>
      </article>`;
    })
    .join("") + toggle;
  const toggleButton = els.reports.querySelector("[data-reports-toggle]");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.reportsExpanded = !state.reportsExpanded;
      renderReports(reports);
    });
  }
}

function staticReportsIndexUrl() {
  const configured = typeof state.staticOverview?.links?.reports === "string" ? state.staticOverview.links.reports : "reports/index.json";
  return staticPublicDataUrl(configured, "#");
}

function reportAssetUrl(value) {
  if (!state.readOnly) return safeUrl(value);
  return staticPublicDataUrl(value, "#");
}

function staticPublicDataUrl(value, fallback) {
  const safe = safeUrl(value);
  if (!safe || safe === "#") return fallback;
  const overviewUrl = absoluteStaticOverviewUrl();
  if (!overviewUrl) return fallback;
  if (safe.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(safe)) {
    try {
      const url = new URL(safe);
      const overview = new URL(overviewUrl);
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === overview.origin ? url.href : fallback;
    } catch {
      return fallback;
    }
  }
  // Static exports store report links relative to public-data/overview.json.
  let relativePublicDataPath = safe.replace(/^\/+/, "").replace(/^\.\//, "");
  if (relativePublicDataPath.startsWith("public-data/")) {
    relativePublicDataPath = relativePublicDataPath.slice("public-data/".length);
  }
  try {
    if (decodeURIComponent(relativePublicDataPath).split("/").includes("..")) return fallback;
  } catch {
    return fallback;
  }
  try {
    return new URL(relativePublicDataPath, overviewUrl).href;
  } catch {
    return fallback;
  }
}

function absoluteStaticOverviewUrl() {
  const overviewUrl = state.staticOverviewUrl || staticOverviewUrls()[0];
  if (!overviewUrl) return "";
  try {
    return new URL(overviewUrl, window.location.href).href;
  } catch {
    return "";
  }
}

function renderResults(events, title, viewMode = "list") {
  state.viewMode = viewMode;
  state.events = events;
  els.resultTitle.textContent = title;
  els.count.textContent = `${events.length} 条`;
  els.sections.innerHTML = "";
  renderEmptyFrontpage(frontpageStateForView(state.viewMode).emptyMessage);

  if (!events.length) {
    els.results.innerHTML = `<div class="empty-state">没有找到匹配事件。可以换一个关键词，或先用 Mock 数据生成报告。</div>`;
    renderEmptyDetail();
    return;
  }

  els.results.innerHTML = events.map(eventCard).join("");
  bindEventSelection(els.results);
  selectEvent(state.selectedId && events.some((event) => event.id === state.selectedId) ? state.selectedId : events[0].id);
}

function renderHome(events) {
  state.viewMode = "home";
  state.events = events;
  els.resultTitle.textContent = "今日情报分区";
  els.count.textContent = `${events.length} 条`;
  els.results.innerHTML = "";

  if (!events.length) {
    renderEmptyFrontpage("暂无情报头版。先运行一次报告生成。");
    els.sections.innerHTML = `<div class="empty-state">暂无情报。先运行一次报告生成。</div>`;
    els.infographic.innerHTML = `<div class="empty-state">暂无可生成的一图读懂。</div>`;
    renderEmptyDetail();
    return;
  }

  const grouped = groupBySection(events);
  const frontpage = buildFrontpageModel(events, state.knowledgeHealth);
  const first = frontpage.lead || grouped.must_read[0] || grouped.developing[0] || events[0];
  renderFrontpage(frontpage, events, grouped);
  renderInfographic(first);
  els.sections.innerHTML = [
    scoreLegend(),
    sectionBlock("must_read", "今日必看", "优先读，适合快速判断今天行业动向。", grouped.must_read),
    sectionBlock("developing", "正在发酵", "趋势在扩散，但还需要继续交叉验证。", grouped.developing),
    sectionBlock("background", "背景知识", "旧闻、时间不明或低分内容，只作为资料沉淀。", grouped.background)
  ].join("");
  bindEventSelection(els.sections);
  for (const button of els.sections.querySelectorAll("[data-section-toggle]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.sectionToggle;
      if (!key) return;
      if (state.expandedSections.has(key)) state.expandedSections.delete(key);
      else state.expandedSections.add(key);
      renderHome(state.events);
    });
  }
  selectEvent(state.selectedId && events.some((event) => event.id === state.selectedId) ? state.selectedId : first.id);
}

function renderFrontpage(model, events, grouped) {
  if (!model.lead?.id) {
    renderEmptyFrontpage("暂无可置顶的头版情报。");
    return;
  }

  renderLeadStory(model.lead);
  renderFrontpageStats(events, grouped);
  renderEditorialStrips(model);
  bindEventSelection(els.frontpageLead);
  bindEventSelection(els.editorialStrips);
}

function renderLeadStory(event) {
  delete els.frontpageLead.dataset.eventId;
  els.frontpageLead.removeAttribute("role");
  els.frontpageLead.removeAttribute("tabindex");
  els.frontpageLead.innerHTML = `<div class="frontpage-kicker">头版头条</div>
    <div class="frontpage-lead-head">
      <h2>${escapeHtml(event.title || "未命名情报")}</h2>
      ${scorePill(event)}
    </div>
    <p class="frontpage-summary">${escapeHtml(event.push_reason || event.summary || "暂无摘要。")}</p>
    <dl class="frontpage-angles">
      <dt>为什么重要</dt>
      <dd>${escapeHtml(event.why_it_matters || "暂无明确影响说明。")}</dd>
      <dt>内容切入</dt>
      <dd>${escapeHtml(event.content_angle || "暂无可用选题角度。")}</dd>
    </dl>
    <button type="button" class="event-select-button" data-event-id="${escapeAttr(event.id)}" data-reveal-detail="true">打开知识卡</button>
    <div class="source-list compact-source-list">${renderCompactSourceLinks(event.sources, 4) || `<p class="muted">暂无来源链接</p>`}</div>`;
}

function renderFrontpageStats(events, grouped) {
  const rows = [
    ["今日必看", grouped.must_read.length],
    ["正在发酵", grouped.developing.length],
    ["待补证据", evidenceCount(events)],
    ["背景知识", grouped.background.length]
  ];
  els.frontpageStats.innerHTML = `<div class="frontpage-stat-grid">
      ${rows.map(([label, value]) => `<div><b>${Number(value || 0)}</b><span>${escapeHtml(label)}</span></div>`).join("")}
    </div>
    <p class="muted">${escapeHtml(frontpageSourceStatus(events, grouped))}</p>`;
}

function frontpageSourceStatus(events, grouped) {
  return `${state.readOnly ? "线上静态 · " : ""}高置信 ${countBy(events, (event) => event.confidence === "high")} 条 · 旧闻/背景 ${
    grouped.background.length
  } 条 · 降级或示例数据会被封顶标注`;
}

function evidenceCount(events, knowledgeHealth = null) {
  const queued = knowledgeHealth?.queueCounts?.needsEvidence;
  if (Number.isFinite(Number(queued))) return Number(queued);
  return (events || []).filter((event) => event.confidence === "low" || (event.sources || []).length <= 1 || (event.caps || []).length).length;
}

function renderEditorialStrips(model) {
  els.editorialStrips.innerHTML = [
    editorialStrip("top-signals", "重点信号", "按 Radar Score 排序，先判断今天真正该看的变化。", model.topSignals),
    editorialStrip("needs-evidence", "待补证据", "低置信、单来源或存在封顶标记，需要继续交叉验证。", model.needsEvidence)
  ].join("");
}

function editorialStrip(key, title, subtitle, events) {
  const items = (events || []).filter((event) => event?.id);
  return `<section class="editorial-strip" data-strip="${escapeAttr(key)}">
    <div class="editorial-strip-head">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <span>${items.length} 条</span>
    </div>
    <div class="editorial-strip-items">
      ${items.length ? items.map(editorialStripItem).join("") : `<div class="empty-state compact-empty">暂无。</div>`}
    </div>
  </section>`;
}

function editorialStripItem(event) {
  const score = scoreMeta(event);
  return `<article class="editorial-strip-item" data-event-id="${escapeAttr(event.id)}" role="button" tabindex="0">
    <div>
      <strong>${escapeHtml(event.title || "未命名情报")}</strong>
      <span class="${escapeAttr(score.className)}">${escapeHtml(score.level)}${score.score}</span>
    </div>
    <p>${escapeHtml(briefEventSummary(event))}</p>
    <small>${escapeHtml(categoryLabel(event.category))} · ${escapeHtml(confidenceLabel(event.confidence))}</small>
  </article>`;
}

function briefEventSummary(event) {
  return event.push_reason || event.summary || event.why_it_matters || "暂无摘要。";
}

function renderEmptyFrontpage(message) {
  delete els.frontpageLead.dataset.eventId;
  els.frontpageLead.removeAttribute("role");
  els.frontpageLead.removeAttribute("tabindex");
  els.frontpageLead.classList.remove("selected");
  els.frontpageLead.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  els.frontpageStats.innerHTML = `<div class="empty-state compact-empty">暂无分区简报。</div>`;
  els.editorialStrips.innerHTML = `<div class="empty-state compact-empty">暂无编辑精选。</div>`;
}

function bindEventSelection(root) {
  if (root.dataset.eventSelectionBound === "true") return;
  root.dataset.eventSelectionBound = "true";
  root.addEventListener("click", (event) => {
    const target = eventSelectionTarget(event);
    if (target) selectEvent(target.dataset.eventId, { revealDetail: shouldRevealDetail(target) });
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = eventSelectionTarget(event);
    if (!target) return;
    event.preventDefault();
    selectEvent(target.dataset.eventId, { revealDetail: shouldRevealDetail(target) });
  });
}

function eventSelectionTarget(event) {
  if (!(event.target instanceof Element) || !(event.currentTarget instanceof Element)) return null;
  if (event.target.closest("a")) return null;
  const target = event.target.closest("[data-event-id]");
  if (!target || !event.currentTarget.contains(target)) return null;
  return target;
}

function shouldRevealDetail(target) {
  return target.dataset.revealDetail === "true";
}

function sectionBlock(key, title, subtitle, events) {
  const expanded = state.expandedSections.has(key);
  const visible = expanded ? events : events.slice(0, SECTION_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, events.length - SECTION_PREVIEW_LIMIT);
  const toggle =
    hiddenCount > 0
      ? `<button type="button" class="list-toggle section-toggle" data-section-toggle="${escapeAttr(key)}" aria-expanded="${expanded ? "true" : "false"}">${
          expanded ? "收起" : `显示剩余 ${hiddenCount} 条`
        }</button>`
      : "";
  return `<section class="feed-section">
    <div class="feed-section-head">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <span>${events.length} 条</span>
    </div>
    <div class="section-cards">
      ${visible.length ? visible.map(eventCard).join("") : `<div class="empty-state compact-empty">暂无。</div>`}
    </div>
    ${toggle}
  </section>`;
}

function eventCard(event) {
  const selected = event.id === state.selectedId ? " selected" : "";
  const tags = (event.tags || [])
    .slice(0, 5)
    .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`)
    .join("");
  const entities = (event.entities || [])
    .slice(0, 3)
    .map((entity) => `<span class="pill">${escapeHtml(entityName(entity))}</span>`)
    .join("");

  return `<article class="event-card${selected}" data-event-id="${escapeAttr(event.id)}" role="button" tabindex="0">
    <div class="card-top">
      <h3>${escapeHtml(event.title)}</h3>
      ${scorePill(event)}
    </div>
    <p>${escapeHtml(event.push_reason || event.summary)}</p>
    <div class="meta">
      <span class="pill">${escapeHtml(freshnessLabel(event.freshness_label))}</span>
      <span class="pill">${escapeHtml(confidenceLabel(event.confidence))}</span>
      <span class="pill">${escapeHtml(categoryLabel(event.category))}</span>
      ${tags}
      ${entities}
    </div>
  </article>`;
}

function renderInfographic(event) {
  if (!event) {
    els.infographic.innerHTML = `<div class="empty-state">暂无可生成的一图读懂。</div>`;
    return;
  }
  const parts = event.score_parts || {};
  const score = scoreMeta(event);
  const rows = [
    ["相关度", parts.relevance || 0, 22],
    ["趋势", parts.trend || 0, 26],
    ["新鲜度", parts.freshness || 0, 18],
    ["变化", parts.change || 0, 10],
    ["可信度", parts.credibility || 0, 16],
    ["稀缺性", parts.scarcity || 0, 8]
  ];
  els.infographic.innerHTML = `<div class="info-header">
      <p class="eyebrow">一图读懂</p>
      <div class="score-badge ${escapeAttr(score.className)}">
        <span>${escapeHtml(score.level)} · ${escapeHtml(score.label)}</span>
        <b>${scoreValue(event)}</b>
        <em>${escapeHtml(score.short)}</em>
      </div>
    </div>
    <h2>${escapeHtml(event.title)}</h2>
    <p class="info-summary">${escapeHtml(event.push_reason || event.summary)}</p>
    <div class="info-grid">
      <div>
        <span>发生了什么</span>
        <p>${escapeHtml(event.summary)}</p>
      </div>
      <div>
        <span>为什么重要</span>
        <p>${escapeHtml(event.why_it_matters)}</p>
      </div>
      <div>
        <span>内容切入</span>
        <p>${escapeHtml(event.content_angle)}</p>
      </div>
    </div>
    <div class="score-bars">
      ${rows
        .map(([label, value, max]) => {
          const width = Math.round((Number(value) / Number(max)) * 100);
          return `<div class="bar-row"><span>${escapeHtml(label)}</span><i><b style="width:${width}%"></b></i><em>${Number(value)}/${Number(max)}</em></div>`;
        })
        .join("")}
    </div>
    <div class="info-footer">
      <span>${escapeHtml(freshnessLabel(event.freshness_label))}</span>
      <span>${escapeHtml(confidenceLabel(event.confidence))}</span>
      <span>更新 ${escapeHtml(formatDateTime(event.last_seen_at))}</span>
    </div>
    <div class="source-list compact-source-list">${renderCompactSourceLinks(event.sources, 3)}</div>`;
}

async function selectEvent(id, options = {}) {
  if (!id) return;
  state.selectedId = id;
  const requestId = ++state.detailRequestId;
  for (const card of document.querySelectorAll("[data-event-id]")) {
    card.classList.toggle("selected", card.dataset.eventId === id);
  }
  if (state.readOnly) {
    const event = await getStaticEvent(id);
    if (requestId !== state.detailRequestId) return;
    if (event) renderDetail(event);
    else els.detail.innerHTML = `<h2>知识卡</h2><p class="muted">静态数据里没有找到这条详情。</p>`;
    if (options.revealDetail) revealDetailPanel();
    return;
  }
  try {
    const data = await fetchJson(`/api/events/${encodeURIComponent(id)}`);
    if (requestId !== state.detailRequestId) return;
    renderDetail(data.event);
    if (options.revealDetail) revealDetailPanel();
  } catch (error) {
    if (requestId !== state.detailRequestId) return;
    els.detail.innerHTML = `<h2>知识卡</h2><p class="muted">${escapeHtml(error.message)}</p>`;
    if (options.revealDetail) revealDetailPanel();
  }
}

function revealDetailPanel() {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!els.detail.hasAttribute("tabindex")) els.detail.setAttribute("tabindex", "-1");
  els.detail.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  els.detail.focus({ preventScroll: true });
}

function renderDetail(event) {
  const feedback = feedbackSet(event);
  const tags = (event.tags || []).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");
  const entities = (event.entities || []).map((entity) => `<span class="pill">${escapeHtml(entityName(entity))}</span>`).join("");
  const parts = event.score_parts || {};
  const score = scoreMeta(event);

  els.detail.dataset.eventId = event.id || "";
  els.detail.innerHTML = `<h2>知识卡</h2>
    <h3>${escapeHtml(event.title)}</h3>
    <div class="knowledge-score">
      <div class="knowledge-score-card ${escapeAttr(score.className)}"><b>${escapeHtml(score.level)} ${score.score}</b><span>${escapeHtml(score.label)} · ${escapeHtml(score.description)}</span></div>
      <div><b>${escapeHtml(confidenceLabel(event.confidence))}</b><span>置信度</span></div>
    </div>
    <dl class="knowledge-fields">
      ${field("为什么推给你", event.push_reason)}
      ${field("一句话总结", event.summary)}
      ${field("发生了什么", event.what_happened)}
      ${field("为什么重要", event.why_it_matters)}
      ${field("创作影响", event.creator_impact)}
      ${field("内容切入", event.content_angle)}
      ${field("标题 / 封面", event.cover_angle)}
      ${field("评级说明", `${score.level} = ${score.label}，${score.description}。数字是 0-100 综合分。`)}
      ${field("评分拆解", `相关度 ${parts.relevance ?? 0}，趋势 ${parts.trend ?? 0}，新鲜度 ${parts.freshness ?? 0}，变化 ${parts.change ?? 0}，可信度 ${parts.credibility ?? 0}，稀缺性 ${parts.scarcity ?? 0}`)}
      ${field("封顶规则", (event.caps || []).join("；") || "无")}
    </dl>
    <div class="stamp">首次发现 ${escapeHtml(formatDateTime(event.first_seen_at))} · 最近更新 ${escapeHtml(formatDateTime(event.last_seen_at))} · ${escapeHtml(freshnessLabel(event.freshness_label))}</div>
    <div class="meta">${tags}${entities}</div>
    <div class="feedback-area">
      <div class="actions">
        ${feedbackButton("favorite", "收藏", feedback)}
        ${feedbackButton("follow", "持续跟踪", feedback)}
        ${feedbackButton("ignore", "不感兴趣", feedback)}
      </div>
      ${state.readOnly ? `<p class="readonly-note">线上反馈已保存在当前浏览器；刷新后仍保留，不会直接写入 NAS 数据库。</p>` : ""}
    </div>
    <div class="sources">
      <h4>原始来源</h4>
      <div class="source-list">${renderSourceLinks(event.sources, 8)}</div>
    </div>`;

}

function field(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "暂无")}</dd>`;
}

function feedbackButton(type, label, feedback) {
  const title = state.readOnly ? " title=\"线上反馈会保存在当前浏览器\"" : "";
  return `<button class="${feedback.has(type) ? "active" : ""}" data-feedback="${escapeAttr(type)}"${title}>${escapeHtml(label)}</button>`;
}

function scoreLegend() {
  const items = [
    ["A", "重点", "优先看"],
    ["B", "观察", "继续跟"],
    ["C", "背景", "可沉淀"],
    ["D", "暂存", "低优先"]
  ];
  return `<div class="score-legend" aria-label="评分说明">
    <span>评分：字母表示处理优先级，数字是 0-100 综合分；趋势权重最高</span>
    ${items
      .map(([level, label, hint]) => `<i class="radar-level-${level.toLowerCase()}"><b>${level}</b>${label}<em>${hint}</em></i>`)
      .join("")}
  </div>`;
}

function scorePill(event) {
  const score = scoreMeta(event);
  return `<span class="score-pill ${escapeAttr(score.className)}" title="${escapeAttr(`${score.level} = ${score.label}，${score.description}。数字是 0-100 综合分。`)}">
    <b>${escapeHtml(score.level)}</b>
    <span>${escapeHtml(score.label)}</span>
    <em>${score.score}</em>
  </span>`;
}

function scoreMeta(event) {
  const level = String(event.radar_level || fallbackLevel(scoreValue(event))).toUpperCase();
  const normalized = ["A", "B", "C", "D"].includes(level) ? level : fallbackLevel(scoreValue(event));
  const labels = {
    A: ["重点", "优先阅读，适合马上判断要不要做内容", "优先看"],
    B: ["观察", "有信号但还需要继续验证", "继续跟"],
    C: ["背景", "适合沉淀为资料或备选素材", "可沉淀"],
    D: ["暂存", "优先级低，除非后续有新证据", "低优先"]
  };
  const [label, description, short] = labels[normalized];
  return {
    level: normalized,
    label,
    description,
    short,
    score: scoreValue(event),
    className: `radar-level-${normalized.toLowerCase()}`
  };
}

function fallbackLevel(score) {
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

async function toggleFeedback(eventId, button) {
  const feedbackType = button.dataset.feedback;
  if (!feedbackType) return;
  const enabled = !button.classList.contains("active");
  button.disabled = true;
  if (state.readOnly) {
    try {
      await toggleStaticFeedback(eventId, feedbackType, enabled);
    } catch (error) {
      if (button.isConnected) button.disabled = false;
      els.detail.insertAdjacentHTML("beforeend", `<p class="form-error">${escapeHtml(error.message)}</p>`);
    }
    return;
  }
  try {
    const data = await fetchJson(`/api/events/${encodeURIComponent(eventId)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedbackType, enabled })
    });
    renderDetail(data.event);
    await refreshOverviewOnly().catch((refreshError) => {
      console.warn("Overview refresh failed after feedback update", refreshError);
    });
  } catch (error) {
    if (button.isConnected) button.disabled = false;
    els.detail.insertAdjacentHTML("beforeend", `<p class="form-error">${escapeHtml(error.message)}</p>`);
  }
}

async function toggleStaticFeedback(eventId, feedbackType, enabled) {
  if (!STATIC_FEEDBACK_TYPES.includes(feedbackType)) {
    throw new Error("不支持的反馈类型。");
  }
  const id = String(eventId || "");
  if (!id) throw new Error("缺少事件 ID，无法保存反馈。");
  state.staticFeedback = {
    ...state.staticFeedback,
    [id]: {
      ...(state.staticFeedback[id] || {}),
      [feedbackType]: Boolean(enabled)
    }
  };
  if (!saveStaticFeedback()) {
    throw new Error("浏览器拒绝保存反馈，请检查隐私模式或存储权限。");
  }
  const event = await getStaticEvent(id);
  if (els.favorite.checked || els.follow.checked || els.ignored.checked) {
    await search();
    return;
  }
  if (event) renderDetail(event);
}

async function refreshOverviewOnly() {
  const data = state.readOnly && state.staticOverview ? state.staticOverview : await fetchJson("/api/overview");
  renderOverview(data);
  renderKnowledgeHealth(data.knowledgeHealth);
  renderReports(data.reports || []);
  const events = data.events || state.events || [];
  const grouped = groupBySection(events);
  const frontpage = buildFrontpageModel(events, state.knowledgeHealth);
  const frontpageState = frontpageStateForView(state.viewMode);
  if (frontpageState.shouldRenderFrontpage) {
    renderFrontpage(frontpage, events, grouped);
    renderInfographic(frontpage.lead || events[0]);
  } else {
    renderEmptyFrontpage(frontpageState.emptyMessage);
  }
}

function renderKnowledgeHealth(health) {
  state.knowledgeHealth = health || null;
  if (!health) {
    els.knowledgeHealth.innerHTML = `<p class="muted">暂无体检数据。</p>`;
    return;
  }
  const metrics = health.metrics || {};
  const queues = health.queues || {};
  const queueCounts = health.queueCounts || {};
  const needs = queues.needsEvidence || [];
  els.knowledgeHealth.innerHTML = `<div class="health-grid">
      <div><b>${Number(metrics.total || 0)}</b><span>入库事件</span></div>
      <div><b>${Number(metrics.lowConfidence || 0)}</b><span>低置信</span></div>
      <div><b>${Number(metrics.singleSource || 0)}</b><span>单来源</span></div>
      <div><b>${Number(metrics.capped || 0)}</b><span>封顶/示例</span></div>
    </div>
    ${healthQueue("优先补来源", needs, Number(queueCounts.needsEvidence ?? needs.length), "低置信且单来源，或存在封顶/示例标记。", "暂无优先补来源项。")}`;
  for (const item of els.knowledgeHealth.querySelectorAll("[data-health-event-id]")) {
    item.addEventListener("click", () => selectEvent(item.dataset.healthEventId));
  }
}

function healthQueue(title, events, total, description, emptyText) {
  const items = (events || []).slice(0, 3);
  return `<div class="health-queue">
    <div class="health-title"><strong>${escapeHtml(title)}</strong><span>${total} 条</span></div>
    <p class="health-desc">${escapeHtml(description)}</p>
    ${
      items.length
        ? items
            .map(
              (event) => `<button data-health-event-id="${escapeAttr(event.id)}">
                <span>${escapeHtml(event.title)}</span>
                <em>${escapeHtml(event.radar_level || "D")}${scoreValue(event)} · ${escapeHtml(confidenceLabel(event.confidence))}</em>
              </button>`
            )
            .join("")
        : `<p class="muted">${escapeHtml(emptyText)}</p>`
    }
  </div>`;
}

async function getStaticEvent(id) {
  const key = String(id || "");
  const indexed = state.staticEventIndex.get(key) || state.events.find((event) => event.id === key);
  if (indexed) return indexed;
  const events = await ensureStaticAllEvents();
  return state.staticEventIndex.get(key) || events.find((event) => event.id === key);
}

function filterStaticEvents(events, params, options = {}) {
  const limit = options.limit === undefined ? 80 : options.limit;
  const filtered = (events || []).filter((event) => {
    const q = String(params.get("q") || "").trim();
    if (q && !eventMatchesQuery(event, q)) return false;
    if (params.get("category") && event.category !== params.get("category")) return false;
    if (params.get("source") && !(event.sources || []).some((source) => source.source === params.get("source"))) return false;
    if (params.get("tag") && !(event.tags || []).some((tag) => includesText(tag, params.get("tag")))) return false;
    if (params.get("entity") && !entityNames(event).some((name) => includesText(name, params.get("entity")))) return false;
    if (params.get("favorite") === "true" && !hasFeedback(event, "favorite")) return false;
    if (params.get("follow") === "true" && !hasFeedback(event, "follow")) return false;
    if (params.get("ignored") === "true" && !hasFeedback(event, "ignore")) return false;
    return true;
  });
  return limit === null ? filtered : filtered.slice(0, limit);
}

async function timelineFromStatic(query) {
  const events = await ensureStaticAllEvents();
  return filterStaticEvents(events, new URLSearchParams({ q: query }), { limit: null })
    .slice()
    .sort((left, right) => new Date(left.first_seen_at || left.last_seen_at || 0) - new Date(right.first_seen_at || right.last_seen_at || 0))
    .slice(-20);
}

function eventMatchesQuery(event, query) {
  const haystack = [
    event.title,
    event.summary,
    event.push_reason,
    event.what_happened,
    event.why_it_matters,
    event.content_angle,
    ...(event.tags || []),
    ...entityNames(event),
    ...(event.sources || []).flatMap((source) => [source.source, source.title, source.url])
  ].join(" ");
  return includesText(haystack, query);
}

function includesText(value, query) {
  return String(value || "").toLowerCase().includes(String(query || "").toLowerCase());
}

function entityNames(event) {
  return (event.entities || []).map(entityName).filter(Boolean);
}

function entityName(entity) {
  return typeof entity === "string" ? entity : entity?.name;
}

function hasFeedback(event, type) {
  return feedbackSet(event).has(type);
}

function feedbackSet(event) {
  const feedback = new Set(event?.feedback || []);
  if (state.readOnly && event?.id) {
    const overrides = state.staticFeedback[String(event.id)] || {};
    for (const type of STATIC_FEEDBACK_TYPES) {
      if (overrides[type] === true) feedback.add(type);
      if (overrides[type] === false) feedback.delete(type);
    }
  }
  return feedback;
}

function buildStaticMetrics(events, reports) {
  const grouped = groupBySection(events);
  return {
    recentEvents: events.length,
    important: events.filter((event) => scoreValue(event) >= 70).length,
    following: events.filter((event) => hasFeedback(event, "follow")).length,
    reports: reports.length,
    mustRead: grouped.must_read.length,
    developing: grouped.developing.length,
    background: grouped.background.length,
    highConfidence: events.filter((event) => event.confidence === "high").length
  };
}

function buildStaticFacets(events) {
  const sources = new Set();
  const tags = new Set();
  const entities = new Map();
  for (const event of events || []) {
    for (const source of event.sources || []) {
      if (source.source) sources.add(source.source);
    }
    for (const tag of event.tags || []) {
      if (tag) tags.add(tag);
    }
    for (const entity of event.entities || []) {
      const name = entityName(entity);
      if (name) entities.set(name, entity && typeof entity === "object" ? entity : { name });
    }
  }
  return {
    sources: [...sources].sort(),
    tags: [...tags].sort(),
    entities: [...entities.values()].sort((left, right) => String(left.name).localeCompare(String(right.name), "zh-CN")),
    categories: [...new Set((events || []).map((event) => event.category).filter(Boolean))].sort()
  };
}

function buildStaticKnowledgeHealth(events) {
  const needsEvidence = (events || []).filter((event) => event.confidence === "low" || (event.sources || []).length <= 1 || (event.caps || []).length);
  return {
    metrics: {
      total: events.length,
      lowConfidence: events.filter((event) => event.confidence === "low").length,
      singleSource: events.filter((event) => (event.sources || []).length <= 1).length,
      capped: events.filter((event) => (event.caps || []).length).length
    },
    queueCounts: {
      needsEvidence: needsEvidence.length
    },
    queues: {
      needsEvidence: needsEvidence.slice(0, 6)
    }
  };
}

async function search() {
  try {
    updateFilterSummary();
    setLoading("正在搜索...");
    const params = new URLSearchParams();
    const q = els.query.value.trim();
    if (q) params.set("q", q);
    for (const key of ["category", "source", "entity", "tag"]) {
      const value = els[key].value.trim();
      if (value) params.set(key, value);
    }
    if (els.favorite.checked) params.set("favorite", "true");
    if (els.follow.checked) params.set("follow", "true");
    if (els.ignored.checked) params.set("ignored", "true");

    if (state.readOnly) {
      const events = filterStaticEvents(await ensureStaticAllEvents(), params);
      renderResults(events, params.toString() ? "搜索结果" : "最近 7 天重要事件", params.toString() ? "search" : "list");
      return;
    }

    const endpoint = params.toString() ? `/api/search?${params.toString()}` : "/api/events/recent?days=7";
    const data = await fetchJson(endpoint);
    renderResults(data.events || [], params.toString() ? "搜索结果" : "最近 7 天重要事件", params.toString() ? "search" : "list");
  } catch (error) {
    renderError(error);
  }
}

function updateFilterSummary() {
  els.filterSummary.textContent = summarizeActiveFilters({
    category: els.category.value,
    source: els.source.value,
    entity: els.entity.value,
    tag: els.tag.value,
    favorite: els.favorite.checked,
    follow: els.follow.checked,
    ignored: els.ignored.checked
  });
}

async function loadTimeline() {
  const q = els.timelineQuery.value.trim();
  if (!q) {
    els.timeline.innerHTML = `<p class="muted">输入一个品牌、平台或话题。</p>`;
    return;
  }
  els.timeline.innerHTML = `<p class="muted">正在生成时间线...</p>`;
  try {
    const data = state.readOnly ? { events: await timelineFromStatic(q) } : await fetchJson(`/api/timeline?q=${encodeURIComponent(q)}`);
    const events = data.events || [];
    els.timeline.innerHTML = events.length
      ? events
          .map(
            (event) => `<article class="timeline-item">
              <time>${escapeHtml(formatDateTime(event.first_seen_at))}</time>
              <strong>${escapeHtml(event.title)}</strong>
              <p>${escapeHtml(event.summary)}</p>
            </article>`
          )
          .join("")
      : `<p class="muted">暂无时间线。</p>`;
  } catch (error) {
    els.timeline.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

function setLoading(message) {
  els.count.textContent = "";
  els.sections.innerHTML = "";
  els.results.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderError(error) {
  renderEmptyFrontpage("情报头版暂不可用。请确认数据已发布或本地服务正在运行。");
  els.results.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(error.message)}</div>`;
  renderEmptyDetail();
}

function renderEmptyDetail() {
  els.detail.innerHTML = `<h2>知识卡</h2><p class="muted">选择事件后显示详情。</p>`;
}

function categoryLabel(category) {
  return {
    digital: "数码",
    media: "自媒体",
    auto: "汽车",
    mixed: "跨行业",
    unknown: "其他"
  }[category] || category || "其他";
}

function groupBySection(events) {
  const grouped = {
    must_read: [],
    developing: [],
    video_ready: [],
    background: []
  };
  for (const event of events) {
    const section = grouped[event.radar_section] ? event.radar_section : fallbackSection(event);
    if (section === "video_ready") {
      grouped.developing.push(event);
      continue;
    }
    grouped[section].push(event);
  }
  return grouped;
}

function fallbackSection(event) {
  const score = scoreValue(event);
  const confidence = event.confidence || "low";
  const freshness = event.freshness_label || "unknown";
  if (score >= 75) return "must_read";
  if ((freshness === "stale" || freshness === "unknown") && (score < 55 || confidence === "low")) return "background";
  if (score >= 58) return "developing";
  return "background";
}

function freshnessLabel(label) {
  return {
    new: "新信息",
    recent: "近 7 天",
    stale: "旧闻/背景",
    unknown: "时间不明"
  }[label] || "时间不明";
}

function confidenceLabel(label) {
  return {
    high: "高置信",
    medium: "中置信",
    low: "低置信"
  }[label] || "低置信";
}

function renderSourceLinks(sources, limit = 8) {
  const visible = (sources || []).slice(0, limit);
  if (!visible.length) return `<p class="muted">暂无来源链接</p>`;
  return visible
    .map((source, index) => {
      const url = safeUrl(source.url);
      const label = sourceLabel(source, index, sources);
      const title = source.title || "原始页面";
      if (url === "#") {
        return `<div class="source-card">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(title)}</span>
          <code>${escapeHtml(source.url || "无可用地址")}</code>
        </div>`;
      }
      return `<a class="source-card" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(title)}</span>
        <code>${escapeHtml(url)}</code>
      </a>`;
    })
    .join("");
}

function renderCompactSourceLinks(sources, limit = 3) {
  const visible = (sources || []).slice(0, limit);
  if (!visible.length) return "";
  return visible
    .map((source, index) => {
      const url = safeUrl(source.url);
      const label = sourceLabel(source, index, sources);
      const host = sourceHost(url);
      const title = `${label}${source.title ? ` · ${source.title}` : ""}${url !== "#" ? ` · ${url}` : ""}`;
      const inner = `<strong>${escapeHtml(label)}</strong><span>· ${escapeHtml(host)}</span>`;
      if (url === "#") {
        return `<div class="source-chip" title="${escapeAttr(title)}">${inner}</div>`;
      }
      return `<a class="source-chip" href="${escapeAttr(url)}" target="_blank" rel="noreferrer" title="${escapeAttr(title)}">${inner}</a>`;
    })
    .join("");
}

function sourceLabel(source, index, sources) {
  const same = (sources || []).filter((item) => item.source === source.source).length;
  if (same <= 1) return source.source || "来源";
  const ordinal = (sources || []).slice(0, index + 1).filter((item) => item.source === source.source).length;
  return `${source.source || "来源"} ${ordinal}`;
}

function sourceHost(url) {
  if (!url || url === "#") return "无可用地址";
  if (url.startsWith("/") && !url.startsWith("//")) return "本地报告";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "来源页面";
  }
}

function countBy(items, predicate) {
  return items.filter(predicate).length;
}

function scoreValue(event) {
  return Number(event.radar_score ?? event.importance_score ?? 0);
}

function reportLabel(type) {
  return {
    morning: "早间报告",
    noon: "中午报告",
    night: "晚间报告",
    weekly: "周报",
    monthly: "月报"
  }[type] || type || "报告";
}

function formatDateTime(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFullDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "未知时间");
  return date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function safeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "#";
  if (raw === "#") return "#";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

els.searchBtn.addEventListener("click", search);
els.timelineBtn.addEventListener("click", loadTimeline);
els.hotspotRefreshBtn.addEventListener("click", startHotspotRefresh);
enableRootScrollFallback();

for (const input of [els.query, els.entity, els.tag, els.timelineQuery]) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (input === els.timelineQuery) loadTimeline();
      else search();
    }
  });
}

for (const input of [els.category, els.source, els.favorite, els.follow, els.ignored]) {
  input.addEventListener("change", search);
}

for (const input of [els.category, els.source, els.entity, els.tag, els.favorite, els.follow, els.ignored]) {
  input.addEventListener("input", updateFilterSummary);
}

els.detail.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-feedback]");
  if (!(button instanceof HTMLButtonElement) || !els.detail.contains(button)) return;
  toggleFeedback(els.detail.dataset.eventId || state.selectedId, button);
});

bootstrap();
