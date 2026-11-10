# Identity Verification

Government ID verification runs through **Stripe Identity** (document scan, selfie match, liveness). It is included in the monetization membership. The dashboard holds no provider keys; everything provider-facing lives on the API.

## Flow

1. **Start** — `IdentityVerificationModal` calls `POST /api/verification/session`. The API (membership required, not already verified) creates a Stripe Identity `VerificationSession` with no pN metadata and returns the hosted `url` plus an API-signed `state` token (`identity-state+jwt`) binding the session to this pN. The dashboard keeps `state` in `localStorage` and redirects to Stripe.
2. **Return** — Stripe sends the user back to `/?verification=identity_return`. Reopening the modal and choosing **Continue verification** asks the API for the decision; while Stripe still needs input it returns a fresh hosted URL.
3. **Finalize** — `POST /api/verification/decision` with `state`. When Stripe has verified the session, the API:
   - signs a `pn-verified+jwt` credential (name and birth date, `provider: stripe_identity`) with the OAuth signing key (checkable via `/.well-known/jwks.json`),
   - sets "this pN is verified until X",
   - returns the person and document fields once,
   - redacts the session at Stripe.
4. **Proofs** — the dashboard mints ML-DSA-signed ZK proofs (name, age with `over_18` / `over_21` computed from the birth date, location, document) on the device and stores them plus the credential in the pN's encrypted Knowledge docs. ID-verified rows are locked until identity rekey / rotation.

## Privacy

- The server stores no identity data and no pN-to-session link; `identity_billed_sessions` only records that a session was billed (no pN column).
- Each pN verifies and pays separately, even with the same document.
- A held credential restores the verified flag (`/api/verification/credential/present`) and moves to a successor pN on rekey (`/api/verification/credential/reissue`).

## Configuration

API only — see `api/.env.example` and `docs/ops/MONETIZATION_KEYS_SETUP.md`:

- `STRIPE_IDENTITY_RESTRICTED_KEY` — restricted key with Identity write and sensitive verification results access.
- `STRIPE_IDENTITY_COST_CENTS` — per-verification cost booked once as creator-fund opex (via the `identity.verification_session.*` Stripe webhook or the decision fetch).

Without the key, the modal shows "Identity verification coming soon".
