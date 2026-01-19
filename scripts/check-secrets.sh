#!/usr/bin/env bash
# Block commits that add API keys or secrets. Run from repo root.
# Detects: Google API keys (AIzaSy), Veriff keys, Coinbase key, Google OAuth client IDs.

set -e

if git diff --cached -U0 | grep '^+' | grep -v '^+++' | grep -qE 'AIzaSy[A-Za-z0-9_-]{20,}|9b59a1b5[0-9a-f-]*|a2f7513b[0-9a-f-]*|c79f3516[0-9a-f-]*|43740774041-[a-z0-9]+\.apps\.googleusercontent\.com'; then
  echo "BLOCKED: Possible API key or secret detected in staged changes."
  echo "Remove it and use an environment variable (e.g. .env or your platform's config)."
  exit 1
fi

exit 0
