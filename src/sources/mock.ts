import fs from "node:fs";
import path from "node:path";
import type { SourceAdapter, SourceContext, SourceFetchResult, SourceItem } from "../types.js";
import { makeId } from "../utils/ids.js";
import { nowIso, makeShanghaiIso } from "../utils/time.js";

interface MockRawItem {
  reportTypes: string[];
  source: string;
  title: string;
  url: string;
  author?: string;
  category: SourceItem["category"];
  tags: string[];
  summaryRaw?: string;
  heatScore?: number;
  publishedTime: string;
}

export const mockSource: SourceAdapter = {
  name: "mock",
  async fetch(ctx: SourceContext): Promise<SourceFetchResult> {
    const startedAt = nowIso();
    const file = path.resolve(process.cwd(), "data/sample/mock-source-items.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as MockRawItem[];
    const items = raw
      .filter((item) => item.reportTypes.includes(ctx.window.type))
      .map((item) => {
        const publishedAt = makeShanghaiIso(ctx.window.date, item.publishedTime);
        return {
          id: makeId("mock", `${item.source}:${item.url}:${ctx.window.date}`),
          source: item.source,
          title: item.title,
          url: item.url,
          publishedAt,
          fetchedAt: publishedAt,
          author: item.author,
          category: item.category,
          tags: item.tags,
          summaryRaw: item.summaryRaw,
          heatScore: item.heatScore,
          engagement: { heatText: `mock heat ${item.heatScore || 0}` },
          raw: item
        } satisfies SourceItem;
      });
    return {
      source: "mock",
      ok: true,
      items,
      startedAt,
      endedAt: nowIso(),
      meta: { mode: "sample/mock" }
    };
  }
};
