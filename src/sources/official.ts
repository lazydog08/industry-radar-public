import { XMLParser } from "fast-xml-parser";
import type { IndustryCategory, SourceAdapter, SourceContext, SourceFetchResult, SourceItem } from "../types.js";
import { fetchText, stripHtml } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso, toShanghaiIso } from "../utils/time.js";
import { detectCategory, detectTags, matchesInterest } from "../scoring/keywords.js";

interface OfficialFeed {
  source: string;
  label: string;
  url: string;
  categoryHint?: IndustryCategory;
}

type XmlNode = Record<string, unknown>;

const officialFeeds: OfficialFeed[] = [
  {
    source: "apple-newsroom",
    label: "Apple Newsroom",
    url: "https://www.apple.com/newsroom/rss-feed.rss",
    categoryHint: "digital"
  },
  {
    source: "android-blog",
    label: "Android Blog",
    url: "https://blog.google/products-and-platforms/platforms/android/rss/",
    categoryHint: "digital"
  }
];

export const officialSource: SourceAdapter = {
  name: "official",
  async fetch(_ctx: SourceContext): Promise<SourceFetchResult> {
    const startedAt = nowIso();
    const fetchedAt = nowIso();
    const items: SourceItem[] = [];
    const warnings: string[] = [];

    for (const feed of officialFeeds) {
      try {
        const xml = await fetchText(feed.url);
        const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as XmlNode;
        for (const entry of extractEntries(parsed)) {
          const title = cleanText(readFirst(entry.title));
          const url = readLink(entry) || readFirst(entry.guid) || readFirst(entry.id);
          if (!title || !url) continue;
          const summary = cleanText(readFirst(entry.description) || readFirst(entry.content) || readFirst(entry["content:encoded"]));
          const categories = readCategories(entry.category).join(" ");
          const text = `${title} ${summary} ${categories} ${feed.label}`;
          if (!matchesInterest(text)) continue;
          const category = feed.categoryHint && detectCategory(text) === "unknown" ? feed.categoryHint : detectCategory(text);
          const published = readFirst(entry.pubDate) || readFirst(entry.updated) || readFirst(entry.published);
          items.push({
            id: makeId(feed.source, `${url}:${title}`),
            source: feed.source,
            title,
            url,
            publishedAt: published ? toShanghaiIso(new Date(published)) : fetchedAt,
            fetchedAt,
            author: readAuthor(entry) || feed.label,
            category,
            tags: detectTags(text, category),
            summaryRaw: summary,
            heatScore: 20,
            engagement: { heatText: "official" },
            raw: entry
          });
        }
      } catch (error) {
        warnings.push(`${feed.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      source: "official",
      ok: items.length > 0,
      items: items.slice(0, 60),
      startedAt,
      endedAt: nowIso(),
      error: items.length === 0 && warnings.length ? warnings.join("; ") : undefined,
      warnings
    };
  }
};

function extractEntries(parsed: XmlNode): XmlNode[] {
  const rssChannel = asNode(asNode(parsed.rss)?.channel);
  const rssItems = rssChannel?.item;
  const atomEntries = asNode(parsed.feed)?.entry;
  return [...toArray(rssItems), ...toArray(atomEntries)].map(asNode).filter((entry): entry is XmlNode => Boolean(entry));
}

function readLink(entry: XmlNode): string {
  const link = entry.link;
  const links = toArray(link).map(asNode).filter((item): item is XmlNode => Boolean(item));
  for (const item of links) {
    const href = readFirst(item["@_href"]);
    const rel = readFirst(item["@_rel"]);
    if (href && (!rel || rel === "alternate")) return href;
  }
  if (typeof link === "string") return link;
  return "";
}

function readAuthor(entry: XmlNode): string {
  const author = asNode(entry.author);
  if (!author) return "";
  return cleanText(readFirst(author.name) || readFirst(author));
}

function readCategories(input: unknown): string[] {
  return toArray(input)
    .map((item) => {
      if (typeof item === "string") return item;
      const node = asNode(item);
      return node ? readFirst(node["@_term"]) || readFirst(node.term) : "";
    })
    .map(cleanText)
    .filter(Boolean);
}

function readFirst(input: unknown): string {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return String((value as { "#text": unknown })["#text"]);
  return "";
}

function toArray(input: unknown): unknown[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

function asNode(input: unknown): XmlNode | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as XmlNode) : null;
}

function cleanText(input: string): string {
  return stripHtml(input).replace(/\s+/g, " ").trim();
}
