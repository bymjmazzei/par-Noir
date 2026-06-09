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

Pairing nonces expire in 5 minutes and are single-use. When `REDIS_URL` is set, nonces are stored in Redis (`pn:device-pairing:{nonce}`) for multi-instance API deploys; otherwise an in-memory fallback is used (single-instance dev).

## Dashboard integration

- `useDeviceAuthState` — registry, policy, `isKeyedSession`, `can(capability)`
- `deviceApiService` / `@par-noir/device-client` — register, pair, sign proofs
- `DeviceManagementPanel` — key device, QR pairing, revoke, unkeyed permission toggles
- UI gates in `App.tsx` (export, custodian manage, rotation, profile read, custodian read) mirror server policy
- `FileStorageAggregator` — all mutating Drive paths gated with `drive.read` / `drive.upload`; upload/refresh controls disabled when blocked

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

## Owner route capability gates (L2 + API)

After the first device is keyed, owner API routes enforce `evaluateDeviceCapability` via `gateOwnerRoute` in `deviceCapabilityService.ts`. The dashboard sends device proof headers through `ownerApiService` (`ownerFetch` / `ownerGet`).

| Capability | Example routes |
|------------|----------------|
| `profile.read` | `GET /api/profile/:userPnIdentifier` (self-access only; public reads unchanged) |
| `profile.write` | `POST /api/profile/*`, `PUT /api/users/:pn/third-party-permissions`, `PUT /api/users/:pn/zkp-data-points/:id`, feed create/update/delete |
| `drive.read` | `GET /api/drive/files`, `GET /api/drive/files/:fileId` |
| `drive.upload` | `POST/PUT/DELETE /api/drive/files*`, mutating `PUT/POST/DELETE /api/aggregator/metadata-index*` |
| `custodians.read` | `GET /api/recovery/:pn/custodians`, `GET /api/recovery/:pn/vault/pending` |
| `recovery.custodian.manage` | `POST /api/recovery/custodians/assign`, legacy `POST /api/recovery/custodians` (gated) |
| `recovery.vault.write` | `POST /api/recovery/vault/*` |
| `identity.migrate` | `POST/PATCH /api/identity/migration/*` writes |
| `device.manage` | Device registry policy, pairing, revoke, heartbeat |
| `messages.read` | `GET /api/messages/inbox`, `GET /api/messages/conversations`, `GET /api/messages/conversation`, `GET /api/messages/requests`, `GET /api/messages/attachments-folder` |
| `messages.send` | `POST /api/messages/send`, `POST /api/messages/conversation`, `POST /api/messages/requests`, `POST /api/messages/requests/:id/respond`, `POST /api/messages/:id/read`, `DELETE /api/messages/:id`, `DELETE /api/messages/conversation/:participant` |
| `drive.read` (storage) | `GET /api/storage/credentials/:identityId`, `GET /api/storage/owner-index/:identityId` |
| `profile.write` (storage) | `PUT /api/storage/credentials/:identityId` |
| `profile.write` (feeds) | `POST/PUT/DELETE /api/feeds/:feedId/posts`, `PUT /api/feeds/:feedId/top-post` |
| `profile.read` (self) | `GET /api/users/:pn/zkp-data-points`, `GET /api/users/:pn/third-party-permissions` |

**L4 (aggregator-browser):** `@par-noir/device-client` stores keys in IndexedDB; `KeyDeviceBanner` prompts to key the browser; `messageAuthFetch` attaches bearer + device proof on message routes.

**Deferred:** `oauth.write` on developer-portal routes (separate app without IndexedDB device keys).

### Manual E2E checklist

1. Key first device → unkeyed session on another browser: export/custodian manage blocked (UI + API 403).
2. Toggle “Upload to Drive” for unkeyed → unkeyed session can upload; toggle off → 403.
3. Keyed session with device proof: profile edit, drive upload, custodian assign succeed.
4. Legacy `POST /api/recovery/custodians` without device proof returns 403 after first device keyed.
5. Unkeyed dashboard: upload/refresh disabled in storage UI; direct Google mutations blocked client-side.
6. `GET/PUT /api/storage/credentials/:identityId` without bearer or pn mismatch → 401/403.
7. Aggregator: unlock → key device → inbox/send succeed; unkeyed restricted policy → message routes 403.
8. Feed post create without `profile.write` → 403 (dashboard + API).
