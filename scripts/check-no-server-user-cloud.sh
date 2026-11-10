#!/usr/bin/env bash
# The server never touches a user's cloud.
#
# No code in api/src may call a user's storage (Google Drive/Sheets, Dropbox,
# OneDrive, S3, Azure Blob, FTP/SFTP), import a client for it, or accept a cloud
# token from the device. Owner writes run on the device and post a receipt;
# writes for other users go through the mailbox and are applied by their device.
#
# Fixed exceptions (no allowlist file; this list only ever shrinks):
#   - publicBlobAccess.ts: anonymous reads of files the user made public, by
#     public URL or the platform API key. It may never send a bearer token.
#   - feedPreviewR2.ts: the platform's own R2 bucket via the S3 SDK.
# GCP KMS and YouTube use other googleapis.com hosts and are not matched.
#
# Tests and api/src/static (browser bundles served to devices) are not scanned.
# Set PN_CHECK_ALL=1 to scan all of api/src instead of staged changes (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUBLIC_READ=api/src/server/modules/publicBlobAccess.ts
PLATFORM_R2=api/src/server/modules/feedPreviewR2.ts

CLIENT_LIBS='googleapis|@googleapis/[a-z-]+|@azure/storage-blob|dropbox|@microsoft/microsoft-graph-client|basic-ftp|ftp|promise-ftp|jsftp|ssh2|ssh2-sftp-client'

# name|extended regex|exempt file (empty for none)
RULES=(
  "Google Drive/Sheets host|googleapis\.com/(drive|upload)|sheets\.googleapis\.com|docs\.google\.com/spreadsheets|${PUBLIC_READ}"
  "Dropbox API host|dropboxapi\.com|"
  "Microsoft Graph (OneDrive) host|graph\.microsoft\.com|"
  "Azure Blob host|blob\.core\.windows\.net|"
  "S3 host|s3[.-][a-z0-9.-]*amazonaws\.com|"
  "S3 SDK client|['\"]@aws-sdk/(client-s3|lib-storage|s3-request-presigner)['\"]|${PLATFORM_R2}"
  "user-cloud client library|(from|require\()[[:space:]]*['\"](${CLIENT_LIBS})['\"]|"
  "forwarded cloud token header|[Cc]loud-[Aa]ccess-[Tt]oken|"
)

violations=""

check_file() {
  local file="$1" content="$2"
  case "$file" in
    api/src/static/*) return 0 ;;
    *.test.ts | */__tests__/*) return 0 ;;
    api/src/*.ts | api/src/**/*.ts | api/src/*.js | api/src/**/*.js) ;;
    *) return 0 ;;
  esac

  local rule name pattern exempt
  for rule in "${RULES[@]}"; do
    name="${rule%%|*}"
    exempt="${rule##*|}"
    pattern="${rule#*|}"
    pattern="${pattern%|*}"
    [ -n "$exempt" ] && [ "$file" = "$exempt" ] && continue
    if printf '%s' "$content" | grep -qE "$pattern"; then
      violations="${violations}${file} (${name})"$'\n'
    fi
  done

  if [ "$file" = "$PUBLIC_READ" ] && printf '%s' "$content" | grep -qE 'Bearer|[Aa]uthorization'; then
    violations="${violations}${file} (public reads must be anonymous)"$'\n'
  fi
}

check_deps() {
  local content="$1"
  if printf '%s' "$content" | grep -qE "\"(${CLIENT_LIBS})\"[[:space:]]*:"; then
    violations="${violations}api/package.json (user-cloud client dependency)"$'\n'
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file" "$(cat "$file")"
  done < <(rg --files api/src -g '*.ts' -g '*.js' 2>/dev/null || true)
  check_deps "$(cat api/package.json)"
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ "$file" = "api/package.json" ]; then
      check_deps "$(git show ":$file" 2>/dev/null || true)"
    else
      check_file "$file" "$(git show ":$file" 2>/dev/null || true)"
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: the API must never touch a user's cloud."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Owner reads and writes run on the device (packages/device-cloud-credentials)"
  echo "and post a deviceCloudResult receipt. Writes for another user are mailbox"
  echo "jobs applied by their device. Do not forward cloud tokens to the API."
  echo "See docs/architecture/ADR_DEVICE_CLOUD_CUSTODY.md."
  exit 1
fi

echo "OK: no server code touches a user's cloud"
exit 0
