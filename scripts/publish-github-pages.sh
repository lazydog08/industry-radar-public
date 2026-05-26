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

log() {
  printf '[%s] [publish-github-pages] %s\n' "$(date '+%F %T')" "$*"
}

# ── 检查 remote 是否存在 ──────────────────────────────────────
if ! git remote get-url "$GITHUB_REMOTE" >/dev/null 2>&1; then
  log "ERROR: Git remote '${GITHUB_REMOTE}' not found."
  log "Please run: git remote add ${GITHUB_REMOTE} https://github.com/lazydog08/industry-radar-public.git"
  exit 1
fi

# ── 检查 public-data 目录 ─────────────────────────────────────
PUBLIC_DATA_DIR="${PUBLIC_DATA_DIR:-./public-data}"
if [[ ! -d "$PUBLIC_DATA_DIR" ]]; then
  log "ERROR: public-data directory not found: ${PUBLIC_DATA_DIR}"
  log "Please run 'pnpm export:site' first to generate the static data."
  exit 1
fi

# ── 强制将 public-data 加入 Git（绕过 .gitignore）─────────────
log "Adding public-data to git (force, bypassing .gitignore)..."
git add -f public-data/

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
