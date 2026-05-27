import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("public export sanitizes legacy video-potential copy", () => {
  const script = `
    import { cleanPublicCopy } from "./src/export/site.ts";

    const samples = [
      cleanPublicCopy("与你关注高度相关；具备视频选题潜力；来源交叉验证较强"),
      cleanPublicCopy("这条信息会先进入雷达评分，再按新鲜度、趋势扩散、可信度和视频潜力决定是否推到首页。"),
      cleanPublicCopy("视频潜力决定是否推到首页")
    ];

    console.log(JSON.stringify(samples));
  `;
  const [pushReason, knowledgeSummary, directPhrase] = JSON.parse(
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" })
  );

  assert.equal(pushReason, "与你关注高度相关；来源交叉验证较强");
  assert.equal(knowledgeSummary, "这条信息会先进入雷达评分，再按新鲜度、趋势扩散和可信度决定是否推到首页。");
  assert.equal(directPhrase, "内容价值决定是否推到首页");
  assert.doesNotMatch(JSON.stringify([pushReason, knowledgeSummary, directPhrase]), /视频潜力|视频选题潜力/);
});
