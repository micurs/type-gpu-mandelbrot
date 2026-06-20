#!/bin/bash
# Gitea pull request helper. Invoked directly or via:
#   ./scripts/gitea-helper.sh pr <command>
#
# Examples:
#   ./scripts/gitea-pr.sh create "Title" "Body" "head-branch" "base-branch"
#   ./scripts/gitea-pr.sh comments 46
#   ./scripts/gitea-pr.sh comment src/file.ts 12 < comment.md
#   ./scripts/gitea-pr.sh reply 330 < reply.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GITEA_URL="${GITEA_URL:-http://gitea.micurs.com:3000}"
REPO="${REPO:-micurs/ts-geopro}"
GITEA_TOKEN="${GITEA_TOKEN:-$(grep 'token:' ~/Library/Application\ Support/tea/config.yml 2>/dev/null | head -1 | awk '{print $2}')}"
GITEA_BRANCH="${GITEA_BRANCH:-$(git -C "$SCRIPT_DIR/.." branch --show-current 2>/dev/null || true)}"

if [ -z "$GITEA_TOKEN" ]; then
  echo "Error: GITEA_TOKEN not found. Set GITEA_TOKEN env var or ensure tea CLI is configured."
  exit 1
fi

GITEA_URL="$GITEA_URL" GITEA_TOKEN="$GITEA_TOKEN" REPO="$REPO" GITEA_BRANCH="$GITEA_BRANCH" GITEA_WEB_COOKIE="${GITEA_WEB_COOKIE:-}" \
  deno run --allow-net --allow-env "$SCRIPT_DIR/gitea-pr.ts" "$@"
