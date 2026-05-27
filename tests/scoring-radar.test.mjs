import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

function runRadarFixture() {
  const script = `
    import { buildRadarForEvent } from "./src/scoring/radar.ts";
    import { detectCategory, detectEntities, detectTags } from "./src/scoring/keywords.ts";

    const now = new Date("2026-05-27T12:00:00+08:00");

    function radar(title, summary, sourceNames, heatScore, extraTags = []) {
      const text = title + " " + summary;
      const category = detectCategory(text);
      const tags = Array.from(new Set([...detectTags(text, category), ...extraTags]));
      const entities = detectEntities(text);
      return buildRadarForEvent(
        {
          id: "fixture",
          title,
          canonical_title: title,
          summary,
          what_happened: summary,
          why_it_matters: "",
          creator_impact: "",
          content_angle: "",
          cover_angle: "",
          category,
          importance_score: 0,
          worth_following: 0,
          first_seen_at: "2026-05-25T12:00:00+08:00",
          last_seen_at: "2026-05-27T12:00:00+08:00",
          status: "active",
          source_count: sourceNames.length,
          created_at: "",
          updated_at: "",
          tags,
          entities,
          sources: sourceNames.map((source) => ({ source, url: "https://radar.test.invalid/" + source }))
        },
        sourceNames.map((source) => ({
          source,
          url: "https://radar.test.invalid/" + source,
          heatScore,
          publishedAt: "2026-05-25T12:00:00+08:00",
          fetchedAt: "2026-05-27T12:00:00+08:00"
        })),
        now
      );
    }

    const hardTech = radar(
      "华为发表韬(τ)定律，实现晶体管密度与系统性能突破",
      "何庭波发表半导体新路径探索与实践，提出指导半导体产业发展的新原则，基于韬定律已设计并量产381款芯片。",
      ["huawei-news", "people-tech", "weibo"],
      50
    );

    const review = radar(
      "【IT之家评测室】OPPO Reno16 Pro 体验：把实况照片玩出新高度",
      "OPPO Reno16 Pro 手机评测，影像体验和实况照片玩法。",
      ["ithome", "bilibili"],
      60
    );

    const duplicateReview = radar(
      "【IT之家评测室】OPPO Reno16 Pro 体验：把实况照片玩出新高度",
      "OPPO Reno16 Pro 手机评测，影像体验和实况照片玩法。",
      ["ithome", "ithome", "bilibili", "ithome"],
      60,
      ["发布会", "系统更新", "选题机会"]
    );

    console.log(JSON.stringify({ hardTech, review, duplicateReview }));
  `;
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" }));
}

test("ranks official hard-tech breakthroughs above review stories", () => {
  const { hardTech, review } = runRadarFixture();

  assert.equal(hardTech.radar_section, "must_read");
  assert.ok(hardTech.radar_score > review.radar_score, `${hardTech.radar_score} should outrank ${review.radar_score}`);
  assert.notEqual(review.radar_section, "must_read");
});

test("does not treat repeated same-source review links as cross-platform validation", () => {
  const { duplicateReview } = runRadarFixture();

  assert.notEqual(duplicateReview.radar_section, "must_read");
  assert.ok(duplicateReview.radar_score < 70, `duplicate review scored ${duplicateReview.radar_score}`);
});

test("official feeds include Huawei news", () => {
  const officialSource = fs.readFileSync("src/sources/official.ts", "utf8");

  assert.match(officialSource, /source:\s*"huawei-news"/);
  assert.match(officialSource, /huawei-updates\/rss/);
});
