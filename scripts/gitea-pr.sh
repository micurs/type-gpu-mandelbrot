#!/bin/bash
# DEPRECATED: Use the new Deno-based CLI instead:
#   vp run gitea-helper -- pr <command>
#   deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr <command>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[DEPRECATED] gitea-pr.sh is deprecated. Use 'vp run gitea-helper -- pr' instead." >&2
echo "  e.g. vp run gitea-helper -- pr $*" >&2
echo "" >&2

exec deno run --allow-env --allow-net --allow-read "$SCRIPT_DIR/gitea-helper.ts" pr "$@"
