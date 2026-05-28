import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import type { EventEmitter } from "node:events";

export type HotspotRunType = "morning" | "noon" | "night";
export type HotspotRefreshStatus = "idle" | "running" | "success" | "failed";
export type HotspotRefreshTarget = "local-script" | "nas-ssh";

export interface HotspotRefreshJob {
  id: string;
  status: HotspotRefreshStatus;
  target: HotspotRefreshTarget | null;
  runType: HotspotRunType | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  pid: number | null;
  logTail: string[];
}

export interface HotspotRefreshStartOptions {
  runType?: HotspotRunType;
}

export interface HotspotRefreshStartResult {
  started: boolean;
  job: HotspotRefreshJob;
}

interface ChildLike extends EventEmitter {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  kill?: () => void;
}

interface HotspotRefreshControllerOptions {
  env?: NodeJS.ProcessEnv;
  maxLogLines?: number;
  now?: () => Date;
  rootDir?: string;
  scriptPath?: string;
  spawn?: (command: string, args: string[], options: SpawnOptions) => ChildLike;
  timeZone?: string;
}

const RUN_TYPES = new Set<HotspotRunType>(["morning", "noon", "night"]);
const DEFAULT_MAX_LOG_LINES = 80;
const DEFAULT_NAS_APP_DIR = "/mnt/user-data/shares/industry-radar";

export function normalizeHotspotRunType(value: unknown): HotspotRunType | undefined {
  const text = String(value || "").trim().toLowerCase();
  return RUN_TYPES.has(text as HotspotRunType) ? (text as HotspotRunType) : undefined;
}

export function pickHotspotRunType(now = new Date(), timeZone = "Asia/Shanghai"): HotspotRunType {
  const hourPart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  let hour = Number.parseInt(hourPart || "", 10);
  if (!Number.isFinite(hour)) hour = now.getHours();
  if (hour === 24) hour = 0;
  if (hour < 11) return "morning";
  if (hour < 18) return "noon";
  return "night";
}

export function createHotspotRefreshController(options: HotspotRefreshControllerOptions = {}) {
  const rootDir = options.rootDir || process.cwd();
  const scriptPath = options.scriptPath || "scripts/nas-daily-update.sh";
  const spawner: (command: string, args: string[], options: SpawnOptions) => ChildLike =
    options.spawn || ((command, args, spawnOptions) => nodeSpawn(command, args, spawnOptions) as ChildLike);
  const now = options.now || (() => new Date());
  const timeZone = options.timeZone || "Asia/Shanghai";
  const maxLogLines = options.maxLogLines || DEFAULT_MAX_LOG_LINES;
  const controllerEnv = options.env ?? process.env;
  let sequence = 0;
  let current: HotspotRefreshJob = idleJob();

  function getStatus(): HotspotRefreshJob {
    return cloneJob(current);
  }

  function start(startOptions: HotspotRefreshStartOptions = {}): HotspotRefreshStartResult {
    if (current.status === "running") {
      return { started: false, job: getStatus() };
    }

    const runType = startOptions.runType || pickHotspotRunType(now(), timeZone);
    const command = buildRefreshCommand(runType, {
      env: controllerEnv,
      rootDir,
      scriptPath
    });
    const startedAt = now().toISOString();
    current = {
      id: `hotspot-${compactTimestamp(startedAt)}-${++sequence}`,
      status: "running",
      target: command.target,
      runType,
      startedAt,
      finishedAt: null,
      exitCode: null,
      error: null,
      pid: null,
      logTail: []
    };

    try {
      const child = spawner(command.command, command.args, {
        cwd: rootDir,
        env: {
          ...process.env,
          ...controllerEnv,
          HOTSPOT_REFRESH_TRIGGER: "web"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      current.pid = child.pid ?? null;
      attachLogStream(child.stdout);
      attachLogStream(child.stderr);
      child.on("error", (error) => finish("failed", null, errorMessage(error)));
      child.on("close", (code) => {
        if (code === 0) finish("success", 0, null);
        else finish("failed", typeof code === "number" ? code : null, `NAS 更新脚本退出码 ${code ?? "unknown"}`);
      });
    } catch (error) {
      finish("failed", null, errorMessage(error));
    }

    return { started: true, job: getStatus() };
  }

  function attachLogStream(stream: NodeJS.ReadableStream | null | undefined): void {
    if (!stream) return;
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => appendLog(chunk));
  }

  function appendLog(chunk: unknown): void {
    const lines = String(chunk)
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    current.logTail.push(...lines);
    if (current.logTail.length > maxLogLines) {
      current.logTail.splice(0, current.logTail.length - maxLogLines);
    }
  }

  function finish(status: "success" | "failed", exitCode: number | null, error: string | null): void {
    if (current.status !== "running") return;
    current = {
      ...current,
      status,
      finishedAt: now().toISOString(),
      exitCode,
      error
    };
  }

  return { getStatus, start };
}

function idleJob(): HotspotRefreshJob {
  return {
    id: "",
    status: "idle",
    target: null,
    runType: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    error: null,
    pid: null,
    logTail: []
  };
}

function cloneJob(job: HotspotRefreshJob): HotspotRefreshJob {
  return {
    ...job,
    logTail: [...job.logTail]
  };
}

function compactTimestamp(value: string): string {
  return value.replace(/\D/g, "").slice(0, 14);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface RefreshCommandOptions {
  env: NodeJS.ProcessEnv;
  rootDir: string;
  scriptPath: string;
}

interface RefreshCommand {
  args: string[];
  command: string;
  target: HotspotRefreshTarget;
}

function buildRefreshCommand(runType: HotspotRunType, options: RefreshCommandOptions): RefreshCommand {
  const mode = envValue(options.env, "NAS_REFRESH_MODE", "HOTSPOT_REFRESH_MODE").toLowerCase();
  const host = envValue(options.env, "NAS_REFRESH_SSH_HOST", "NAS_SSH_HOST", "HOTSPOT_REFRESH_SSH_HOST");
  if (mode === "ssh" || host) {
    return buildSshRefreshCommand(runType, options.env, host);
  }
  return {
    command: "bash",
    args: [options.scriptPath, runType],
    target: "local-script"
  };
}

function buildSshRefreshCommand(runType: HotspotRunType, env: NodeJS.ProcessEnv, configuredHost: string): RefreshCommand {
  const host = configuredHost || envValue(env, "NAS_REFRESH_SSH_HOST", "NAS_SSH_HOST", "HOTSPOT_REFRESH_SSH_HOST");
  if (!host) {
    throw new Error("NAS_REFRESH_SSH_HOST is required when NAS_REFRESH_MODE=ssh");
  }
  const user = envValue(env, "NAS_REFRESH_SSH_USER", "NAS_SSH_USER", "HOTSPOT_REFRESH_SSH_USER");
  const port = envValue(env, "NAS_REFRESH_SSH_PORT", "NAS_SSH_PORT", "HOTSPOT_REFRESH_SSH_PORT");
  const keyPath = envValue(env, "NAS_REFRESH_SSH_KEY", "NAS_SSH_KEY", "HOTSPOT_REFRESH_SSH_KEY");
  const connectTimeout = positiveEnvInt(envValue(env, "NAS_REFRESH_CONNECT_TIMEOUT", "HOTSPOT_REFRESH_CONNECT_TIMEOUT"), 10);
  const appDir = envValue(env, "NAS_REFRESH_APP_DIR", "NAS_APP_DIR", "APP_DIR") || DEFAULT_NAS_APP_DIR;
  const sshTarget = user ? `${user}@${host}` : host;
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${connectTimeout}`];
  if (keyPath) args.push("-i", keyPath);
  if (port) args.push("-p", port);
  args.push(sshTarget, `cd ${shellQuote(appDir)} && /bin/bash scripts/nas-daily-update.sh ${shellQuote(runType)}`);
  return {
    command: "ssh",
    args,
    target: "nas-ssh"
  };
}

function envValue(env: NodeJS.ProcessEnv, ...keys: string[]): string {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function positiveEnvInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
