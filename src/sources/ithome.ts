import { XMLParser } from "fast-xml-parser";
import type { SourceAdapter, SourceContext, SourceFetchResult, SourceItem } from "../types.js";
import { fetchText, stripHtml } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso, toShanghaiIso } from "../utils/time.js";
import { detectCategory, detectTags, matchesInterest } from "../scoring/keywords.js";

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  author?: string;
}

export const ithomeSource: SourceAdapter = {
  name: "ithome",
  async fetch(ctx: SourceContext): Promise<SourceFetchResult> {
    const startedAt = nowIso();
    try {
      const xml = await fetchText("https://www.ithome.com/rss/");
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem[] | RssItem } } };
      const rawItems = parsed.rss?.channel?.item;
      const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      const fetchedAt = nowIso();
      const items = list
        .map((entry): SourceItem | null => {
          if (!entry.title || !entry.link) return null;
          const summary = stripHtml(entry.description || "");
          const text = `${entry.title} ${summary}`;
          if (!matchesInterest(text)) return null;
          const category = detectCategory(text);
          const publishedAt = entry.pubDate ? toShanghaiIso(new Date(entry.pubDate)) : fetchedAt;
          return {
            id: makeId("ithome", `${entry.link}:${entry.title}`),
            source: "ithome",
            title: stripHtml(entry.title),
            url: entry.link,
            publishedAt,
            fetchedAt,
            author: entry.author || "IT之家",
            category,
            tags: detectTags(text, category),
            summaryRaw: summary,
            heatScore: 0,
            engagement: {},
            raw: entry
          };
        })
        .filter((item): item is SourceItem => Boolean(item))
        .slice(0, 80);
      return { source: "ithome", ok: true, items, startedAt, endedAt: nowIso() };
    } catch (error) {
      return {
        source: "ithome",
        ok: false,
        items: [],
        startedAt,
        endedAt: nowIso(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
