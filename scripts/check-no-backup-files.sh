#!/usr/bin/env bash
# Fail if *.backup / *.bak files exist under the repo (excluding node_modules, .git, native build trees).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

hits=$(find . \( -name '*.backup' -o -name '*.bak' \) \
  ! -path './node_modules/*' \
  ! -path './.git/*' \
  ! -path '*/node_modules/*' \
  ! -path './apps/*/android/.gradle/*' \
  ! -path './apps/*/android/build/*' \
  ! -path './apps/*/ios/Pods/*' \
  2>/dev/null || true)

if [[ -n "$hits" ]]; then
  count=$(echo "$hits" | wc -l | tr -d ' ')
  echo "FAIL: $count *.backup/*.bak file(s) present (delete them; do not commit editor backups):"
  echo "$hits" | head -n 50
  exit 1
fi

echo "OK: no *.backup / *.bak files"
