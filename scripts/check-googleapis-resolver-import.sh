#!/usr/bin/env bash
# Structural ratchet: any client file that fetches googleapis.com must import
# from @par-noir/device-cloud-credentials.
#
# The older freshness regexes only catch account-shaped envelope reads. They
# miss bare this.token / Bearer ${this.token} field reads entirely. This check
# flags the file that owns the Google fetch rather than each spend site.
#
# Allowlist: scripts/googleapis-resolver-allowlist.txt (burn-down only).
# Set PN_CHECK_ALL=1 to scan the whole repo (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST_FILE="$ROOT/scripts/googleapis-resolver-allowlist.txt"
GOOGLE_FETCH_PATTERN='https://(www\.|oauth2\.)?googleapis\.com/(drive|upload|oauth2)'
IMPORT_PATTERN="@par-noir/device-cloud-credentials"

is_canonical() {
  case "$1" in
    packages/device-cloud-credentials/*) return 0 ;;
    *) return 1 ;;
  esac
}

in_scope() {
  case "$1" in
    packages/oauth-ui/static/*) return 1 ;;
    */dist/* | */dist-messaging/* | */node_modules/*) return 1 ;;
    *.test.ts | *.test.tsx | *.spec.ts | *.gate.test.ts) return 1 ;;
    *.css | *.md | *.json | *.html) return 1 ;;
    apps/id-dashboard/src/* | apps/aggregator-browser/src/* | packages/*/src/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_allowlisted() {
  local file="$1"
  [ -f "$ALLOWLIST_FILE" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | \#*) continue ;;
    esac
    if [ "$line" = "$file" ]; then
      return 0
    fi
  done < "$ALLOWLIST_FILE"
  return 1
}

violations=""
allowlist_hits=""

check_file() {
  local file="$1"

  case "$file" in
    *.ts | *.tsx) ;;
    *) return 0 ;;
  esac

  in_scope "$file" || return 0
  is_canonical "$file" && return 0

  if ! grep -qE "$GOOGLE_FETCH_PATTERN" "$file" 2>/dev/null; then
    return 0
  fi

  if is_allowlisted "$file"; then
    allowlist_hits="${allowlist_hits}${file}"$'\n'
    return 0
  fi

  if ! grep -qF "$IMPORT_PATTERN" "$file" 2>/dev/null; then
    violations="${violations}${file}"$'\n'
  fi
}

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    check_file "$file"
  done < <(rg -l -e "$GOOGLE_FETCH_PATTERN" \
    --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/dist-messaging/**' \
    apps/id-dashboard/src apps/aggregator-browser/src packages 2>/dev/null || true)
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    [ -f "$file" ] || continue
    check_file "$file"
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

# Prove the check fails on a synthetic violation before trusting it.
SYNTH_DIR="$(mktemp -d)"
SYNTH_FILE="$SYNTH_DIR/synthetic-googleapis-violation.ts"
cat > "$SYNTH_FILE" <<'EOF'
export async function bad() {
  await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer dead' },
  });
}
EOF
# Run the same predicates against the synthetic file by temporarily treating
# it as an in-scope path name.
synth_fails=0
if grep -qE "$GOOGLE_FETCH_PATTERN" "$SYNTH_FILE" && ! grep -qF "$IMPORT_PATTERN" "$SYNTH_FILE"; then
  synth_fails=1
fi
rm -rf "$SYNTH_DIR"
if [ "$synth_fails" != "1" ]; then
  echo "BLOCKED: structural googleapis ratchet did not fail on a synthetic violation."
  exit 1
fi

if [ -n "$violations" ]; then
  echo "BLOCKED: googleapis.com fetch without @par-noir/device-cloud-credentials import."
  printf '%s' "$violations" | sed '/^$/d' | sed 's/^/  - /'
  echo
  echo "Import the shared resolver, or (burn-down only) remove an entry from"
  echo "scripts/googleapis-resolver-allowlist.txt after migrating the file."
  echo "See .cursor/rules/diagnostic-discipline.mdc section 4."
  exit 1
fi

if [ -n "$allowlist_hits" ] && [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  echo "OK: googleapis fetchers import the shared resolver (allowlist remaining:)"
  printf '%s' "$allowlist_hits" | sed '/^$/d' | sed 's/^/  - /'
else
  echo "OK: googleapis fetchers import the shared resolver"
fi
exit 0
