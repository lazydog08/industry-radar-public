import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runKnowledgeFixture() {
  const script = `
    import { buildKnowledgeDraft } from "./src/kb/knowledge.ts";

    const draft = buildKnowledgeDraft(
      {
        id: "item-1",
        source: "huawei-news",
        title: "华为发表韬(τ)定律，实现晶体管密度与系统性能突破",
        url: "https://www.huawei.com/cn/news/2026/5/ieee-iscas-tau-scaling",
        publishedAt: "2026-05-26T17:25:00+08:00",
        fetchedAt: "2026-05-27T12:00:00+08:00",
        category: "digital",
        tags: ["数码", "半导体突破"],
        summaryRaw: "华为何庭波发表半导体新路径探索与实践"
      },
      ["数码", "半导体突破"],
      [{ name: "华为", type: "brand", aliases: [] }]
    );

    console.log(JSON.stringify(draft));
  `;
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" }));
}

test("knowledge copy does not mention video-potential judging", () => {
  const draft = runKnowledgeFixture();

  assert.doesNotMatch(JSON.stringify(draft), /视频潜力|视频选题潜力/);
});
