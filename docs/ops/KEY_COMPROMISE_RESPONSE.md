# Key Compromise Response Runbook

Use this runbook when OAuth signing secrets/keys are suspected compromised.

## Trigger conditions

- Suspected leak of `PN_OAUTH_SECRET` (HS256) or RS256 private key/KMS signing identity.
- Unexpected token issuance patterns or unverifiable token signatures.
- Unauthorized admin/config changes affecting OAuth signing vars.

## Immediate containment (first hour)

1. Freeze privileged deploys except incident response.
2. Rotate signing material:
   - HS256: replace `PN_OAUTH_SECRET`.
   - RS256/KMS: rotate to new key version and update env/config.
3. Set/verify `PN_OAUTH_ISSUER` and `PN_OAUTH_AUDIENCE` remain expected values.
4. Invalidate active sessions (revoke refresh tokens and force re-auth where applicable).

## Validation

- Confirm `/oauth/token` issues tokens signed by new material.
- Confirm `/oauth/refresh` behavior is healthy post-rotation.
- Verify clients can still exchange code → token.
- Monitor 5xx/auth error rates for regressions.

## Communication checklist

- [ ] Incident declared with start time and owner.
- [ ] Scope (systems/environments) documented.
- [ ] Stakeholder update sent (engineering + ops).
- [ ] Post-incident timeline recorded.

## Evidence to record

- Rotation timestamp and operator
- Old key retired confirmation
- Validation commands/results
- Any customer-impact window

