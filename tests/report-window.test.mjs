import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runWindowFixture() {
  const script = `
    import { filterResultsToWindow } from "./src/report/generate.ts";

    const [result] = filterResultsToWindow(
      [
        {
          source: "official",
          ok: true,
          startedAt: "2026-05-27T12:00:00+08:00",
          endedAt: "2026-05-27T12:01:00+08:00",
          items: [
            {
              id: "huawei-tau",
              source: "huawei-news",
              title: "华为发表韬(τ)定律，实现晶体管密度与系统性能突破",
              url: "https://www.huawei.com/cn/news/2026/5/ieee-iscas-tau-scaling",
              publishedAt: "2026-05-25T12:00:00+08:00",
              fetchedAt: "2026-05-27T12:00:00+08:00",
              category: "digital",
              tags: ["数码", "半导体突破"],
              summaryRaw: "半导体新路径探索与实践"
            },
            {
              id: "old-review",
              source: "ithome",
              title: "某手机体验评测旧文",
              url: "https://www.ithome.com/review",
              publishedAt: "2026-05-25T12:00:00+08:00",
              fetchedAt: "2026-05-27T12:00:00+08:00",
              category: "digital",
              tags: ["数码", "影像"],
              summaryRaw: "普通评测"
            }
          ]
        }
      ],
      "2026-05-27T10:00:00+08:00",
      "2026-05-27T12:00:00+08:00"
    );

    console.log(JSON.stringify(result.items.map((item) => item.id)));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings=ExperimentalWarning" }
    })
  );
}

test("keeps recent official hard-tech items for backfill while excluding ordinary old reviews", () => {
  assert.deepEqual(runWindowFixture(), ["huawei-tau"]);
});
