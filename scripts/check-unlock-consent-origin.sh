#!/usr/bin/env bash
# Ratchet: buildOAuthConsentUrl must target unlock broker, not integrator origins.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/packages/oauth-ui/src/pnOAuthPopup.ts"
if ! grep -q 'resolveUnlockOrigin' "$FILE"; then
  echo "FAIL: buildOAuthConsentUrl must use resolveUnlockOrigin (unlock broker)"
  exit 1
fi
if ! grep -q 'api_endpoint' "$FILE"; then
  echo "FAIL: consent URL must pass api_endpoint for challenge/authenticate host"
  exit 1
fi
# Must not build consent UI on apiEndpoint alone (old path).
if grep -n 'return `\${base}/oauth/consent' "$FILE" >/dev/null 2>&1; then
  echo "FAIL: consent URL still built from API base alone"
  exit 1
fi
echo "OK: unlock consent origin boundary"
