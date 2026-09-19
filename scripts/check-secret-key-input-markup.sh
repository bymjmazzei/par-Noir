#!/usr/bin/env bash
# Key 1 / Key 2 inputs must not look like username/password login fields.
#
# Ratchet: live unlock/create surfaces must use secretKeyInputProps (React) or
# matching HTML attrs (oauth-consent). Never autocomplete=username, name/id=username,
# or a default type="text" Key 1 field.
#
# Set PN_CHECK_ALL=1 for full scan (CI). Default: staged files that intersect the live set.
# Set PN_FALSIFY=1 to prove the check fails on a synthetic violation (then exit 0 if it did).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LIVE_FILES=(
  apps/id-dashboard/src/App/UnlockGate.tsx
  apps/id-dashboard/src/App/CreateDidModal.tsx
  apps/id-dashboard/src/App/ImportDidModal.tsx
  apps/id-dashboard/src/components/security/BiometricPasscodeModal.tsx
  apps/id-dashboard/src/components/recovery/RecoveryPasscodeModal.tsx
  apps/id-dashboard/src/components/modals/ExportAuthModal.tsx
  apps/id-dashboard/src/components/modals/ExportToUsbModal.tsx
  apps/id-dashboard/src/components/modals/ExportToNfcModal.tsx
  apps/id-dashboard/src/components/unlock/UnlockFromUsbModal.tsx
  apps/id-dashboard/src/components/unlock/UnlockFromNfcModal.tsx
  apps/id-dashboard/src/pages/SyncReceiver.tsx
  apps/id-dashboard/src/components/identity/IdentityRotationWizard.tsx
  apps/id-dashboard/src/components/subpn/SubPnTab.tsx
  apps/aggregator-browser/src/components/DmCryptoUnlockModal.tsx
  api/src/templates/oauth-consent.html
)

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
      if has_match 'id=["'\'']pnName["'\'']' "$file"; then
        append_violation "$file: legacy id=pnName (rename to pn-key-1)"
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
  echo "✅ falsify ok: synthetic violation detected"
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
  echo "❌ check-secret-key-input-markup: Key 1/Key 2 must not look like username/password login"
  printf '%s' "$violations"
  echo "Use secretKeyInputProps('key1'|'key2', mode) from @par-noir/oauth-ui (HTML: id pn-key-1/pn-key-2 + data-1p-ignore)."
  exit 1
fi

echo "✅ check-secret-key-input-markup: Key input markup ok"
