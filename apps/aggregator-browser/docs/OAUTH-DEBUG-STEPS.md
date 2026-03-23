# Browse app — OAuth debug testing (step by step)

Use this **every time** you need to capture what happens during lock / sign-in on **browse** (`browse.parnoir.com` or local dev on port 3001).

---

## Before you start

1. Use **Chrome or Edge** (or Safari) with **normal** browsing — avoid **Incognito/Private** if `localStorage` is blocked.
2. Use the **main browse tab** for all console commands — **not** the small OAuth popup window and **not** `oauth-callback.html` alone.

---

## Step 1 — Open the browse app

1. Go to: **https://browse.parnoir.com/** (or `http://localhost:3001/` in dev).
2. **Hard refresh** once: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux), or DevTools → Network → **Disable cache** → reload.

---

## Step 2 — Turn OAuth debug **on**

Pick **one** method:

### Method A — From the address bar (recommended)

1. Append to the URL: **`?pn_debug_oauth=1`**  
   Example: `https://browse.parnoir.com/?pn_debug_oauth=1`  
   If you already have query params (e.g. `?view=feed`), use **`&pn_debug_oauth=1`** instead.
2. Press **Enter** so the page loads with that parameter.

### Method B — From the browser console

1. Open DevTools → **Console** on the **main** browse tab.
2. Paste and run:
   ```js
   pnOAuthDebugOn()
   ```
3. The page will **reload** automatically.

---

## Step 3 — Confirm debug is active

In the **Console** on the **same main tab**, run:

```js
pnOAuthDebugStatus()
```

You should see **`"on"`**.

If you see **`"off"`**, repeat Step 2 (Method A or B) and reload.

---

## Step 4 — Run the sign-in flow

1. Click the **lock** control to start **sign-in** (OAuth popup flow).
2. Complete consent in the **popup** as you normally would (do **not** close the popup early unless you’re testing that case).
3. Wait until the flow finishes or fails.

---

## Step 5 — Copy the debug log

Still on the **main** tab (click the page once so it’s focused):

1. Run:
   ```js
   pnOAuthDebugCopy()
   ```
2. The return value is a **JSON string** — you can select/copy it from the console output.  
   (Clipboard may fail if only DevTools is focused; the string is still printed.)

Optional: inspect the array directly:

```js
window.__PN_OAUTH_DEBUG__
```

---

## Step 6 — Turn OAuth debug **off** (when done)

In the **Console**:

```js
pnOAuthDebugOff()
```

The page reloads and debug is cleared.

**Alternative:** visit **`?pn_debug_oauth=0`** (or **`&pn_debug_oauth=0`** if you already have query params).

---

## What the log should show (quick reference)

| You see | Meaning |
|--------|---------|
| `debug_session_ready` | Debug is on; buffer is working. |
| `lock_unlock_popup_open` / `popup_flow_start` | Popup flow started. |
| `popup_payload_ok` / `popup_finish` | Parent received the OAuth callback message. |
| `oauth_resume_effect` / `run_oauth_callback_*` | Main window handled `oauth_resume` or token exchange. |
| `popup_reject` with **`POPUP_CLOSED`** | Popup closed before a successful handoff (or timed out after close). |
| `popup_state_fail` | OAuth `state` mismatch or missing — often another tab or stale session. |

---

## If something doesn’t work

| Problem | What to do |
|--------|------------|
| `pnOAuthDebugStatus is not defined` | Hard refresh; ensure you’re on **browse** (this site’s `index.html` defines helpers). |
| `pnOAuthDebugStatus()` is `'off'` | Do Step 2 again (`pnOAuthDebugOn()` or `?pn_debug_oauth=1`). |
| Clipboard / `NotAllowedError` | Click the **page** once, then run `pnOAuthDebugCopy()` again; or copy the **string** from the console output. |
| Empty log except `debug_session_ready` | You didn’t do Step 4 yet, or debug was off during the attempt. |
| Only **`POPUP_CLOSED`** | See “What the log should show”; next fix is in popup ↔ parent handoff, not the copy helper. |

---

## Apps / paths

- **Browse (this app):** `apps/aggregator-browser` — helpers live in `index.html` + `@par-noir/oauth-ui`.
- **Callback page:** `public/oauth-callback.html` — do **not** run these console steps in the popup unless you’re debugging that document specifically.
