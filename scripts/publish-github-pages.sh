#!/usr/bin/env bash
# publish-github-pages.sh
# 把更新后的 public-data/ 强制提交并推送到 GitHub remote，触发 Pages workflow。
# 失败时以非零退出码退出，但不会影响调用它的 NAS 日更脚本（调用方用 || 包裹）。
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ── 读取环境变量 ──────────────────────────────────────────────
if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
elif [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

GITHUB_REMOTE="${GITHUB_REMOTE:-github}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
PUBLIC_DATA_DIR="${PUBLIC_DATA_DIR:-./public-data}"
# GitHub Pages workflow copies this exact repository path.
readonly GITHUB_PAGES_DATA_DIR="./public-data"
PAGES_STAGING_DIR=""
PAGES_PREVIOUS_DIR=""

log() {
  printf '[%s] [publish-github-pages] %s\n' "$(date '+%F %T')" "$*"
}

cleanup_staging() {
  [[ -n "$PAGES_STAGING_DIR" && -e "$PAGES_STAGING_DIR" ]] && rm -rf -- "$PAGES_STAGING_DIR"
  [[ -n "$PAGES_PREVIOUS_DIR" && -e "$PAGES_PREVIOUS_DIR" ]] && rm -rf -- "$PAGES_PREVIOUS_DIR"
}
trap cleanup_staging EXIT

scan_public_data_for_sensitive_content() {
  local scan_dir="${1:-$PUBLIC_DATA_DIR}"
  local matches
  matches="$(
    grep -RIlE \
      '(BARK_(KEY|NOTIFY_URL)=|COOKIE=|TOKEN=|PASSWORD=|BEGIN [A-Z ]*PRIVATE KEY|gho_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|http://(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.))' \
      "$scan_dir" 2>/dev/null || true
  )"

  if [[ -n "$matches" ]]; then
    log "ERROR: sensitive-looking content found in public data. Review these files before publishing:"
    printf '%s\n' "$matches" >&2
    exit 1
  fi
}

scan_tracked_files_for_sensitive_content() {
  local matches
  matches="$(
    git grep -nE \
      '(gho_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|BEGIN [A-Z ]*PRIVATE KEY|BARK_KEY=[A-Za-z0-9_-]{10,}|BARK_NOTIFY_URL=https://api\.day\.app/[A-Za-z0-9_-]{10,})' \
      -- . ':!.env.example' 2>/dev/null | grep -vE '(your_bark_key|BARK_KEY=example)' || true
  )"

  if [[ -n "$matches" ]]; then
    log "ERROR: sensitive-looking content found in tracked files. Review before publishing."
    printf '%s\n' "$matches" | sed -E 's/(BARK_KEY=|BARK_NOTIFY_URL=|gho_|github_pat_)[^[:space:]]+/\1***/g' >&2
    exit 1
  fi
}

preflight_public_data() {
  if [[ ! -d "$PUBLIC_DATA_DIR" ]]; then
    log "ERROR: public-data directory not found: ${PUBLIC_DATA_DIR}"
    log "Please run 'pnpm export:site' first to generate the static data."
    exit 1
  fi

  local required_files=(
    "overview.json"
    "events.json"
    "knowledge.json"
    "meta.json"
    "reports/index.json"
  )
  local file
  for file in "${required_files[@]}"; do
    if [[ ! -f "$PUBLIC_DATA_DIR/$file" ]]; then
      log "ERROR: required public-data file missing: ${PUBLIC_DATA_DIR}/${file}"
      exit 1
    fi
  done

  local unexpected_files
  unexpected_files="$(find "$PUBLIC_DATA_DIR" -type f ! \( -name '*.json' -o -name '*.html' -o -name '*.md' \) -print)"
  if [[ -n "$unexpected_files" ]]; then
    log "ERROR: public-data contains unexpected file types. Only .json, .html, and .md are allowed:"
    printf '%s\n' "$unexpected_files" >&2
    exit 1
  fi

  scan_tracked_files_for_sensitive_content
  scan_public_data_for_sensitive_content "$PUBLIC_DATA_DIR"
}

stage_pages_data() {
  local root_dir source_dir pages_parent pages_dir
  root_dir="$(pwd -P)"
  if ! source_dir="$(cd "$PUBLIC_DATA_DIR" && pwd -P)"; then
    log "ERROR: PUBLIC_DATA_DIR is not accessible: ${PUBLIC_DATA_DIR}"
    exit 1
  fi
  pages_parent="$(cd "$(dirname "$GITHUB_PAGES_DATA_DIR")" && pwd -P)"
  pages_dir="${pages_parent}/$(basename "$GITHUB_PAGES_DATA_DIR")"

  if [[ "$pages_dir" != "${root_dir}/public-data" ]]; then
    log "ERROR: GITHUB_PAGES_DATA_DIR must resolve to ${root_dir}/public-data, got: ${pages_dir}"
    exit 1
  fi

  if [[ "$source_dir" == "$pages_dir" ]]; then
    return 0
  fi

  if ! command -v rsync >/dev/null 2>&1; then
    log "ERROR: rsync is required to stage GitHub Pages data safely."
    exit 1
  fi

  PAGES_STAGING_DIR="${root_dir}/.public-data.staging-$$"
  PAGES_PREVIOUS_DIR="${root_dir}/.public-data.previous-$$"
  rm -rf -- "$PAGES_STAGING_DIR" "$PAGES_PREVIOUS_DIR"
  mkdir -p "$PAGES_STAGING_DIR"

  log "Staging ${PUBLIC_DATA_DIR} into ${GITHUB_PAGES_DATA_DIR} for GitHub Pages..."
  rsync -a --delete "${PUBLIC_DATA_DIR%/}/" "${PAGES_STAGING_DIR%/}/" || {
    log "ERROR: rsync failed while staging GitHub Pages data."
    exit 1
  }
  scan_public_data_for_sensitive_content "$PAGES_STAGING_DIR"

  if [[ -e "$GITHUB_PAGES_DATA_DIR" ]]; then
    mv "$GITHUB_PAGES_DATA_DIR" "$PAGES_PREVIOUS_DIR"
  fi
  if mv "$PAGES_STAGING_DIR" "$GITHUB_PAGES_DATA_DIR"; then
    rm -rf -- "$PAGES_PREVIOUS_DIR"
    PAGES_PREVIOUS_DIR=""
  else
    log "ERROR: failed to replace ${GITHUB_PAGES_DATA_DIR} with staged data."
    if [[ -e "$PAGES_PREVIOUS_DIR" ]]; then
      if mv "$PAGES_PREVIOUS_DIR" "$GITHUB_PAGES_DATA_DIR"; then
        PAGES_PREVIOUS_DIR=""
      else
        log "ERROR: failed to restore previous ${GITHUB_PAGES_DATA_DIR}; backup kept at ${PAGES_PREVIOUS_DIR}"
        PAGES_PREVIOUS_DIR=""
      fi
    fi
    exit 1
  fi
  PAGES_STAGING_DIR=""
}

# ── 检查 remote 是否存在 ──────────────────────────────────────
if ! git remote get-url "$GITHUB_REMOTE" >/dev/null 2>&1; then
  log "ERROR: Git remote '${GITHUB_REMOTE}' not found."
  log "Please run: git remote add ${GITHUB_REMOTE} https://github.com/lazydog08/industry-radar-public.git"
  exit 1
fi

# ── 检查 public-data 目录 ─────────────────────────────────────
preflight_public_data
stage_pages_data

# ── 强制将 public-data 加入 Git（绕过 .gitignore）─────────────
log "Adding ${GITHUB_PAGES_DATA_DIR} to git (force, bypassing .gitignore)..."
git add -f -- "$GITHUB_PAGES_DATA_DIR"

# ── 如果没有改动就跳过 commit ─────────────────────────────────
if git diff --cached --quiet; then
  log "No changes in public-data; skipping commit and push."
  exit 0
fi

COMMIT_MSG="chore(public-data): update $(date '+%Y-%m-%d %H:%M')"
log "Committing: ${COMMIT_MSG}"
git commit -m "$COMMIT_MSG"

# ── 推送到 GitHub remote ──────────────────────────────────────
log "Pushing to remote '${GITHUB_REMOTE}' branch '${GITHUB_BRANCH}'..."
git push "$GITHUB_REMOTE" "HEAD:${GITHUB_BRANCH}"
log "Push complete. GitHub Pages workflow will deploy the updated site."
