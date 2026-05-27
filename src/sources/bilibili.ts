import type { SourceAdapter, SourceContext, SourceFetchResult, SourceItem } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.js";
import { sleep } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso, toShanghaiIso } from "../utils/time.js";
import { detectCategory, detectTags, matchesInterest } from "../scoring/keywords.js";

interface BiliRankingResponse {
  code: number;
  message: string;
  data?: {
    list?: BiliVideo[];
  };
}

interface BiliSearchResponse {
  code: number;
  message: string;
  data?: {
    result?: BiliSearchVideo[];
  };
}

interface BiliVideo {
  bvid?: string;
  title?: string;
  desc?: string;
  owner?: { name?: string };
  pubdate?: number;
  tname?: string;
  stat?: {
    view?: number;
    like?: number;
    coin?: number;
    favorite?: number;
    reply?: number;
    share?: number;
  };
}

interface BiliSearchVideo {
  bvid?: string;
  title?: string;
  description?: string;
  author?: string;
  pubdate?: number;
  tag?: string;
  play?: number;
  like?: number;
  favorites?: number;
  review?: number;
}

const endpoints = [
  { url: "https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1", label: "热门" },
  { url: "https://api.bilibili.com/x/web-interface/ranking/v2?rid=188&type=all", label: "科技分区排行" }
];

export const bilibiliSource: SourceAdapter = {
  name: "bilibili",
  async fetch(): Promise<SourceFetchResult> {
    const startedAt = nowIso();
    const fetchedAt = nowIso();
    const warnings: string[] = [];
    const items = new Map<string, SourceItem>();
    const config = loadConfig();

    for (const endpoint of endpoints) {
      try {
        const json = await fetchBiliJson<BiliRankingResponse>(endpoint.url, config.requestTimeoutMs);
        if (json.code !== 0) throw new Error(`Bilibili API ${json.code}: ${json.message}`);
        for (const video of json.data?.list || []) {
          if (!video.title || !video.bvid) continue;
          const text = `${video.title} ${video.desc || ""} ${video.tname || endpoint.label}`;
          if (!matchesInterest(text)) continue;
          const category = detectCategory(text);
          const stat = video.stat || {};
          const heatScore = Math.round(
            Math.log10((stat.view || 0) + 10) * 16 +
              Math.log10((stat.like || 0) + 10) * 8 +
              Math.log10((stat.reply || 0) + 10) * 6
          );
          upsertItem(items, {
            id: makeId("bili", video.bvid),
            source: "bilibili",
            title: video.title,
            url: `https://www.bilibili.com/video/${video.bvid}`,
            publishedAt: video.pubdate ? toShanghaiIso(new Date(video.pubdate * 1000)) : fetchedAt,
            fetchedAt,
            author: video.owner?.name,
            category,
            tags: detectTags(text, category),
            summaryRaw: video.desc,
            heatScore,
            engagement: {
              views: stat.view,
              likes: stat.like,
              coins: stat.coin,
              favorites: stat.favorite,
              replies: stat.reply,
              shares: stat.share
            },
            raw: video
          });
        }
      } catch (error) {
        warnings.push(`${endpoint.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(config.requestDelayMs);
    }

    for (const keyword of loadSearchKeywords().slice(0, 8)) {
      try {
        const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&order=pubdate&page=1&keyword=${encodeURIComponent(keyword)}`;
        const json = await fetchBiliJson<BiliSearchResponse>(url, config.requestTimeoutMs);
        if (json.code !== 0) throw new Error(`Bilibili 搜索 API ${json.code}: ${json.message}`);
        for (const video of json.data?.result || []) {
          if (!video.title || !video.bvid) continue;
          const cleanTitle = stripBiliHighlight(video.title);
          const text = `${cleanTitle} ${video.description || ""} ${video.tag || ""} ${keyword}`;
          if (!matchesInterest(text)) continue;
          const category = detectCategory(text);
          const heatScore = Math.round(
            Math.log10((video.play || 0) + 10) * 14 +
              Math.log10((video.like || 0) + 10) * 8 +
              Math.log10((video.review || 0) + 10) * 5
          );
          upsertItem(items, {
            id: makeId("bili", video.bvid),
            source: "bilibili",
            title: cleanTitle,
            url: `https://www.bilibili.com/video/${video.bvid}`,
            publishedAt: video.pubdate ? toShanghaiIso(new Date(video.pubdate * 1000)) : fetchedAt,
            fetchedAt,
            author: video.author,
            category,
            tags: detectTags(text, category),
            summaryRaw: video.description,
            heatScore,
            engagement: {
              views: video.play,
              likes: video.like,
              favorites: video.favorites,
              replies: video.review,
              heatText: `搜索：${keyword}`
            },
            raw: { ...video, keyword }
          });
        }
      } catch (error) {
        warnings.push(`搜索 ${keyword}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(config.requestDelayMs);
    }

    const list = Array.from(items.values());
    return {
      source: "bilibili",
      ok: list.length > 0,
      items: list.slice(0, 100),
      startedAt,
      endedAt: nowIso(),
      error: list.length === 0 && warnings.length > 0 ? warnings.join("; ") : undefined,
      warnings
    };
  }
};

function upsertItem(items: Map<string, SourceItem>, item: SourceItem): void {
  const existing = items.get(item.url);
  if (!existing || (item.heatScore || 0) > (existing.heatScore || 0)) {
    items.set(item.url, item);
  }
}

function stripBiliHighlight(input: string): string {
  return input.replace(/<em class="keyword">/g, "").replace(/<\/em>/g, "").replace(/\s+/g, " ").trim();
}

function loadSearchKeywords(): string[] {
  const defaults = [
    "OPPO 影像",
    "小米汽车 智驾",
    "B站 流量 规则",
    "AI 手机 发布会",
    "HarmonyOS 更新",
    "华为 半导体",
    "华为 韬定律",
    "麒麟 芯片",
    "折叠屏"
  ];
  try {
    const accountConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "config/accounts.json"), "utf8")) as {
      keywords?: Record<string, string[]>;
    };
    const configured = Object.values(accountConfig.keywords || {})
      .flat()
      .filter(Boolean);
    return Array.from(new Set([...defaults, ...configured]));
  } catch {
    return defaults;
  }
}

async function fetchBiliJson<T>(url: string, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      referer: "https://www.bilibili.com/",
      accept: "application/json,text/plain,*/*"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}
