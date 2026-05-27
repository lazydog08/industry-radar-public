import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("NAS setup docs use explicit Bark placeholders", () => {
  for (const fileName of ["docs/QNAP_SETUP.md", "docs/UGREEN_SETUP.md"]) {
    const content = fs.readFileSync(fileName, "utf8");

    assert.doesNotMatch(content, /BARK_KEY=你的BarkKey/);
    assert.match(content, /BARK_KEY=<YOUR_BARK_KEY>/);
  }
});

test("GitHub Pages publisher stages exported data into the Pages public-data directory", () => {
  const script = fs.readFileSync("scripts/publish-github-pages.sh", "utf8");

  assert.match(script, /preflight_public_data/);
  assert.match(script, /scan_public_data_for_sensitive_content/);
  assert.doesNotMatch(script, /git add -f public-data\//);
  assert.match(script, /readonly GITHUB_PAGES_DATA_DIR="\.\/public-data"/);
  assert.match(script, /GitHub Pages workflow copies this exact repository path/);
  assert.match(script, /stage_pages_data/);
  assert.match(script, /GITHUB_PAGES_DATA_DIR must resolve to/);
  assert.match(script, /PUBLIC_DATA_DIR is not accessible/);
  assert.match(script, /rsync is required to stage GitHub Pages data safely/);
  assert.match(script, /rsync -a --delete "\$\{PUBLIC_DATA_DIR%\/\}\/" "\$\{PAGES_STAGING_DIR%\/\}\/" \|\|/);
  assert.doesNotMatch(script, /git add -f -- "\$PUBLIC_DATA_DIR"/);
  assert.match(script, /git add -f -- "\$GITHUB_PAGES_DATA_DIR"/);
  assert.match(script, /scan_public_data_for_sensitive_content "\$PAGES_STAGING_DIR"/);
});

test("NAS daily update surfaces enabled GitHub Pages push failures", () => {
  const script = fs.readFileSync("scripts/nas-daily-update.sh", "utf8");

  assert.doesNotMatch(script, /publish-github-pages\.sh\s*\\\s*\|\| log/);
  assert.match(script, /NAS local update success but GitHub Pages push failed/);
  assert.match(script, /GITHUB_PAGES_PUSH_REQUIRED:-false/);
  assert.match(script, /notify_bark "failed"/);
  assert.match(script, /basename "\$LOG_FILE"/);
  assert.match(script, /collect stats failed; continuing to GitHub Pages push/);
});

test("NAS schedule docs match current UGREEN defaults", () => {
  const content = fs.readFileSync("docs/NAS_SCHEDULE.md", "utf8");

  assert.doesNotMatch(content, /\/volume1\/docker\/industry-radar/);
  assert.match(content, /默认只安装午报和晚报/);
  assert.match(content, /\/mnt\/user-data\/shares\/industry-radar/);
});
