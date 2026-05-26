#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-http://192.168.31.50:3000/lazydog/industry-radar-kb.git}"
APP_DIR="${APP_DIR:-${HOME}/industry-radar-kb}"
BRANCH="${BRANCH:-main}"
PNPM_VERSION="${PNPM_VERSION:-10.12.1}"
RUN_INSTALL="${RUN_INSTALL:-true}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

mask_url_credentials() {
  printf '%s' "$1" | sed -E 's#://[^/@]+@#://***@#'
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || die "Missing required command: ${name}"
}

is_empty_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || return 1
  [[ -z "$(find "$dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]
}

normalize_bool() {
  case "${1}" in
    1|true|TRUE|yes|YES|y|Y|on|ON)
      printf 'true'
      ;;
    0|false|FALSE|no|NO|n|N|off|OFF)
      printf 'false'
      ;;
    *)
      die "Invalid boolean value for RUN_INSTALL: ${1}. Use true or false."
      ;;
  esac
}

update_existing_repo() {
  local current_branch
  cd "$APP_DIR"

  git remote get-url origin >/dev/null 2>&1 || die "Existing repository has no origin remote: ${APP_DIR}"

  current_branch="$(git branch --show-current || true)"
  if [[ -n "$current_branch" && "$current_branch" != "$BRANCH" ]]; then
    log "Current branch is ${current_branch}; switching to ${BRANCH}."
  fi

  log "Fetching ${BRANCH} from origin."
  git fetch origin "$BRANCH"

  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git checkout "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
    git checkout --track -b "$BRANCH" "origin/${BRANCH}"
  else
    die "Branch not found on origin: ${BRANCH}"
  fi

  log "Pulling ${BRANCH} with fast-forward only."
  git pull --ff-only origin "$BRANCH"
}

clone_repo() {
  local parent
  parent="$(dirname -- "$APP_DIR")"
  mkdir -p "$parent"

  if [[ -e "$APP_DIR" ]]; then
    is_empty_dir "$APP_DIR" || die "APP_DIR exists but is not a Git repo and is not empty: ${APP_DIR}"
    rmdir "$APP_DIR"
  fi

  log "Cloning $(mask_url_credentials "$REPO_URL") into ${APP_DIR}."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
}

prepare_repo() {
  require_command git

  if [[ "$REPO_URL" == http://* ]]; then
    log "WARNING: REPO_URL uses plain HTTP. Keep this only on a trusted LAN or switch to HTTPS/SSH."
  fi

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Found existing Git repository: ${APP_DIR}"
    update_existing_repo
    return
  fi

  clone_repo
}

write_env_example() {
  cd "$APP_DIR"

  if [[ -f .env.local ]]; then
    log ".env.local already exists; leaving local secrets and settings untouched."
    return
  fi

  if [[ -f .env.local.example ]]; then
    log ".env.local is missing. Existing .env.local.example was left unchanged."
    return
  fi

  if [[ -f .env.example ]]; then
    cp .env.example .env.local.example
    log "Created .env.local.example from .env.example. Copy it to .env.local on the NAS and fill local-only values."
    return
  fi

  cat > .env.local.example <<'ENV'
TIMEZONE=Asia/Shanghai
DATABASE_URL=./data/industry-radar.sqlite
REPORT_OUTPUT_DIR=./data/reports
PUBLIC_DATA_DIR=./data/public
PUBLISH_DIR=
BARK_NOTIFY_URL=
BARK_KEY=
BARK_PUBLIC_URL=https://example.com/industry-radar/
BARK_SOUND=done
BARK_DRY_RUN=false
BARK_TIMEOUT_MS=10000
NAS_RUN_TYPE=noon
NAS_RUN_DATE=
NAS_MOCK_FALLBACK=false
NAS_LOG_DIR=./logs/nas-daily
ENABLE_INTERNAL_SCHEDULER=false
PORT=3877
ENV
  log "Created .env.local.example. Copy it to .env.local on the NAS and fill local-only values."
}

prepare_runtime_dirs() {
  cd "$APP_DIR"
  mkdir -p \
    data \
    data/reports \
    data/public \
    logs \
    logs/nas-daily \
    public-data \
    public-data/reports
  log "Runtime directories are ready. Existing data was not deleted."
}

resolve_pnpm() {
  local detected_version

  if command -v pnpm >/dev/null 2>&1; then
    detected_version="$(pnpm --version 2>/dev/null || true)"
    if [[ -n "$detected_version" && "$detected_version" != "$PNPM_VERSION" ]]; then
      log "Using system pnpm ${detected_version}; PNPM_VERSION=${PNPM_VERSION} is used when Corepack selects pnpm."
    fi
    PNPM_CMD=(pnpm)
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    if corepack "pnpm@${PNPM_VERSION}" --version >/dev/null 2>&1; then
      PNPM_CMD=(corepack "pnpm@${PNPM_VERSION}")
      return
    fi

    if corepack pnpm --version >/dev/null 2>&1; then
      PNPM_CMD=(corepack pnpm)
      return
    fi
  fi

  die "pnpm is unavailable. Install Node with Corepack support, then run 'corepack enable' or install pnpm ${PNPM_VERSION}; this script will not change system package-manager settings."
}

install_dependencies() {
  local run_install
  run_install="$(normalize_bool "$RUN_INSTALL")"
  if [[ "$run_install" == "false" ]]; then
    log "RUN_INSTALL=false; dependency installation skipped."
    return
  fi

  cd "$APP_DIR"
  resolve_pnpm

  log "Installing dependencies with ${PNPM_CMD[*]}."
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "${PNPM_CMD[@]}" install
}

print_next_steps() {
  cat <<EOF

NAS bootstrap completed.

App directory:
  ${APP_DIR}

Next steps:
  1. Review ${APP_DIR}/.env.local.example.
  2. Create ${APP_DIR}/.env.local on the NAS and fill local paths and optional Bark settings.
  3. Run a manual daily update after configuration:
     cd ${APP_DIR}
     bash scripts/nas-daily-update.sh noon
  4. Then run bash scripts/nas-healthcheck.sh and connect the NAS scheduler by following docs/NAS_SCHEDULE.md.

No real secrets were written by this script.
EOF
}

main() {
  RUN_INSTALL="$(normalize_bool "$RUN_INSTALL")"

  log "Starting NAS bootstrap."
  log "REPO_URL=$(mask_url_credentials "$REPO_URL")"
  log "APP_DIR=${APP_DIR}"
  log "BRANCH=${BRANCH}"
  log "PNPM_VERSION=${PNPM_VERSION}"
  log "RUN_INSTALL=${RUN_INSTALL}"

  prepare_repo
  write_env_example
  prepare_runtime_dirs
  install_dependencies
  print_next_steps
}

main "$@"
