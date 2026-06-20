#!/bin/bash
# DEPRECATED: Use the new Deno-based CLI instead:
#   vp run gitea-helper -- <command>
#   deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts <command>
#
# Old commands are translated to the new format automatically.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[DEPRECATED] gitea-helper.sh is deprecated. Use 'vp run gitea-helper --' instead." >&2
echo "  e.g. vp run gitea-helper -- $*" >&2
echo "" >&2

ARGS=("$@")
CMD="${1:-}"
SUB="${2:-}"

case "$CMD" in
  list|show|create|comment|close|reopen)
    exec deno run --allow-env --allow-net --allow-read "$SCRIPT_DIR/gitea-helper.ts" issues "${ARGS[@]}"
    ;;
  pr)
    exec deno run --allow-env --allow-net --allow-read "$SCRIPT_DIR/gitea-helper.ts" pr "${ARGS[@]:1}"
    ;;
  *)
    exec deno run --allow-env --allow-net --allow-read "$SCRIPT_DIR/gitea-helper.ts" "${ARGS[@]}"
    ;;
esac
