#!/usr/bin/env bash
# Block commits that add API keys or secrets. Run from repo root.
# Detects: Google API keys (AIzaSy), Veriff keys, Coinbase key, Google OAuth client IDs.

set -e

if git diff --cached -U0 | grep '^+' | grep -v '^+++' | grep -qE 'AIzaSy[A-Za-z0-9_-]{20,}|9b59a1b5[0-9a-f-]*|a2f7513b[0-9a-f-]*|c79f3516[0-9a-f-]*|43740774041-[a-z0-9]+\.apps\.googleusercontent\.com'; then
  echo "BLOCKED: Possible API key or secret detected in staged changes."
  echo "Remove it and use an environment variable (e.g. .env or your platform's config)."
  exit 1
fi

# Optional strict mode for CI full-repo scanning (paths relative to repo root).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${PN_STRICT_GUARDRAILS:-0}" = "1" ]; then
  if rg -n -g'!**/node_modules/**' -g'!**/dist/**' -e 'http://127\.0\.0\.1:|http://localhost:' "$ROOT/apps/aggregator-browser/src" >/dev/null; then
    echo "BLOCKED: localhost/127.0.0.1 runtime endpoint found in aggregator-browser source."
    exit 1
  fi

  if rg -n -g'!**/node_modules/**' -g'!**/dist/**' -e 'drive\.google\.com|googleapis\.com|oauth2\.googleapis\.com' "$ROOT/apps/aggregator-browser/src" >/dev/null; then
    echo "BLOCKED: direct Google endpoint found in aggregator-browser source."
    echo "Use par Noir API endpoints instead."
    exit 1
  fi

  if rg -n -g'!**/node_modules/**' -g'!**/dist/**' -e 'localStorage\.(setItem|getItem)\(\s*["'\'']pn_oauth_(session|callback)' "$ROOT/apps" >/dev/null; then
    echo "BLOCKED: OAuth session/callback artifacts in localStorage are forbidden."
    exit 1
  fi
fi

exit 0
