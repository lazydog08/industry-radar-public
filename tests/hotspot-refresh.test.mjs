import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

function runTs(script) {
  return JSON.parse(
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      encoding: "utf8"
    })
  );
}

test("hotspot refresh controller runs the NAS update script once and reports completion", () => {
  const result = runTs(`
import { EventEmitter } from "node:events";
import { createHotspotRefreshController, pickHotspotRunType } from "./src/hotspots/refresh.ts";

const spawned = [];
const fakeSpawn = (command, args, options) => {
  spawned.push({ command, args, cwd: options.cwd, trigger: options.env.HOTSPOT_REFRESH_TRIGGER });
  const child = new EventEmitter();
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.kill = () => {};
  queueMicrotask(() => {
    child.stdout.emit("data", "START generate report\\nDONE export static data\\n");
    child.emit("close", 0);
  });
  return child;
};

const controller = createHotspotRefreshController({
  rootDir: "/tmp/industry-radar",
  now: () => new Date("2026-05-28T12:20:00+08:00"),
  spawn: fakeSpawn
});

const first = controller.start();
const duplicate = controller.start();
await new Promise((resolve) => setImmediate(resolve));

console.log(JSON.stringify({
  morning: pickHotspotRunType(new Date("2026-05-28T02:20:00.000Z")),
  noon: pickHotspotRunType(new Date("2026-05-28T05:20:00.000Z")),
  night: pickHotspotRunType(new Date("2026-05-28T12:20:00.000Z")),
  first,
  duplicate,
  status: controller.getStatus(),
  spawned
}));
`);

  assert.equal(result.morning, "morning");
  assert.equal(result.noon, "noon");
  assert.equal(result.night, "night");
  assert.equal(result.first.started, true);
  assert.equal(result.duplicate.started, false);
  assert.equal(result.status.status, "success");
  assert.equal(result.status.exitCode, 0);
  assert.deepEqual(result.status.logTail, ["START generate report", "DONE export static data"]);
  assert.deepEqual(result.spawned, [
    {
      command: "bash",
      args: ["scripts/nas-daily-update.sh", "noon"],
      cwd: "/tmp/industry-radar",
      trigger: "web"
    }
  ]);
});

test("hotspot refresh controller can send the refresh command to NAS over SSH", () => {
  const result = runTs(`
import { EventEmitter } from "node:events";
import { createHotspotRefreshController } from "./src/hotspots/refresh.ts";

const spawned = [];
const fakeSpawn = (command, args, options) => {
  spawned.push({ command, args, cwd: options.cwd, trigger: options.env.HOTSPOT_REFRESH_TRIGGER });
  const child = new EventEmitter();
  child.pid = 9876;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.kill = () => {};
  queueMicrotask(() => {
    child.stdout.emit("data", "NAS update success: type=night\\n");
    child.emit("close", 0);
  });
  return child;
};

const controller = createHotspotRefreshController({
  rootDir: "/tmp/local-copy",
  env: {
    NAS_REFRESH_MODE: "ssh",
    NAS_REFRESH_SSH_HOST: "192.168.31.50",
    NAS_REFRESH_SSH_USER: "lazydog",
    NAS_REFRESH_SSH_PORT: "2222",
    NAS_REFRESH_APP_DIR: "/mnt/user data/shares/industry-radar",
    NAS_REFRESH_CONNECT_TIMEOUT: "6"
  },
  now: () => new Date("2026-05-28T19:20:00+08:00"),
  spawn: fakeSpawn
});

const started = controller.start({ runType: "night" });
await new Promise((resolve) => setImmediate(resolve));

console.log(JSON.stringify({
  started,
  status: controller.getStatus(),
  spawned
}));
`);

  assert.equal(result.started.started, true);
  assert.equal(result.started.job.target, "nas-ssh");
  assert.equal(result.status.status, "success");
  assert.deepEqual(result.status.logTail, ["NAS update success: type=night"]);
  assert.deepEqual(result.spawned, [
    {
      command: "ssh",
      args: [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=6",
        "-p",
        "2222",
        "lazydog@192.168.31.50",
        "cd '/mnt/user data/shares/industry-radar' && /bin/bash scripts/nas-daily-update.sh night"
      ],
      cwd: "/tmp/local-copy",
      trigger: "web"
    }
  ]);
});

test("hotspot refresh controller reads NAS SSH settings from process env by default", () => {
  const result = runTs(`
import { EventEmitter } from "node:events";
import { createHotspotRefreshController } from "./src/hotspots/refresh.ts";

process.env.NAS_REFRESH_MODE = "ssh";
process.env.NAS_REFRESH_SSH_HOST = "192.168.31.50";
process.env.NAS_REFRESH_SSH_USER = "admin";
process.env.NAS_REFRESH_SSH_PORT = "22";
process.env.NAS_REFRESH_APP_DIR = "/volume1/industry-radar";

const spawned = [];
const fakeSpawn = (command, args, options) => {
  spawned.push({ command, args, cwd: options.cwd });
  const child = new EventEmitter();
  child.pid = 2468;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.kill = () => {};
  queueMicrotask(() => child.emit("close", 0));
  return child;
};

const controller = createHotspotRefreshController({
  rootDir: "/tmp/local-copy",
  now: () => new Date("2026-05-28T19:20:00+08:00"),
  spawn: fakeSpawn
});

const started = controller.start({ runType: "night" });
await new Promise((resolve) => setImmediate(resolve));

console.log(JSON.stringify({
  started,
  status: controller.getStatus(),
  spawned
}));
`);

  assert.equal(result.started.started, true);
  assert.equal(result.started.job.target, "nas-ssh");
  assert.equal(result.status.status, "success");
  assert.equal(result.spawned[0].command, "ssh");
  assert.deepEqual(result.spawned[0].args.slice(-2), [
    "admin@192.168.31.50",
    "cd /volume1/industry-radar && /bin/bash scripts/nas-daily-update.sh night"
  ]);
});

test("web shell exposes a prominent hotspot refresh action", () => {
  const html = fs.readFileSync("src/web/index.html", "utf8");
  const appJs = fs.readFileSync("src/web/app.js", "utf8");
  const css = fs.readFileSync("src/web/styles.css", "utf8");
  const serverTs = fs.readFileSync("src/server.ts", "utf8");

  assert.match(html, /id="hotspotRefreshBtn"/);
  assert.match(html, /发送 NAS 抓取命令/);
  assert.match(html, /id="hotspotStatus"/);
  assert.match(css, /\.hotspot-refresh-button/);
  assert.match(css, /--hotspot/);
  assert.match(appJs, /startHotspotRefresh/);
  assert.match(appJs, /\/api\/hotspots\/refresh/);
  assert.match(appJs, /公开页只读/);
  assert.match(serverTs, /app\.post\("\/api\/hotspots\/refresh"/);
  assert.match(serverTs, /app\.get\("\/api\/hotspots\/refresh"/);
});

test("web app prefers the local API before static data so NAS controls stay enabled", () => {
  const appJs = fs.readFileSync("src/web/app.js", "utf8");

  assert.match(appJs, /async function tryLoadApiOverview\(\)/);
  assert.match(appJs, /const apiOverview = await tryLoadApiOverview\(\);/);
  assert.match(appJs, /if \(apiOverview\) return apiOverview;/);
  assert.match(appJs, /const staticError = await tryLoadStaticOverview\(\);/);
});

test("web app keeps NAS command availability independent from static overview data", () => {
  const appJs = fs.readFileSync("src/web/app.js", "utf8");

  assert.doesNotMatch(appJs, /const isStatic = status === "static" \|\| state\.readOnly;/);
  assert.match(appJs, /const isStatic = status === "static";/);
  assert.match(appJs, /function isLocalOrigin\(\)/);
  assert.match(appJs, /\^127\\\./);
  assert.match(appJs, /\^192\\\.168\\\./);
  assert.match(appJs, /\^10\\\./);
  assert.match(appJs, /\^172\\\.\(1\[6-9\]\|2\\d\|3\[01\]\)\\\./);
  assert.doesNotMatch(appJs, /async function syncHotspotRefreshStatus\(\) \{\s*clearHotspotPollTimer\(\);\s*if \(state\.readOnly\) \{[\s\S]*?renderHotspotRefreshStatus\(\{ status: "static" \}\);[\s\S]*?return;[\s\S]*?\}\s*try \{/);
  assert.doesNotMatch(appJs, /async function startHotspotRefresh\(\) \{\s*if \(state\.readOnly\) \{[\s\S]*?renderHotspotRefreshStatus\(\{ status: "static" \}\);[\s\S]*?return;[\s\S]*?\}/);
  assert.doesNotMatch(appJs, /async function pollHotspotRefreshStatus\(\) \{\s*if \(state\.readOnly\) \{[\s\S]*?renderHotspotRefreshStatus\(\{ status: "static" \}\);[\s\S]*?return;[\s\S]*?\}/);
  assert.match(appJs, /catch \(error\) \{\s*if \(state\.readOnly && !isLocalOrigin\(\)\) \{\s*renderHotspotRefreshStatus\(\{ status: "static" \}\);\s*return;\s*\}\s*renderHotspotRefreshStatus\(\{ status: "unavailable", error: error\.message \}\);/);
});
