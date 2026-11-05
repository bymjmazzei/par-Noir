#!/usr/bin/env bash
# Drive folders and Sheets are only created through
# packages/device-cloud-credentials/src/driveChild.ts (parent required, oldest-first
# find, single-flight). The pN root is only created by createPnRootFolder in
# deviceDriveFind.ts; deviceDriveCall.ts is the translator that enforces parents.
#
# A raw '/api/drive/folders', '/api/drive/native' or Sheets spreadsheets.create call
# anywhere else in apps/ or packages/ is how root-level and duplicate Drive items
# came back. There is no allowlist.
#
# PN_CHECK_REF=<git ref> scans that commit instead of the working tree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

Q="['\"\`]"
PATTERN="${Q}/api/drive/(folders|native)${Q}"
PATTERN="${PATTERN}|\\([[:space:]]*(SHEETS[A-Za-z_]*|\`\\\$\\{SHEETS[A-Za-z_]*\\}\`|${Q}https://sheets\\.googleapis\\.com/v4/spreadsheets${Q})[[:space:]]*,"

is_canonical() {
  case "$1" in
    packages/device-cloud-credentials/src/driveChild.ts) return 0 ;;
    packages/device-cloud-credentials/src/deviceDriveCall.ts) return 0 ;;
    packages/device-cloud-credentials/src/deviceDriveFind.ts) return 0 ;;
    *) return 1 ;;
  esac
}

is_excluded() {
  case "$1" in
    */node_modules/* | */dist/* | */build/* | */static/*) return 0 ;;
    *.test.* | */__tests__/* | */test/* | */tests/*) return 0 ;;
    *.ts | *.tsx | *.js | *.mjs) return 1 ;;
    *) return 0 ;;
  esac
}

REF="${PN_CHECK_REF:-}"
if [ -n "$REF" ]; then
  matches="$(git grep -n -E "$PATTERN" "$REF" -- apps packages 2>/dev/null | sed "s|^${REF}:||" || true)"
else
  matches="$(git grep -n -E --untracked "$PATTERN" -- apps packages 2>/dev/null || true)"
fi

violations=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  file="${line%%:*}"
  is_excluded "$file" && continue
  is_canonical "$file" && continue
  violations="${violations}${line}"$'\n'
done <<< "$matches"

if [ -n "$violations" ]; then
  echo "BLOCKED: Drive folder / Sheets create outside driveChild.ts."
  printf '%s' "$violations" | sed '/^$/d' | cut -c1-200 | sed 's/^/  - /'
  echo
  echo "Use ensureDriveChildFolder / ensureDriveChildSpreadsheet / createDriveChildSpreadsheet"
  echo "from @par-noir/device-cloud-credentials with the pN folder (or a child) as parent."
  exit 1
fi

echo "OK: Drive folders and Sheets are only created through driveChild.ts"
exit 0
