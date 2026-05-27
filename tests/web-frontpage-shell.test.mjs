import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync("src/web/index.html", "utf8");
const appJs = fs.readFileSync("src/web/app.js", "utf8");
const css = fs.readFileSync("src/web/styles.css", "utf8");

test("uses project-page-safe relative urls in the static shell", () => {
  assert.doesNotMatch(html, /(?:href|src)="\/(?:styles\.css|app\.js)"/);
  assert.doesNotMatch(html, /href="\/api\/reports"/);
  assert.match(html, /id="reportJsonLink" href="#"/);
  assert.match(appJs, /reportJsonLink:\s*document\.getElementById\("reportJsonLink"\)/);
  assert.match(appJs, /STATIC_OVERVIEW_CANDIDATES\s*=\s*\[[\s\S]*"\.\/public-data\/overview\.json"[\s\S]*"\/public-data\/overview\.json"[\s\S]*\]/);
  assert.match(appJs, /function staticPublicDataUrl\(value, fallback\)/);
  assert.match(appJs, /const safe = safeUrl\(value\);/);
});

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

test("opens the frontpage knowledge card by revealing the detail panel", () => {
  assert.match(appJs, /data-reveal-detail="true"/);
  assert.match(appJs, /selectEvent\(target\.dataset\.eventId,\s*\{\s*revealDetail:\s*shouldRevealDetail\(target\)\s*\}\)/);
  assert.match(appJs, /function revealDetailPanel\(\)/);
  assert.match(appJs, /els\.detail\.scrollIntoView\(/);
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

test("does not render the video-candidate frontpage surface", () => {
  assert.doesNotMatch(appJs, /可拍选题/);
  assert.doesNotMatch(appJs, /video-candidates/);
  assert.doesNotMatch(appJs, /model\.videoCandidates/);
  assert.doesNotMatch(appJs, /视频潜力/);
  assert.doesNotMatch(html, /适合做视频/);
});

test("balances editorial strips as a two-column desktop grid", () => {
  const editorialStripCss = css.match(/\.editorial-strips \{[\s\S]*?\}/)?.[0] || "";
  assert.match(editorialStripCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(editorialStripCss, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(appJs, /editorialStrip\("top-signals"/);
  assert.match(appJs, /editorialStrip\("needs-evidence"/);
  assert.doesNotMatch(appJs, /editorialStrip\("video/);
});

test("uses versioned root assets so stale video sections cannot survive browser cache", () => {
  assert.match(html, /<link[^>]+href="\.\/styles\.css\?v=\d{8}-\d{4}"[^>]*>/);
  assert.match(html, /<script type="module" src="\.\/app\.js\?v=\d{8}-\d{4}"><\/script>/);
});

test("does not expose video workflow controls in the public UI", () => {
  assert.doesNotMatch(html, /usedForVideo/);
  assert.doesNotMatch(html, />\s*已用\s*</);
  assert.doesNotMatch(appJs, /usedForVideo/);
  assert.doesNotMatch(appJs, /used_for_video/);
  assert.doesNotMatch(appJs, /已用于视频/);
  assert.doesNotMatch(appJs, /视频切入/);
});
