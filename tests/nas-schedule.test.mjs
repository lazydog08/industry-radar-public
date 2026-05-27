import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function printCron(env = {}) {
  return execFileSync("bash", ["scripts/nas-schedule.sh", "print-cron"], {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_DIR: "/tmp/industry radar",
      NAS_LOG_DIR: "/tmp/industry radar/logs",
      ...env
    }
  });
}

test("cron wrapper log filename expands date at run time", () => {
  const cron = printCron();

  assert.match(cron, /cron-noon-\$\(date \+\\%Y\\%m\\%d\)\.log/);
  assert.doesNotMatch(cron, /'[^'\n]*cron-noon-\$\(date \+\\%Y\\%m\\%d\)\.log'/);
  assert.match(cron, />> '\/tmp\/industry radar\/logs'\/cron-noon-\$\(date \+\\%Y\\%m\\%d\)\.log 2>&1/);
});
