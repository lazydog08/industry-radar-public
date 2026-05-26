import type { SourceAdapter, SourceContext, SourceFetchResult, SourceItem } from "../types.js";
import { fetchJson } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import { detectCategory, detectTags, matchesInterest } from "../scoring/keywords.js";

interface ZhihuHotResponse {
  data?: Array<{
    target?: {
      id?: number | string;
      title?: string;
      excerpt?: string;
      url?: string;
      question?: { title?: string; url?: string; id?: number | string };
    };
    detail_text?: string;
  }>;
  error?: { code?: number; message?: string; name?: string };
}

export const zhihuSource: SourceAdapter = {
  name: "zhihu",
  async fetch(): Promise<SourceFetchResult> {
    const startedAt = nowIso();
    const fetchedAt = nowIso();
    try {
      const url = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true";
      const json = await fetchJson<ZhihuHotResponse>(url);
      if (json.error) {
        throw new Error(`${json.error.name || "ZhihuError"} ${json.error.code || ""}: ${json.error.message || ""}`.trim());
      }
      const items = (json.data || [])
        .map((entry): SourceItem | null => {
          const target = entry.target;
          const title = target?.title || target?.question?.title;
          const questionUrl = target?.question?.url || target?.url;
          const id = target?.question?.id || target?.id || title;
          if (!title) return null;
          const text = `${title} ${target?.excerpt || ""}`;
          if (!matchesInterest(text)) return null;
          const category = detectCategory(text);
          const pageUrl = questionUrl?.startsWith("http")
            ? questionUrl
            : `https://www.zhihu.com/question/${id}`;
          return {
            id: makeId("zhihu", `${id}:${title}`),
            source: "zhihu",
            title,
            url: pageUrl,
            publishedAt: fetchedAt,
            fetchedAt,
            author: "知乎热榜",
            category,
            tags: detectTags(text, category),
            summaryRaw: target?.excerpt || entry.detail_text,
            heatScore: parseHeat(entry.detail_text),
            engagement: { heatText: entry.detail_text },
            raw: entry
          };
        })
        .filter((item): item is SourceItem => Boolean(item));
      return { source: "zhihu", ok: true, items, startedAt, endedAt: nowIso() };
    } catch (error) {
      return {
        source: "zhihu",
        ok: false,
        items: [],
        startedAt,
        endedAt: nowIso(),
        error: `公开热榜访问失败：${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

function parseHeat(input?: string): number {
  if (!input) return 0;
  const match = input.match(/([\d.]+)\s*万/);
  if (match?.[1]) return Math.round(Number.parseFloat(match[1]) * 10);
  const number = input.match(/\d+/);
  return number ? Number.parseInt(number[0], 10) : 0;
}
