#!/usr/bin/env bash
# Bidirectional ROUTE_MANIFEST ↔ API mount drift check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--selftest" ]]; then
  node scripts/check-route-manifest.mjs --selftest
  # Prove failure mode: temporarily claim a fake live route
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  cp docs/developer/ROUTE_MANIFEST.md "$tmp"
  printf '\n| GET | `/api/__synthetic_route_manifest_violation__` | synthetic |\n' >> docs/developer/ROUTE_MANIFEST.md
  if node scripts/check-route-manifest.mjs >/dev/null 2>&1; then
    mv "$tmp" docs/developer/ROUTE_MANIFEST.md
    echo "❌ check-route-manifest selftest: expected failure on synthetic live route" >&2
    exit 1
  fi
  mv "$tmp" docs/developer/ROUTE_MANIFEST.md
  echo "check-route-manifest selftest: OK (synthetic violation fails)"
  exit 0
fi

node scripts/check-route-manifest.mjs
