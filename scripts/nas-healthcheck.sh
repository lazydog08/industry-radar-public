#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

normalize_bool() {
  case "${1:-false}" in
    1|true|TRUE|yes|YES|y|Y|on|ON)
      printf 'true'
      ;;
    0|false|FALSE|no|NO|n|N|off|OFF|"")
      printf 'false'
      ;;
    *)
      printf 'ERROR: invalid boolean value: %s\n' "$1" >&2
      exit 2
      ;;
  esac
}

STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${HEALTHCHECK_RUN_DIR:-./data/runtime/nas-healthcheck-${STAMP}}"
REAL_PATHS="$(normalize_bool "${HEALTHCHECK_USE_REAL_PATHS:-false}")"
TEST_PUBLISH="$(normalize_bool "${HEALTHCHECK_TEST_PUBLISH:-false}")"
KEEP_RUN_DIR="$(normalize_bool "${HEALTHCHECK_KEEP_RUN_DIR:-false}")"
ALLOW_REAL_WRITES="$(normalize_bool "${HEALTHCHECK_ALLOW_REAL_WRITES:-false}")"
RUN_DATE="${NAS_RUN_DATE:-$(date +%F)}"

if [[ "$REAL_PATHS" == "true" && "$ALLOW_REAL_WRITES" != "true" ]]; then
  cat >&2 <<'MSG'
ERROR: HEALTHCHECK_USE_REAL_PATHS=true would run a mock report against the configured DATABASE_URL.
Set HEALTHCHECK_ALLOW_REAL_WRITES=true only when you intentionally want to write validation data to those real paths.
MSG
  exit 2
fi

if [[ "$REAL_PATHS" == "true" ]]; then
  DATABASE_PATH="${DATABASE_URL:-./data/industry-radar.sqlite}"
  REPORT_DIR="${REPORT_OUTPUT_DIR:-./data/reports}"
  PUBLIC_DIR="${PUBLIC_DATA_DIR:-${EXPORT_SITE_DIR:-./public-data}}"
  LOG_DIR="${NAS_LOG_DIR:-./logs/nas-healthcheck}"
else
  DATABASE_PATH="${RUN_DIR}/industry-radar.sqlite"
  REPORT_DIR="${RUN_DIR}/reports"
  PUBLIC_DIR="${RUN_DIR}/public-data"
  LOG_DIR="${RUN_DIR}/logs"
fi

mkdir -p "$RUN_DIR" "$REPORT_DIR" "$PUBLIC_DIR" "$LOG_DIR"

PASS_ITEMS=()
WARN_ITEMS=()
FAIL_ITEMS=()

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx pnpm@10.12.1)
fi

info() {
  printf '%s\n' "$*"
}

pass() {
  PASS_ITEMS+=("$1")
  printf 'PASS %s\n' "$1"
}

warn() {
  WARN_ITEMS+=("$1")
  printf 'WARN %s\n' "$1"
}

fail() {
  FAIL_ITEMS+=("$1")
  printf 'FAIL %s\n' "$1"
}

run_logged() {
  local label="$1"
  shift
  local safe_label
  safe_label="$(printf '%s' "$label" | tr -cs '[:alnum:]_.-' '-')"
  local log_file="${LOG_DIR}/${safe_label}.log"
  if "$@" >"$log_file" 2>&1; then
    pass "${label}"
    return 0
  fi
  fail "${label} (see ${log_file})"
  return 1
}

has_pnpm_script() {
  local script_name="$1"
  node -e 'const pkg=require("./package.json"); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)' "$script_name" >/dev/null 2>&1
}

check_git() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local branch
    branch="$(git branch --show-current 2>/dev/null || true)"
    pass "Git repository detected${branch:+ (${branch})}"
  else
    fail "Git repository not detected"
  fi

  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    warn "Working tree has local changes; healthcheck will not modify Git state"
  else
    pass "Working tree has no local changes"
  fi
}

check_runtime() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js is not installed or not in PATH"
    return
  fi

  local node_version node_major required_node_major
  node_version="$(node -v)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  required_node_major="$(node -e 'const engines=require("./package.json").engines?.node || ">=24"; const match=engines.match(/>=\\s*(\\d+)/); console.log(match ? match[1] : "24");')"
  if [[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge "$required_node_major" ]]; then
    pass "Node.js ${node_version}"
  else
    fail "Node.js ${node_version}; package.json requires >=${required_node_major}"
  fi

  if "${PNPM[@]}" --version >/dev/null 2>&1; then
    pass "pnpm available ($("${PNPM[@]}" --version))"
  else
    fail "pnpm is not available"
  fi
}

check_scripts() {
  local required_scripts=(
    typecheck
    build
    report:run
    export:site
    notify:bark
    nas:bootstrap
    nas:daily
    nas:schedule
    nas:health
    nas:bark
    nas:web-preview
  )
  for script_name in "${required_scripts[@]}"; do
    if has_pnpm_script "$script_name"; then
      pass "package script exists: ${script_name}"
    else
      fail "missing package script: ${script_name}"
    fi
  done

  local nas_scripts=(
    scripts/nas-bootstrap.sh
    scripts/nas-schedule.sh
    scripts/nas-web-preview.sh
    scripts/nas-healthcheck.sh
    scripts/nas-bark-test.sh
    scripts/nas-daily-update.sh
  )
  for script_path in "${nas_scripts[@]}"; do
    run_logged "bash syntax: ${script_path}" bash -n "$script_path" || true
  done
}

check_build() {
  run_logged "pnpm typecheck" "${PNPM[@]}" typecheck || true
  run_logged "isolated TypeScript build" "${PNPM[@]}" exec tsc -p tsconfig.json --outDir "${RUN_DIR}/dist" || true
}

run_isolated_daily() {
  info "Using healthcheck paths:"
  info "  DATABASE_URL=${DATABASE_PATH}"
  info "  REPORT_OUTPUT_DIR=${REPORT_DIR}"
  info "  PUBLIC_DATA_DIR=${PUBLIC_DIR}"

  run_logged "isolated mock report" \
    env DATABASE_URL="$DATABASE_PATH" REPORT_OUTPUT_DIR="$REPORT_DIR" \
    "${PNPM[@]}" report:run -- --type noon --date "$RUN_DATE" --mock || true

  run_logged "isolated static export" \
    env DATABASE_URL="$DATABASE_PATH" REPORT_OUTPUT_DIR="$REPORT_DIR" PUBLIC_DATA_DIR="$PUBLIC_DIR" EXPORT_SITE_DIR="$PUBLIC_DIR" \
    "${PNPM[@]}" export:site || true
}

check_public_data() {
  local required_files=(
    overview.json
    events.json
    knowledge.json
    reports/index.json
    meta.json
  )

  for file in "${required_files[@]}"; do
    local path="${PUBLIC_DIR%/}/${file}"
    if [[ -s "$path" ]]; then
      pass "public-data file exists: ${file}"
    else
      fail "public-data file missing or empty: ${path}"
    fi
  done

  run_logged "public-data JSON parse" \
    node -e '
const fs = require("node:fs");
for (const file of process.argv.slice(1)) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}
' "${PUBLIC_DIR%/}/overview.json" "${PUBLIC_DIR%/}/events.json" "${PUBLIC_DIR%/}/knowledge.json" "${PUBLIC_DIR%/}/reports/index.json" "${PUBLIC_DIR%/}/meta.json" || true
}

check_publish() {
  if [[ -z "${PUBLISH_DIR:-}" ]]; then
    pass "PUBLISH_DIR is not configured; real publish stage skipped"
    return
  fi

  warn "PUBLISH_DIR is configured but was not written: ${PUBLISH_DIR}"
  if [[ "$TEST_PUBLISH" != "true" ]]; then
    warn "Set HEALTHCHECK_TEST_PUBLISH=true to test an isolated publish directory"
    return
  fi

  local publish_dir="${RUN_DIR}/publish/public-data"
  rm -rf -- "$publish_dir"
  mkdir -p "$publish_dir"
  if cp -R "${PUBLIC_DIR%/}/." "$publish_dir/"; then
    pass "isolated publish copy completed: ${publish_dir}"
  else
    fail "isolated publish copy failed: ${publish_dir}"
    return
  fi

  local required=(overview.json events.json knowledge.json reports/index.json meta.json)
  for file in "${required[@]}"; do
    if [[ -s "${publish_dir%/}/${file}" ]]; then
      pass "isolated publish file exists: ${file}"
    else
      fail "isolated publish file missing or empty: ${publish_dir%/}/${file}"
    fi
  done
}

check_bark() {
  run_logged "Bark dry-run" \
    env BARK_DRY_RUN=true BARK_NOTIFY_URL= BARK_KEY=example BARK_STATUS=success BARK_RUN_TYPE=noon NAS_RUN_DATE="$RUN_DATE" \
    "${PNPM[@]}" notify:bark || true
}

print_summary() {
  info ""
  info "NAS healthcheck summary"
  info "  PASS: ${#PASS_ITEMS[@]}"
  info "  WARN: ${#WARN_ITEMS[@]}"
  info "  FAIL: ${#FAIL_ITEMS[@]}"
  info "  Run dir: ${RUN_DIR}"
  info ""

  if ((${#WARN_ITEMS[@]} > 0)); then
    info "WARN items:"
    printf '  - %s\n' "${WARN_ITEMS[@]}"
    info ""
  fi

  if ((${#FAIL_ITEMS[@]} > 0)); then
    info "FAIL items:"
    printf '  - %s\n' "${FAIL_ITEMS[@]}"
    info ""
    exit 1
  fi

  if [[ "$REAL_PATHS" == "false" && "$KEEP_RUN_DIR" != "true" ]]; then
    rm -rf -- "$RUN_DIR"
    info "Cleaned successful healthcheck run dir. Set HEALTHCHECK_KEEP_RUN_DIR=true to keep it."
  fi
}

info "NAS healthcheck started at ${STAMP}"
check_git
check_runtime
check_scripts
check_build
run_isolated_daily
check_public_data
check_publish
check_bark
print_summary
