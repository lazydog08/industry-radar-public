import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("static export filters already-stored public noise events", () => {
  const source = fs.readFileSync("src/export/site.ts", "utf8");

  assert.match(source, /import \{ isNoiseContent \} from "\.\.\/scoring\/keywords\.js"/);
  assert.match(source, /filter\(isPublicEventAllowed\)/);
  assert.match(source, /isNoiseContent\(event\.title\)/);
  assert.match(source, /filterPublicKnowledgeHealth/);
});
