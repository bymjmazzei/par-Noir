/* GENERATED from src/cloudVaultBrowser.ts by 'npm run build:vault-script'. Do not edit by hand. */
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // ../device-cloud-credentials/dist/types.js
  var WEB_GRACE_TTL_MS = 15 * 60 * 1e3;

  // ../device-cloud-credentials/dist/seal.js
  async function deriveKey(session, saltBytes) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(`${session.sessionId}::${session.pnName}::${session.passcode}`), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 1e5,
      hash: "SHA-256"
    }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function unsealCredentials(envelope, session) {
    if (envelope.expiresAt) {
      const exp = Date.parse(envelope.expiresAt);
      if (!Number.isNaN(exp) && Date.now() > exp) {
        throw new Error("Sealed cloud credentials expired (web grace TTL)");
      }
    }
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const key = await deriveKey(session, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.encryptedData));
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
      out[i] = binary.charCodeAt(i);
    return out;
  }

  // ../device-cloud-credentials/dist/stores/webSealedStore.js
  var KEY_PREFIX = "pn_device_cloud_creds_v1:";
  var WebSealedStore = class {
    constructor(storage = globalThis.localStorage) {
      __publicField(this, "storage");
      this.storage = storage;
    }
    async get(identityId) {
      const raw = this.storage.getItem(KEY_PREFIX + identityId);
      if (!raw)
        return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
          await this.clear(identityId);
          return null;
        }
        return parsed;
      } catch (e) {
        return null;
      }
    }
    async set(identityId, envelope) {
      this.storage.setItem(KEY_PREFIX + identityId, JSON.stringify(envelope));
    }
    async clear(identityId) {
      this.storage.removeItem(KEY_PREFIX + identityId);
    }
  };

  // ../device-cloud-credentials/dist/providerToken.js
  var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
  async function postToken(tokenUrl, body) {
    var _a, _b;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok)
      return null;
    const data = await res.json();
    const accessToken = ((_a = data.access_token) == null ? void 0 : _a.trim()) || "";
    if (!accessToken)
      return null;
    const expiresIn = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0 ? data.expires_in : 3600;
    const refreshToken = ((_b = data.refresh_token) == null ? void 0 : _b.trim()) || void 0;
    return { accessToken, refreshToken, expiresIn };
  }
  async function refreshProviderAccessToken(opts) {
    const body = new URLSearchParams({
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      grant_type: "refresh_token"
    });
    if (opts.scope)
      body.set("scope", opts.scope);
    return postToken(opts.tokenUrl, body);
  }

  // ../device-cloud-credentials/dist/driveTokenResolver.js
  var DRIVE_TOKEN_SKEW_MS = 6e4;
  function warnDeadEnd(path, reason) {
    try {
      console.warn("[DriveToken] no usable Drive token", { path, reason });
    } catch (e) {
    }
  }
  function googleAccountsFromEnvelope(env) {
    const envelope = env;
    if (!envelope)
      return [];
    const accounts = envelope.googleDriveAccounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      return accounts;
    }
    return envelope.googleDrive ? [envelope.googleDrive] : [];
  }
  function stringField(acct, ...keys) {
    for (const key of keys) {
      const value = acct[key];
      if (typeof value === "string" && value.trim())
        return value.trim();
    }
    return null;
  }
  function accountAccessToken(acct) {
    return stringField(acct, "access_token", "accessToken");
  }
  function accountRefreshToken(acct) {
    return stringField(acct, "refresh_token", "refreshToken");
  }
  function accountExpiresAtMs(acct) {
    var _a;
    const raw = (_a = acct.expires_at) != null ? _a : acct.expiresAt;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0)
      return null;
    return raw < 1e12 ? raw * 1e3 : raw;
  }
  function isAccessTokenFresh(acct, nowMs = Date.now()) {
    if (!accountAccessToken(acct))
      return false;
    const expiresAt = accountExpiresAtMs(acct);
    if (expiresAt == null)
      return false;
    return expiresAt - DRIVE_TOKEN_SKEW_MS > nowMs;
  }
  function pickGoogleAccount(env) {
    var _a;
    const accounts = googleAccountsFromEnvelope(env);
    if (accounts.length === 0)
      return null;
    return (_a = accounts.find((acct) => accountAccessToken(acct) || accountRefreshToken(acct))) != null ? _a : accounts[0];
  }
  function freshAccessTokenFromEnvelope(env, nowMs = Date.now()) {
    for (const acct of googleAccountsFromEnvelope(env)) {
      if (isAccessTokenFresh(acct, nowMs))
        return accountAccessToken(acct);
    }
    return null;
  }
  async function refreshDriveAccessToken(opts) {
    var _a, _b;
    if (!((_a = opts.clientId) == null ? void 0 : _a.trim()) || !((_b = opts.refreshToken) == null ? void 0 : _b.trim())) {
      warnDeadEnd(opts.path, "no_credentials");
      return { token: null, reason: "no_credentials" };
    }
    let minted;
    try {
      minted = await refreshProviderAccessToken({
        tokenUrl: GOOGLE_TOKEN_URL,
        clientId: opts.clientId.trim(),
        refreshToken: opts.refreshToken.trim()
      });
    } catch (e) {
      warnDeadEnd(opts.path, "refresh_failed");
      return { token: null, reason: "refresh_failed" };
    }
    if (!minted) {
      warnDeadEnd(opts.path, "refresh_rejected");
      return { token: null, reason: "refresh_rejected" };
    }
    return {
      token: minted.accessToken,
      reason: "ok",
      expiresAt: Date.now() + minted.expiresIn * 1e3
    };
  }

  // ../device-cloud-credentials/dist/cloudVault.js
  var CLOUD_VAULT_SEAL_SESSION_ID = "pn-cloud-creds-v1";
  var CLOUD_VAULT_MLKEM_SESSION_ID = "pn-cloud-creds-v1-mlkem";
  function cloudVaultSealSessionFromMlKem(mlKemSecretKey) {
    return {
      sessionId: CLOUD_VAULT_MLKEM_SESSION_ID,
      pnName: "mlkem",
      passcode: mlKemSecretKey
    };
  }
  function canonicalCloudSealSession(pnName, passcode) {
    return {
      sessionId: CLOUD_VAULT_SEAL_SESSION_ID,
      pnName: pnName.trim(),
      passcode
    };
  }
  async function unsealCloudVault(envelope, pnName, passcode) {
    return unsealCredentials(envelope, canonicalCloudSealSession(pnName, passcode));
  }
  async function unsealCloudVaultWithMlKem(envelope, mlKemSecretKey) {
    return unsealCredentials(envelope, cloudVaultSealSessionFromMlKem(mlKemSecretKey));
  }
  async function unsealCloudVaultWithAnyFactor(envelope, factors) {
    const errors = [];
    if (factors.mlKemSecretKey) {
      try {
        return await unsealCloudVaultWithMlKem(envelope, factors.mlKemSecretKey);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "mlkem unseal failed");
      }
    }
    if (factors.pnName && factors.passcode) {
      try {
        return await unsealCloudVault(envelope, factors.pnName, factors.passcode);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "identity unseal failed");
      }
    }
    throw new Error(errors.join("; ") || "No cloud vault unseal factors");
  }
  function isSealedEnvelopeShape(value) {
    if (!value || typeof value !== "object")
      return false;
    const o = value;
    return typeof o.encryptedData === "string" && o.encryptedData.length > 0 && typeof o.iv === "string" && o.iv.length > 0 && typeof o.salt === "string" && o.salt.length > 0 && typeof o.updatedAt === "string";
  }

  // ../user-owned-storage/dist/pnLayout.js
  var METADATA_DIR = "_metadata";
  var INTEGRATORS_DIR = "integrators";
  function metadataPath(...segments) {
    return [METADATA_DIR, ...segments].join("/");
  }
  function integratorPath(clientId, ...segments) {
    return [INTEGRATORS_DIR, clientId, ...segments].join("/");
  }
  var TABLE_PATHS = {
    connections: metadataPath("connections"),
    followers: metadataPath("followers"),
    following: metadataPath("following"),
    notifications: metadataPath("notifications"),
    activityLedger: metadataPath("activity_ledger"),
    engagement: metadataPath("engagement"),
    messagingLedger: metadataPath("messaging_ledger"),
    prismLedger: metadataPath("prism_ledger"),
    preferences: metadataPath("preferences"),
    zkpDataPoints: metadataPath("zkp-data-points"),
    thirdPartyPermissions: metadataPath("third-party-permissions"),
    publicFileIndex: metadataPath("public-file-index"),
    ownerFileIndex: metadataPath("owner-file-index"),
    groups: metadataPath("groups"),
    devices: metadataPath("devices"),
    ownedAssets: metadataPath("owned-assets"),
    recovery: metadataPath("recovery"),
    messageRequests: metadataPath("message_requests"),
    dataPointRequests: metadataPath("data-point-requests")
  };
  var JSON_BLOB_PATHS = {
    profile: metadataPath("profile.json"),
    preferences: metadataPath("preferences.json"),
    devicePolicy: metadataPath("device-policy.json"),
    migrationManifest: integratorPath("_pn_migration_manifest.json")
  };

  // ../device-cloud-credentials/dist/webCloudCredentialLifecycle.js
  var defaultStore = new WebSealedStore();

  // src/cloudVaultBrowser.ts
  async function mintAccessToken(refreshToken, opts) {
    var _a;
    if (!((_a = opts.clientId) == null ? void 0 : _a.trim())) {
      console.warn("[OAuth] Cannot mint Drive token: missing Google client id");
      return null;
    }
    const minted = await refreshDriveAccessToken({
      refreshToken,
      clientId: opts.clientId.trim(),
      path: "unlock"
    });
    if (!minted.token) {
      console.warn("[OAuth] Drive token refresh rejected", { reason: minted.reason });
      return null;
    }
    return minted.token;
  }
  async function accessTokenFromSealedVault(envelope, options) {
    if (!envelope || !isSealedEnvelopeShape(envelope)) return null;
    let credentials;
    try {
      credentials = await unsealCloudVaultWithAnyFactor(envelope, {
        mlKemSecretKey: options.mlKemSecretKey,
        pnName: options.pnName,
        passcode: options.passcode
      });
    } catch (e) {
      console.warn("[OAuth] Cloud vault unseal unavailable");
      return null;
    }
    const fresh = freshAccessTokenFromEnvelope(credentials);
    if (fresh) return fresh;
    const account = pickGoogleAccount(credentials);
    const refreshToken = account ? accountRefreshToken(account) : null;
    if (!refreshToken) {
      console.warn("[OAuth] Sealed vault has no refresh token; Drive token unavailable");
      return null;
    }
    return mintAccessToken(refreshToken, options);
  }
  var api = {
    accessTokenFromSealedVault,
    unsealWithAnyFactor: unsealCloudVaultWithAnyFactor,
    freshTokenFromEnvelope: freshAccessTokenFromEnvelope,
    isAccessTokenFresh,
    isSealedEnvelopeShape
  };
  globalThis.ParNoirCloudVault = api;
})();
