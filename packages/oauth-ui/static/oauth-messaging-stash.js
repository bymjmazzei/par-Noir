/**
 * Same-origin messaging OAuth handoff stash — must stay in sync with:
 * packages/oauth-ui/src/messagingOAuthHandoff.ts
 * apps/aggregator-browser/public/oauth-authorize.html
 */
(function (global) {
  'use strict';

  var PN_MESSAGING_OAUTH_HANDOFF_STORAGE = 'pn_messaging_oauth_handoff';
  var PN_MESSAGING_OAUTH_BROADCAST = 'par-noir-messaging-oauth-v1';
  var MESSAGING_IDENTITY_TYPE = 'pn_messaging_identity';
  var MESSAGING_SESSION_TYPE = 'pn_messaging_session';

  function isRecord(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function isMessagingHandoffSession(v) {
    return isRecord(v) && typeof v.mlKemSecretKey === 'string' && v.mlKemSecretKey.length > 0;
  }

  function isMessagingHandoffIdentity(v) {
    return (
      isRecord(v) &&
      typeof v.encryptedData === 'string' &&
      typeof v.iv === 'string' &&
      typeof v.salt === 'string'
    );
  }

  function normalizeMessagingHandoffPayload(v) {
    if (!isRecord(v) || v.v !== 1) return null;
    if (typeof v.timestamp !== 'number' || !isFinite(v.timestamp)) return null;
    var identity = isMessagingHandoffIdentity(v.identity) ? v.identity : undefined;
    var session = isMessagingHandoffSession(v.session) ? v.session : undefined;
    if (!identity && !session) return null;
    return { v: 1, timestamp: v.timestamp, identity: identity, session: session };
  }

  function handoffProvidesMessagingSession(v) {
    return isRecord(v) && isMessagingHandoffSession(v.session);
  }

  function extractMessagingSession(decrypted) {
    if (!decrypted) return null;
    var mlKemSecretKey =
      (decrypted.pqcSecrets && decrypted.pqcSecrets.mlKemSecretKey) ||
      decrypted.mlKemSecretKey;
    if (!mlKemSecretKey) return null;
    var mlKemPublicKey =
      (decrypted.pqcSecrets && decrypted.pqcSecrets.mlKemPublicKey) ||
      decrypted.mlKemPublicKey ||
      undefined;
    return { mlKemSecretKey: mlKemSecretKey, mlKemPublicKey: mlKemPublicKey };
  }

  function buildMessagingIdentityPayload(encryptedIdentity, decrypted) {
    if (
      !encryptedIdentity ||
      !encryptedIdentity.encryptedData ||
      !encryptedIdentity.iv ||
      !encryptedIdentity.salt
    ) {
      return null;
    }
    var mlKem =
      encryptedIdentity.mlKemPublicKey ||
      (decrypted && decrypted.pqcSecrets && decrypted.pqcSecrets.mlKemPublicKey) ||
      (decrypted && decrypted.mlKemPublicKey) ||
      undefined;
    return {
      encryptedData: encryptedIdentity.encryptedData,
      iv: encryptedIdentity.iv,
      salt: encryptedIdentity.salt,
      publicKey: encryptedIdentity.publicKey,
      mlKemPublicKey: mlKem,
    };
  }

  function buildMessagingHandoffFromUnlock(encryptedIdentity, decrypted, timestamp) {
    var session = extractMessagingSession(decrypted);
    var identity = buildMessagingIdentityPayload(encryptedIdentity, decrypted);
    if (!session && !identity) return null;
    return {
      v: 1,
      timestamp: timestamp || Date.now(),
      session: session || undefined,
      identity: identity || undefined,
    };
  }

  function stashMessagingHandoffOnOrigin(payload, options) {
    options = options || {};
    var normalized = normalizeMessagingHandoffPayload(payload);
    if (!normalized) {
      throw new Error('Invalid messaging handoff payload');
    }
    if (options.requireSession && !handoffProvidesMessagingSession(normalized)) {
      throw new Error(
        'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
      );
    }

    try {
      localStorage.setItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE, JSON.stringify(normalized));
    } catch (e) {
      console.warn('[OAuth] messaging handoff localStorage failed', e);
      throw e;
    }

    try {
      var ch = new BroadcastChannel(PN_MESSAGING_OAUTH_BROADCAST);
      ch.postMessage(normalized);
      ch.close();
    } catch (e) {}

    if (options.notifyOpener && window.opener && !window.opener.closed) {
      var origin = window.location.origin;
      if (normalized.identity) {
        try {
          window.opener.postMessage(
            { type: MESSAGING_IDENTITY_TYPE, identity: normalized.identity },
            origin
          );
        } catch (e) {}
      }
      if (normalized.session) {
        try {
          window.opener.postMessage(
            { type: MESSAGING_SESSION_TYPE, session: normalized.session },
            origin
          );
        } catch (e) {}
      }
    }

    return normalized;
  }

  global.ParNoirOAuthMessagingStash = {
    PN_MESSAGING_OAUTH_HANDOFF_STORAGE: PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
    PN_MESSAGING_OAUTH_BROADCAST: PN_MESSAGING_OAUTH_BROADCAST,
    extractMessagingSession: extractMessagingSession,
    buildMessagingIdentityPayload: buildMessagingIdentityPayload,
    buildMessagingHandoffFromUnlock: buildMessagingHandoffFromUnlock,
    stashMessagingHandoffOnOrigin: stashMessagingHandoffOnOrigin,
    normalizeMessagingHandoffPayload: normalizeMessagingHandoffPayload,
    handoffProvidesMessagingSession: handoffProvidesMessagingSession,
  };
})(typeof window !== 'undefined' ? window : globalThis);
