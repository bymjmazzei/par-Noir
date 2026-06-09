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

## Device-bound `.pn` export (v2, optional)

Portable unlock (`.pn` + pN name + passcode on any device) is unchanged. Users on a **keyed device** may optionally download a **device-bound** backup from Export Options.

### Distinction from session device proof

| Mechanism | Purpose |
|-----------|---------|
| **Session device proof** (API headers) | Gates privileged owner actions on the server |
| **Device-bound KDF** (local file) | Binds ciphertext to this browser’s IndexedDB private key |

The device private key is **never written to the file**. The export envelope may include public hints only: `deviceId`, `devicePublicKey`.

### File format

```json
{
  "version": "1.0",
  "binding": { "type": "device", "deviceId": "…", "devicePublicKey": "…" },
  "identities": [{ "encryptedData", "iv", "salt", "publicKey" }]
}
```

Ciphertext uses the same binding KDF as NFC/USB (`encryptDataWithBinding` / `decryptDataWithBinding` in the dashboard). The binding factor is:

```
base64(HKDF-SHA256(ikm: devicePrivateKeyPkcs8, salt: "pn-device-bound-v1", info: deviceId))
```

Implemented in `@par-noir/device-auth` as `deriveDeviceBindingFactor`.

### Unlock rule

1. Parse `binding.type === 'device'`.
2. Load the matching registration from `deviceKeyStorage` (IndexedDB).
3. If missing or `devicePublicKey` mismatch → *“This backup requires the device that created it…”*
4. Recompute binding factor locally → decrypt with name + passcode.

Copying the file to another machine or browser profile fails at step 2/4 (no private key). Revoking the device in the registry does not erase the local key until the user clears it; the bound file may still unlock in that browser until the key is removed.

### Dashboard

- Export: **Download (device-bound)** in `ExportOptionsModal` (requires keyed session + `identity.export` capability).
- Unlock/import: `deviceBoundPnService` detects device-bound envelopes and routes to `authenticateDeviceBoundPn`.
- Shamir recovery still produces **portable** identity material (unchanged).

### Security notes

- Do not log `deviceBindingFactor`, private keys, or passcodes.
- Device-bound export protects against **file theft**, not malware on the same device (malware can read IndexedDB).
- WebAuthn-bound export and crypto-bound default unlock are out of scope for v2.
