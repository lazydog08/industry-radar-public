import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("public export sanitizes legacy video-potential copy", () => {
  const source = fs.readFileSync("src/export/site.ts", "utf8");

  assert.match(source, /cleanPublicCopy/);
  assert.match(source, /具备视频选题潜力/);
  assert.match(source, /视频潜力决定是否推到首页/);
});
