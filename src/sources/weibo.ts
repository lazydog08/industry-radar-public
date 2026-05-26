import fs from "node:fs";
import path from "node:path";
import type { SourceAdapter, SourceFetchResult, SourceItem } from "../types.js";
import { fetchJson, fetchText, stripHtml } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import { detectCategory, detectTags, matchesInterest } from "../scoring/keywords.js";

interface WeiboHotResponse {
  data?: {
    realtime?: Array<{ note?: string; word?: string; num?: number; word_scheme?: string }>;
  };
  error?: string;
}

export const weiboSource: SourceAdapter = {
  name: "weibo",
  async fetch(): Promise<SourceFetchResult> {
    const startedAt = nowIso();
    const fetchedAt = nowIso();
    const warnings: string[] = [];
    const items: SourceItem[] = [];

    try {
      const json = await fetchJson<WeiboHotResponse>("https://weibo.com/ajax/side/hotSearch");
      if (json.error) throw new Error(json.error);
      for (const entry of json.data?.realtime || []) {
        const title = entry.note || entry.word;
        if (!title) continue;
        if (!matchesInterest(title)) continue;
        const category = detectCategory(title);
        items.push({
          id: makeId("weibo", title),
          source: "weibo",
          title,
          url: entry.word_scheme || `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
          publishedAt: fetchedAt,
          fetchedAt,
          author: "微博热搜",
          category,
          tags: detectTags(title, category),
          summaryRaw: title,
          heatScore: entry.num ? Math.round(Math.log10(entry.num + 10) * 12) : 0,
          engagement: { heatText: entry.num ? String(entry.num) : undefined },
          raw: entry
        });
      }
    } catch (error) {
      warnings.push(`微博 ajax 热搜不可用：${error instanceof Error ? error.message : String(error)}`);
    }

    if (items.length === 0) {
      try {
        const accountConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "config/accounts.json"), "utf8")) as {
          keywords?: Record<string, string[]>;
        };
        const keywords = Object.values(accountConfig.keywords || {})
          .flat()
          .slice(0, 3);
        for (const keyword of keywords) {
          const html = await fetchText(`https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`);
          if (/Sina Visitor System|passport\.weibo|Forbidden|验证码/.test(html)) {
            throw new Error("公开搜索页返回访客/风控页面");
          }
          const title = stripHtml(html).slice(0, 80);
          if (!matchesInterest(title)) continue;
          const category = detectCategory(title);
          items.push({
            id: makeId("weibo", `${keyword}:${title}`),
            source: "weibo",
            title,
            url: `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`,
            publishedAt: fetchedAt,
            fetchedAt,
            author: "微博公开搜索",
            category,
            tags: detectTags(title, category),
            summaryRaw: title,
            heatScore: 0,
            engagement: {},
            raw: { keyword }
          });
        }
      } catch (error) {
        warnings.push(`微博公开搜索降级失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      source: "weibo",
      ok: items.length > 0,
      items: items.slice(0, 40),
      startedAt,
      endedAt: nowIso(),
      error: items.length === 0 ? "微博源暂不可用；未使用登录、Cookie 或验证码绕过。" : undefined,
      warnings
    };
  }
};
