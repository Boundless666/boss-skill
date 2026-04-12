#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

command -v node >/dev/null 2>&1 || { echo "需要 node 才能运行 check-artifact.sh"; exit 1; }

node "$SCRIPT_DIR/../../runtime/cli/get-ready-artifacts.js" "$@"
