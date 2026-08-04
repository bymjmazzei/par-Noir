# Device authentication and unkeyed session policy

Portable unlock (`.pn` + pN name + passcode) remains available on any device. **Device keys gate privileged owner actions**, not identity decryption.

## Keyable clients (mobile + desktop apps)

Device **private** keys stay on the install (never on Drive). Only **native** clients may register devices:

- Capacitor mobile (`X-PN-Client-Platform: native-mobile`)
- Electron desktop (`native-desktop`)

Web browsers must not key. UI shows **Download the app**. Web cloud credentials:

- **Case A** (no keyed devices yet): durable sealed local Google tokens across unlocks
- **Case B** (at least one keyed app): session-only cloud; wipe sealed store on lock

### Lost every keyed install

Do **not** clear the registry with unlock alone (that breaks the device gate). Use Recovery → **Reset keyed devices** (`requestType: device_registry_reset`): custodians approve with Shamir/ZK quorum; finalize clears `devices.xlsx` + `firstDeviceKeyedAt`; then key a new first device on a native app.

Dev-only escape: `ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM=1` enables `POST /api/devices/:pn/registry/reset` without quorum — disable after unblocking.

## Model

| Mode | When | Owner capabilities |
|------|------|-------------------|
| `unkeyed_legacy` | No keyed device registered yet | Full owner access (unchanged) |
| `keyed` | Valid device proof on request | Full owner access |
| `unkeyed_restricted` | After first device keyed; no valid proof | Immutable deny-list blocked; optional allow-list from policy |

## Drive artifacts

- `_metadata/devices.xlsx` — device registry (`deviceId`, `devicePublicKey`, `status`, `keyType`, `isPrimary`, `createdAt`, opaque `privateDisplay`, …)
- `_metadata/device-policy.json` — `unkeyedAllows`, `firstDeviceKeyedAt`

Managed by `DeviceSheetsService` (API).

Under **device cloud custody**, the API does not store Google OAuth secrets. Owner device write routes (`register`, policy, revoke, heartbeat) and `POST /api/storage/initialize` accept an ephemeral `X-PN-Cloud-Access-Token` header from the unlocked dashboard so Drive I/O can run without server-held refresh tokens. Credentials PUT merges preserve `pnDriveIndex` so reconnect cannot wipe the layout index.

### Private display seal (client-only)

`label`, `deviceType`, and `lastSeenAt` are **not** stored cleartext for new registrations. The unlocked client seals them with pn name + passcode (AES-GCM / PBKDF2, same parameters as `EncryptionManager.encrypt`) into an opaque `privateDisplay` blob via `@par-noir/device-client`. The API stores and returns the blob without decrypting.

| Clear on storage (API-readable) | Sealed in `privateDisplay` (client-only) |
|---------------------------------|------------------------------------------|
| `deviceId`, `devicePublicKey`, `status`, `keyType`, `isPrimary`, `createdAt` | `label`, `deviceType`, `lastSeenAt` |

- **Register** (`POST /api/devices/register`) requires `privateDisplay`.
- **Heartbeat** (`POST /api/devices/:deviceId/heartbeat`) replaces `privateDisplay` (client refreshes sealed `lastSeenAt`). Capability gates no longer write cleartext last-seen timestamps.
- **Legacy rows** without `privateDisplay` may still show cleartext `label` / `deviceType` / `lastSeenAt` until the next heartbeat upgrades them.

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

### Cloud reconnect + verify new device

| Situation | Behavior |
|-----------|----------|
| No keyed devices | Reconnect prompt is cloud-only. No pair CTA. No unlock alert. |
| Keyed elsewhere, this browser unkeyed | On unlock (after registry loads): `POST /api/devices/unkeyed-unlock-alert`. Reconnect prompt offers **Reconnect** + **Pair this device** (camera/paste). Decline → unkeyed cloud; wipe tokens on lock. |
| This browser keyed | No pair CTA. Polls Drive/portable notifications; **New device unlock** opens Add-device QR. |

**Delivery:** Without mobile push, the keyed device sees the alert when it is unlocked (or on the next notifications poll). Same limit as other Drive-backed notifications until push is productized.

Alert body may include only a coarse device class / opaque fingerprint — never pn name, passcode, email, or other PII.

## Dashboard integration

- `useDeviceAuthState` — registry, policy, `isKeyedSession`, `can(capability)`
- `@par-noir/device-client` — `sealDevicePrivateDisplay` / `unsealDevicePrivateDisplay` (AES-GCM; same PBKDF2 params as `EncryptionManager.encrypt(pnName, passcode)`)
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
