import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FILTER_SUMMARY, summarizeActiveFilters } from "../src/web/filter-summary.js";

test("shows the default advanced filter hint when no filters are active", () => {
  assert.equal(summarizeActiveFilters({}), DEFAULT_FILTER_SUMMARY);
  assert.equal(
    summarizeActiveFilters({
      category: "",
      source: "  ",
      entity: null,
      tag: undefined,
      favorite: false,
      follow: false,
      usedForVideo: false,
      ignored: false
    }),
    DEFAULT_FILTER_SUMMARY
  );
});

test("counts active text, select, and feedback filters", () => {
  assert.equal(
    summarizeActiveFilters({
      category: "digital",
      source: "ithome",
      entity: "OPPO",
      tag: "影像",
      favorite: true,
      follow: false,
      usedForVideo: true,
      ignored: false
    }),
    "已启用 6 个筛选"
  );
});
