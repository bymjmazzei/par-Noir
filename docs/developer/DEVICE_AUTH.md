# Device authentication and unkeyed session policy

Portable unlock (`.pn` + pN name + passcode) remains available on any device. **Device keys gate privileged owner actions**, not identity decryption.

## Model

| Mode | When | Owner capabilities |
|------|------|-------------------|
| `unkeyed_legacy` | No keyed device registered yet | Full owner access (unchanged) |
| `keyed` | Valid device proof on request | Full owner access |
| `unkeyed_restricted` | After first device keyed; no valid proof | Immutable deny-list blocked; optional allow-list from policy |

## Drive artifacts

- `_metadata/devices.xlsx` — device registry (`deviceId`, `devicePublicKey`, `label`, `status`, …)
- `_metadata/device-policy.json` — `unkeyedAllows`, `firstDeviceKeyedAt`

Managed by `DeviceSheetsService` (API).

## Capabilities

Shared constants and evaluation live in `@par-noir/device-auth`:

- `DEVICE_CAPABILITIES` — capability IDs
- `IMMUTABLE_UNKEYED_DENY` — hardcoded; active once `firstDeviceKeyedAt` is set
- `DEFAULT_UNKEYED_ALLOWS` — default configurable allows
- `evaluateDeviceCapability({ policy, isKeyed, capability })` — pure gate function (API + dashboard)

**Always allowed on unkeyed** (even after first device): `recovery.initiate`, `recovery.read`, `custodian.accept`, `custodian.approve`.

**Immutable deny** (unkeyed after first device): vault writes, custodian manage, migration, export, rotation, device manage, oauth write scopes.

## Device proof (v1)

Software Ed25519 keypair stored in dashboard IndexedDB (`pn-device-keys`). Each mutating owner request from a keyed session includes:

```
X-PN-Device-Id
X-PN-Device-Signature
X-PN-Device-Timestamp
X-PN-Device-Nonce
```

Payload signed: `{ pnIdentifier, deviceId, method, path, bodyHash, timestamp, nonce }` (canonical JSON).

Verified in `deviceCapabilityService.ts`; applied via `assertDeviceCapability` / `requireKeyedDevice` on owner routes.

## Pairing flow

1. **First device:** After unlock + Drive, dashboard **Key this device** → `POST /api/devices/register` (no nonce) → sets `firstDeviceKeyedAt`.
2. **Additional devices:** Keyed device creates nonce → QR/deep link → new device unlocks → generates keypair → register with `pairingNonce`.
3. **Revoke:** Keyed device → `POST /api/devices/:deviceId/revoke`.

Pairing nonces expire in 5 minutes and are single-use (in-memory on API instance).

## Dashboard integration

- `useDeviceAuthState` — registry, policy, `isKeyedSession`, `can(capability)`
- `deviceApiService` / `deviceKeyStorage` — register, pair, sign proofs
- `DeviceManagementPanel` — key device, QR pairing, revoke, unkeyed permission toggles
- UI gates in `App.tsx` (export, custodian manage, rotation) mirror server policy

## API routes

See [ROUTE_MANIFEST.md](./ROUTE_MANIFEST.md) § Device registry.

Gated routes include recovery vault writes, custodian assign/revoke, and all identity migration write endpoints.
