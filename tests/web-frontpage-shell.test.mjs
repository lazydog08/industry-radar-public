import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync("src/web/index.html", "utf8");
const appJs = fs.readFileSync("src/web/app.js", "utf8");
const css = fs.readFileSync("src/web/styles.css", "utf8");

test("places the search controls in the frontpage briefing rail", () => {
  const frontpageBrief = html.match(/<aside class="frontpage-brief">([\s\S]*?)<\/aside>/)?.[1] || "";
  assert.match(frontpageBrief, /class="filters compact frontpage-search"/);
  assert.doesNotMatch(html, /<\/section>\s*<section class="filters compact"/);
});

test("keeps lead story source links out of a button-like container", () => {
  assert.doesNotMatch(appJs, /els\.frontpageLead\.setAttribute\("role",\s*"button"\)/);
  assert.doesNotMatch(appJs, /els\.frontpageLead\.setAttribute\("tabindex",\s*"0"\)/);
  assert.doesNotMatch(appJs, /els\.frontpageLead\.dataset\.eventId\s*=/);
  assert.match(appJs, /class="event-select-button"/);
  assert.doesNotMatch(css.match(/\.frontpage-lead \{[\s\S]*?\}/)?.[0] || "", /cursor:\s*pointer/);
});

test("makes regular event cards keyboard selectable", () => {
  assert.match(appJs, /<article class="event-card\$\{selected\}" data-event-id="\$\{escapeAttr\(event\.id\)\}" role="button" tabindex="0">/);
});

test("uses explicit frontpage modes instead of result-title text", () => {
  assert.match(appJs, /function renderResults\(events, title, viewMode = "list"\)/);
  assert.doesNotMatch(appJs, /title === "搜索结果"/);
  assert.match(appJs, /renderResults\(events, params\.toString\(\) \? "搜索结果" : "最近 7 天重要事件", params\.toString\(\) \? "search" : "list"\)/);
  assert.match(appJs, /renderResults\(data\.events \|\| \[\], params\.toString\(\) \? "搜索结果" : "最近 7 天重要事件", params\.toString\(\) \? "search" : "list"\)/);
});
