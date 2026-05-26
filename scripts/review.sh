#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-staged}"
if [[ $# -gt 0 ]]; then
  shift
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

mkdir -p .reviews/archive

EXCLUDES=(
  ":(exclude).env"
  ":(exclude).git/**"
  ":(exclude).reviews/**"
  ":(exclude)node_modules/**"
  ":(exclude)dist/**"
  ":(exclude)logs/**"
  ":(exclude)backups/**"
  ":(exclude)data/*.sqlite"
  ":(exclude)data/*.sqlite-*"
  ":(exclude)data/reports/**"
  ":(exclude)data/runtime/**"
  ":(exclude)data/real-runs/**"
  ":(exclude)data/simulations/**"
  ":(exclude)coverage/**"
)

PATHS=("$@")
if [[ ${#PATHS[@]} -eq 0 ]]; then
  PATHS=(".")
fi

DIFF_FILE="$(mktemp)"
PROMPT_FILE="$(mktemp)"
OUTPUT_FILE="$(mktemp)"
cleanup() {
  rm -f "$DIFF_FILE" "$PROMPT_FILE" "$OUTPUT_FILE"
}
trap cleanup EXIT

case "$MODE" in
  staged)
    git diff --cached -- "${PATHS[@]}" "${EXCLUDES[@]}" > "$DIFF_FILE"
    ;;
  all)
    git add -N -- "${PATHS[@]}" >/dev/null 2>&1 || true
    {
      git diff --cached -- "${PATHS[@]}" "${EXCLUDES[@]}"
      git diff -- "${PATHS[@]}" "${EXCLUDES[@]}"
    } > "$DIFF_FILE"
    ;;
  last-commit)
    git diff HEAD~1..HEAD -- "${PATHS[@]}" "${EXCLUDES[@]}" > "$DIFF_FILE"
    ;;
  range)
    RANGE="${1:-}"
    if [[ -z "$RANGE" ]]; then
      echo "Usage: scripts/review.sh range <A>..<B> [paths...]" >&2
      exit 2
    fi
    shift || true
    PATHS=("$@")
    if [[ ${#PATHS[@]} -eq 0 ]]; then
      PATHS=(".")
    fi
    git diff "$RANGE" -- "${PATHS[@]}" "${EXCLUDES[@]}" > "$DIFF_FILE"
    ;;
  *)
    echo "Usage: scripts/review.sh [staged|all|last-commit|range <A>..<B>] [paths...]" >&2
    exit 2
    ;;
esac

if [[ ! -s "$DIFF_FILE" ]]; then
  {
    echo "# Claude Review"
    echo
    echo "No diff found for mode: $MODE"
  } > .reviews/latest.md
  cp .reviews/latest.md ".reviews/archive/$(date -u +%Y%m%dT%H%M%SZ).md"
  echo "No diff found. Wrote .reviews/latest.md"
  exit 0
fi

cat > "$PROMPT_FILE" <<'PROMPT'
You are Claude Code acting as a read-only reviewer. Review the following git diff for correctness, safety, privacy, maintainability, and missing validation.

Rules:
- Do not propose editing files yourself.
- Do not ask to run commands.
- Treat secrets, tokens, cookies, passwords, private data, SQLite contents, and generated reports as out of scope and unsafe to transmit.
- Prioritize actionable bugs over style comments.
- Output sections: Findings, Open Questions, Suggested Next Patch.
- Order findings by severity: P0, P1, P2, P3.
PROMPT

{
  echo
  echo "## Repository Context"
  echo
  if [[ -f AGENTS.md ]]; then
    sed -n '1,220p' AGENTS.md
  fi
  echo
  if [[ -f CLAUDE.md ]]; then
    sed -n '1,220p' CLAUDE.md
  fi
  echo
  echo "## Diff"
  echo
  sed -n "1,${MAX_DIFF_LINES:-1200}p" "$DIFF_FILE"
} >> "$PROMPT_FILE"

(
  claude -p --allowedTools "Read" --disallowedTools "Edit,Write,Bash,NotebookEdit" < "$PROMPT_FILE" > "$OUTPUT_FILE" 2>&1
) &
CLAUDE_PID=$!
for _ in $(seq 1 "${CLAUDE_REVIEW_TIMEOUT_SECONDS:-180}"); do
  if ! kill -0 "$CLAUDE_PID" 2>/dev/null; then
    wait "$CLAUDE_PID"
    cat "$OUTPUT_FILE" > .reviews/latest.md
    ARCHIVE=".reviews/archive/$(date -u +%Y%m%dT%H%M%SZ).md"
    cp .reviews/latest.md "$ARCHIVE"
    echo "Claude review written to .reviews/latest.md and $ARCHIVE"
    exit 0
  fi
  sleep 1
done

kill "$CLAUDE_PID" 2>/dev/null || true
wait "$CLAUDE_PID" 2>/dev/null || true
{
  echo "# Claude Review Infrastructure Failure"
  echo
  echo "Claude CLI timed out after ${CLAUDE_REVIEW_TIMEOUT_SECONDS:-180} seconds."
  echo
  echo "Partial output:"
  cat "$OUTPUT_FILE"
} > .reviews/latest.md
ARCHIVE=".reviews/archive/$(date -u +%Y%m%dT%H%M%SZ).md"
cp .reviews/latest.md "$ARCHIVE"
echo "Claude review timed out. Wrote infrastructure failure to .reviews/latest.md and $ARCHIVE"
exit 124
