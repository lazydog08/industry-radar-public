import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runTs(script) {
  return JSON.parse(
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      encoding: "utf8"
    })
  );
}

test(".env.local overrides .env for local-only service settings", () => {
  const projectRoot = process.cwd();
  const result = runTs(`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "industry-radar-env-"));
fs.writeFileSync(path.join(tempDir, ".env"), "PORT=3887\\nNAS_REFRESH_MODE=local\\nNAS_REFRESH_SSH_HOST=from-env\\n");
fs.writeFileSync(path.join(tempDir, ".env.local"), "PORT=3999\\nNAS_REFRESH_MODE=ssh\\nNAS_REFRESH_SSH_HOST=192.168.31.50\\n");

delete process.env.PORT;
delete process.env.NAS_REFRESH_MODE;
delete process.env.NAS_REFRESH_SSH_HOST;

process.chdir(tempDir);
const configModuleUrl = pathToFileURL(path.join(${JSON.stringify(projectRoot)}, "src/config.ts")).href;
const { loadConfig } = await import(configModuleUrl);
const config = loadConfig();

console.log(JSON.stringify({
  port: config.port,
  mode: process.env.NAS_REFRESH_MODE,
  host: process.env.NAS_REFRESH_SSH_HOST
}));
`);

  assert.equal(result.port, 3999);
  assert.equal(result.mode, "ssh");
  assert.equal(result.host, "192.168.31.50");
});
