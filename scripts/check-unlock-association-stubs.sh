#!/usr/bin/env bash
# Ratchet: unlock.parnoir.com association files must not ship TEAMID / SHA256 stubs
# unless listed on the burn-down allowlist (Apple Team ID pending).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AASA="$ROOT/apps/pn-unlock/public/.well-known/apple-app-site-association"
ASSET="$ROOT/apps/pn-unlock/public/.well-known/assetlinks.json"
ALLOW="$ROOT/scripts/unlock-association-stub-allowlist.txt"

rel_allowed() {
  local rel="$1"
  [ -f "$ALLOW" ] || return 1
  grep -v '^#' "$ALLOW" | grep -v '^[[:space:]]*$' | grep -Fxq "$rel"
}

fail=0

if [ ! -f "$AASA" ]; then
  echo "FAIL: missing $AASA"
  fail=1
elif grep -q 'TEAMID' "$AASA"; then
  if rel_allowed "apps/pn-unlock/public/.well-known/apple-app-site-association"; then
    echo "WARN: AASA still has TEAMID stub (allowlisted until Apple Team ID is filled)"
  else
    echo "FAIL: AASA still contains TEAMID stub — replace with real Apple Team ID"
    fail=1
  fi
fi

if [ ! -f "$ASSET" ]; then
  echo "FAIL: missing $ASSET"
  fail=1
elif grep -q 'REPLACE_WITH_PLAY_OR_UPLOAD_CERT_SHA256' "$ASSET"; then
  if rel_allowed "apps/pn-unlock/public/.well-known/assetlinks.json"; then
    echo "WARN: assetlinks still has SHA256 stub (allowlisted)"
  else
    echo "FAIL: assetlinks.json still contains REPLACE_WITH_PLAY_OR_UPLOAD_CERT_SHA256"
    fail=1
  fi
fi

# Falsification: allowlist must not grow new stub patterns without a file path.
if [ -f "$ALLOW" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    if [ ! -f "$ROOT/$line" ]; then
      echo "FAIL: allowlist entry missing on disk: $line"
      fail=1
    fi
  done < "$ALLOW"
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "OK: unlock association stub boundary"
