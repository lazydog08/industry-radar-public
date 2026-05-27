import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("event source count is based on distinct source channels", () => {
  const dbSource = fs.readFileSync("src/store/db.ts", "utf8");
  const getSourceCount = dbSource.match(/private getSourceCount\(eventId: string\): number \{[\s\S]*?\n  \}/)?.[0] || "";

  assert.match(getSourceCount, /COUNT\(DISTINCT si\.source\)/);
  assert.match(getSourceCount, /JOIN source_items si ON si\.id = es\.source_item_id/);
  assert.doesNotMatch(getSourceCount, /COUNT\(DISTINCT source_item_id\)/);
});
