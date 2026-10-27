#!/usr/bin/env bash
# Key 1 / Key 2 inputs must not look like username/password login fields, and Key 1 must
# never be handled as a name.
#
# Ratchet: live unlock/create surfaces must use secretKeyInputProps (React) or
# matching HTML attrs. Never autocomplete=username, name/id=username,
# or a default type="text" Key 1 field.
#
# Key 1 / Key 2 were once called "pN name" / "passcode". Those names may appear only in the
# denylists that reject them (LEGACY_NAME_ALLOW). No nickname or displayName may be
# assigned from Key 1. These two checks always scan apps/, packages/, api/src, core/, sdk/.
#
# Set PN_CHECK_ALL=1 for full scan (CI). Default: staged files that intersect the live set.
# Set PN_FALSIFY=1 to prove the check fails on a synthetic violation (then exit 0 if it did).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LIVE_FILES=(
  apps/id-dashboard/src/components/recovery/RecoveryAuthGate.tsx
  apps/id-dashboard/src/components/recovery/RecoveryKeysModal.tsx
  packages/oauth-ui/src/consentUnlock/ConsentUnlockApp.tsx
)

LEGACY_NAME_ROOTS=(apps packages api/src core sdk)
LEGACY_NAME_PATTERN='pn_?name|passcode'
LEGACY_NAME_ALLOW=(
  api/src/server/modules/pnOAuthRoutes.ts
  api/src/server/modules/brokerPrivateKeys.ts
  api/src/utils/logger.ts
  packages/oauth-ui/src/oauthUnlockProofMint.ts
  packages/oauth-ui/src/oauthUnlockProofMint.test.ts
  packages/oauth-ui/src/handoffSeal.ts
  packages/oauth-ui/src/hostedShell/session.ts
  packages/oauth-ui/src/consentUnlock/mintConsentCode.ts
  packages/oauth-ui/src/consentUnlock/consentUnlock.test.ts
  packages/oauth-ui/src/consentUnlock/vaultEnroll.ts
  packages/standard-data-points/src/blocked.ts
  packages/standard-data-points/src/blocked.test.ts
)
SOURCE_GLOBS=(
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
  --glob '!**/dist-*/**'
  --glob '!**/build/**'
  --glob '!**/static/**'
  --glob '!**/Pods/**'
  --glob '!**/coverage/**'
  --glob '!**/*.md'
  --glob '!**/package-lock.json'
)
# nickname / displayName = <...>key1 or = <...> || <...>key1 (comparisons against Key 1 are fine).
KEY1_NAME_PATTERN='\b(nickname|displayName)\s*[:=]\s*([A-Za-z_$][\w$?]*\.)*[A-Za-z_$]*[kK]ey1\b|\b(nickname|displayName)\s*[:=][^;,]*\|\|\s*([A-Za-z_$][\w$?]*\.)*[A-Za-z_$]*[kK]ey1\b'

violations=""

append_violation() {
  violations="${violations}$1"$'\n'
}

# Avoid grep -q + pipefail SIGPIPE false negatives on large files.
has_match() {
  local pattern="$1"
  local file="$2"
  rg -q -- "$pattern" "$file"
}

is_legacy_allowed() {
  local f="$1"
  local allowed
  for allowed in "${LEGACY_NAME_ALLOW[@]}"; do
    if [ "$f" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

check_key1_names() {
  local line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    if ! is_legacy_allowed "${line%%:*}"; then
      append_violation "$line: legacy Key 1 / Key 2 name (use key1 / key2, \"Key 1\" / \"Key 2\")"
    fi
  done < <(rg -n -i "${SOURCE_GLOBS[@]}" -- "$LEGACY_NAME_PATTERN" "$@" 2>/dev/null || true)

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    append_violation "$line: nickname/displayName assigned from Key 1"
  done < <(rg -n -P "${SOURCE_GLOBS[@]}" -- "$KEY1_NAME_PATTERN" "$@" 2>/dev/null || true)
}

check_file() {
  local file="$1"
  [ -f "$file" ] || return 0

  if has_match 'auto[Cc]omplete=["'\'']username["'\'']' "$file"; then
    append_violation "$file: autocomplete=username on Key form (use secretKeyInputProps / off)"
  fi

  if has_match '\b(id|name)=["'\'']username["'\'']' "$file"; then
    append_violation "$file: id/name=username on Key form (use pn-key-1 / pn-key-2)"
  fi

  # Static type="text" on a Key 1 field (eye toggles use type={cond ? "text" : "password"}).
  if rg -n -- 'type=["'\'']text["'\'']' "$file" | rg -qi 'key.?1|pn.?name|pnName|placeholder=["'\'']pN'; then
    append_violation "$file: Key 1 default type=text (must be password)"
  fi

  # Heuristic: type="text" within 6 lines of a Key 1 label/placeholder.
  if awk '
    BEGIN { bad=0 }
    /Key 1|KEY_1_|Enter Key 1|placeholder=["'\'']Key 1|pN [Nn]ame/ { mark=NR }
    /type=["'\'']text["'\'']/ {
      if (mark && NR-mark <= 6) bad=1
    }
    END { exit bad ? 0 : 1 }
  ' "$file"; then
    append_violation "$file: type=text near Key 1 label (must default to password)"
  fi

  case "$file" in
    *.tsx | *.ts | *.jsx | *.js)
      if ! has_match 'secretKeyInputProps' "$file"; then
        append_violation "$file: missing secretKeyInputProps from @par-noir/oauth-ui"
      fi
      ;;
    *.html)
      if ! has_match 'id="pn-key-1"' "$file"; then
        append_violation "$file: Key 1 input must use id=\"pn-key-1\""
      fi
      if ! has_match 'id="pn-key-2"' "$file"; then
        append_violation "$file: Key 2 input must use id=\"pn-key-2\""
      fi
      if ! has_match 'data-1p-ignore' "$file"; then
        append_violation "$file: missing data-1p-ignore on Key inputs"
      fi
      ;;
  esac
}

if [ "${PN_FALSIFY:-0}" = "1" ]; then
  tmp="$(mktemp "${TMPDIR:-/tmp}/pn-key-markup-XXXXXX.tsx")"
  cat >"$tmp" <<'EOF'
export function Bad() {
  return (
    <form>
      <label>Key 1</label>
      <input type="text" autoComplete="username" name="username" placeholder="Enter Key 1" />
      <input type="password" placeholder="Enter Key 2" />
    </form>
  );
}
EOF
  set +e
  check_file "$tmp"
  set -e
  rm -f "$tmp"
  if [ -z "$violations" ]; then
    echo "❌ falsify failed: synthetic Key 1 username markup was not detected"
    exit 1
  fi

  violations=""
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/pn-key-names-XXXXXX")"
  printf '%s\n' "const pnName = form.value;" >"$tmpdir/legacy.ts"
  printf '%s\n' "const session = { nickname: creds.key1 };" >"$tmpdir/nickname.ts"
  printf '%s\n' "const label = { displayName: saved || newKey1 };" >"$tmpdir/fallback.ts"
  set +e
  check_key1_names "$tmpdir"
  set -e
  rm -rf "$tmpdir"
  for expect in legacy.ts nickname.ts fallback.ts; do
    if ! printf '%s' "$violations" | grep -q "$expect"; then
      echo "❌ falsify failed: $expect was not detected"
      exit 1
    fi
  done
  echo "✅ falsify ok: synthetic violations detected"
  exit 0
fi

is_live() {
  local f="$1"
  local live
  for live in "${LIVE_FILES[@]}"; do
    if [ "$f" = "$live" ]; then
      return 0
    fi
  done
  return 1
}

check_key1_names "${LEGACY_NAME_ROOTS[@]}"

if [ "${PN_CHECK_ALL:-0}" = "1" ]; then
  for file in "${LIVE_FILES[@]}"; do
    check_file "$file"
  done
else
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if is_live "$file"; then
      check_file "$file"
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -n "$violations" ]; then
  echo "❌ check-secret-key-input-markup: Key 1/Key 2 must be handled as secrets"
  printf '%s' "$violations"
  echo "Use secretKeyInputProps('key1'|'key2', mode) from @par-noir/oauth-ui (HTML: id pn-key-1/pn-key-2 + data-1p-ignore)."
  echo "Name the factors key1 / key2 (\"Key 1\" / \"Key 2\" in copy); never derive a nickname from Key 1."
  exit 1
fi

echo "✅ check-secret-key-input-markup: Key input markup ok"
