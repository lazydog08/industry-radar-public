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

test("GitHub Pages publisher preflights and force-adds only the configured public-data directory", () => {
  const script = fs.readFileSync("scripts/publish-github-pages.sh", "utf8");

  assert.match(script, /preflight_public_data/);
  assert.match(script, /scan_public_data_for_sensitive_content/);
  assert.doesNotMatch(script, /git add -f public-data\//);
  assert.match(script, /git add -f -- "\$PUBLIC_DATA_DIR"/);
});

test("NAS schedule docs match current UGREEN defaults", () => {
  const content = fs.readFileSync("docs/NAS_SCHEDULE.md", "utf8");

  assert.doesNotMatch(content, /\/volume1\/docker\/industry-radar/);
  assert.match(content, /默认只安装午报和晚报/);
  assert.match(content, /\/mnt\/user-data\/shares\/industry-radar/);
});
