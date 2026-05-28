import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("serves every root-level module imported by the web app", () => {
  const appJs = fs.readFileSync("src/web/app.js", "utf8");
  const serverTs = fs.readFileSync("src/server.ts", "utf8");
  const importedModules = [...appJs.matchAll(/from\s+["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]);

  assert.deepEqual(importedModules.sort(), ["editorial-frontpage.js", "filter-summary.js"]);

  for (const fileName of importedModules) {
    assert.match(serverTs, new RegExp(`app\\.get\\(["']/${fileName.replace(".", "\\.")}["']`));
  }
});

test("serves local shell assets without browser cache for NAS controls", () => {
  const serverTs = fs.readFileSync("src/server.ts", "utf8");

  assert.match(serverTs, /app\.get\("\/", \(_req, res\) => \{\s*res\.setHeader\("Cache-Control", "no-store"\);/);
  assert.match(serverTs, /app\.get\("\/app\.js", \(_req, res\) => \{[\s\S]*?res\.setHeader\("Cache-Control", "no-store"\);/);
  assert.match(serverTs, /app\.get\("\/styles\.css", \(_req, res\) => \{\s*res\.setHeader\("Cache-Control", "no-store"\);/);
  assert.match(serverTs, /app\.get\("\/filter-summary\.js", \(_req, res\) => \{[\s\S]*?res\.setHeader\("Cache-Control", "no-store"\);/);
  assert.match(serverTs, /app\.get\("\/editorial-frontpage\.js", \(_req, res\) => \{[\s\S]*?res\.setHeader\("Cache-Control", "no-store"\);/);
});
