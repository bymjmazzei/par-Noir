/**
 * Saved-pN (device session vault) flow shared by the Mac and phone Unlock apps.
 * Apps supply a platform adapter; this owns overlay, list, save prompt, and manage state.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { consentSearchUsesSavedPn } from '../consentUnlock/parseConsentParams';
import type { ConsentVaultEnrollMaterial, ConsentVaultFactors } from '../consentUnlock/ConsentUnlockApp';
import { isAgentSignInClient, vaultEntriesForClient } from '../hostedShell/agentIdentity';
import {
  SessionVaultEnrollPrompt,
  SessionVaultIdentityPicker,
  SessionVaultUnlockOverlay,
} from '../sessionVaultUi';

/** Structurally matches device-session-vault `UnlockKeysPayload`. */
export type SavedPnEntry = {
  kind: 'unlock_keys';
  identityId: string;
  publicKey: string;
  key1: string;
  key2: string;
  encryptedIdentityJson: string;
  nickname?: string;
};

/** Structurally matches device-session-vault `UnlockIdentityListing` (no secrets). */
export type SavedPnListing = {
  identityId: string;
  publicKey: string;
  nickname?: string;
};

/** Pass a stable (module-level or memoized) object. */
export type UnlockVaultAdapter = {
  isAvailable(): Promise<boolean>;
  hasVault(): Promise<boolean>;
  listIndex(): Promise<SavedPnListing[]>;
  hasIdentity(identityId: string): Promise<boolean>;
  enroll(entry: SavedPnEntry): Promise<void>;
  /** Biometric once, then every saved entry. */
  unlockEntries(reason?: string): Promise<SavedPnEntry[]>;
  remove(identityId: string): Promise<void>;
  label(entry: SavedPnListing): string;
  deviceNoun: 'Mac' | 'device';
  biometricNoun: 'Touch ID' | 'biometrics';
};

type ListState = { mode: 'signin' | 'manage'; entries: SavedPnEntry[] };

export type UnlockSessionVault = {
  /** Pass to ConsentUnlockApp. */
  vaultFactors: ConsentVaultFactors | null;
  onVaultFactorsConsumed: () => void;
  onUnlockedForVault: (material: ConsentVaultEnrollMaterial) => Promise<void>;
  /** Call on every deep link / launch search. Offers Touch ID only for a saved-pN sign-in request. */
  offerForSearch: (search: string) => Promise<boolean>;
  /** Re-read the saved-pN index (e.g. after an agent was saved outside this hook). */
  refresh: () => Promise<void>;
  layer: UnlockSessionVaultLayerState;
};

export type UnlockSessionVaultLayerState = {
  adapter: UnlockVaultAdapter;
  overlayOpen: boolean;
  list: ListState | null;
  enrollOpen: boolean;
  busy: boolean;
  error: string | null;
  savedCount: number;
  factorsActive: boolean;
  unlockForSignIn: () => Promise<void>;
  skipToFullUnlock: () => void;
  openSavedPns: () => Promise<void>;
  continueWith: (identityId: string) => void;
  removeSaved: (identityId: string) => Promise<void>;
  closeList: () => void;
  confirmEnroll: () => Promise<void>;
  declineEnroll: () => void;
};

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** client_id of a request that may use a saved pN; null for none or create. */
export function savedPnSignInClientId(search: string): string | null {
  const raw = search.replace(/^\?/, '');
  const clientId = new URLSearchParams(raw).get('client_id')?.trim();
  if (!clientId || !consentSearchUsesSavedPn(raw)) return null;
  return clientId;
}

function factorsFromEntry(entry: SavedPnEntry): ConsentVaultFactors | null {
  if (!entry.encryptedIdentityJson?.trim() || !entry.key1?.trim() || !entry.key2?.trim()) {
    return null;
  }
  return { key1: entry.key1, key2: entry.key2, encryptedIdentityJson: entry.encryptedIdentityJson };
}

export function useUnlockSessionVault(adapter: UnlockVaultAdapter): UnlockSessionVault {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [list, setList] = useState<ListState | null>(null);
  const [factors, setFactors] = useState<ConsentVaultFactors | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollMaterial, setEnrollMaterial] = useState<ConsentVaultEnrollMaterial | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const enrollWaiters = useRef<Array<() => void>>([]);
  const offerGen = useRef(0);
  /** Prevent double Touch ID prompts for the same overlay offer. */
  const autoTouchIdForOffer = useRef(0);
  const offerClientId = useRef('');

  const refresh = useCallback(async () => {
    const a = adapterRef.current;
    try {
      setSavedCount((await a.isAvailable()) ? (await a.listIndex()).length : 0);
    } catch {
      setSavedCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const offerForSearch = useCallback(
    async (search: string) => {
      const offer = ++offerGen.current;
      setFactors(null);
      setList(null);
      setError(null);
      setOverlayOpen(false);
      await refresh();
      const clientId = savedPnSignInClientId(search);
      if (!clientId) return false;
      const a = adapterRef.current;
      const has = (await a.isAvailable()) && (await a.hasVault());
      if (!has || offer !== offerGen.current) return false;
      offerClientId.current = clientId;
      setOverlayOpen(true);
      return true;
    },
    [refresh]
  );

  const unlockForSignIn = useCallback(async () => {
    const a = adapterRef.current;
    const clientId = offerClientId.current;
    setError(null);
    setBusy(true);
    try {
      const entries = vaultEntriesForClient(await a.unlockEntries(), clientId);
      if (entries.length === 0) {
        setError(
          isAgentSignInClient(clientId)
            ? `No AI agent is saved on this ${a.deviceNoun}. Add one in Dashboard, Sub-pNs.`
            : `No saved pNs on this ${a.deviceNoun}`
        );
        return;
      }
      setOverlayOpen(false);
      setList({ mode: 'signin', entries });
    } catch (e) {
      setError(errorMessage(e, 'Device unlock failed'));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!overlayOpen || busy) return;
    const offer = offerGen.current;
    if (autoTouchIdForOffer.current === offer) return;
    autoTouchIdForOffer.current = offer;
    void unlockForSignIn();
  }, [overlayOpen, busy, unlockForSignIn]);

  const skipToFullUnlock = useCallback(() => {
    setOverlayOpen(false);
    setError(null);
  }, []);

  const openSavedPns = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const entries = await adapterRef.current.unlockEntries('Show saved pNs');
      if (entries.length === 0) {
        setSavedCount(0);
        return;
      }
      setList({ mode: 'manage', entries });
    } catch (e) {
      setError(errorMessage(e, 'Device unlock failed'));
    } finally {
      setBusy(false);
    }
  }, []);

  const continueWith = useCallback(
    (identityId: string) => {
      const entry = list?.entries.find((e) => e.identityId === identityId);
      if (!entry) {
        setError('Selected pN not found');
        return;
      }
      const next = factorsFromEntry(entry);
      if (!next) {
        setError('This saved pN is incomplete. Remove it and unlock with your keys.');
        return;
      }
      setList(null);
      setError(null);
      setFactors(next);
    },
    [list]
  );

  const removeSaved = useCallback(
    async (identityId: string) => {
      setError(null);
      setBusy(true);
      try {
        await adapterRef.current.remove(identityId);
        setList((prev) => {
          if (!prev) return prev;
          const entries = prev.entries.filter((e) => e.identityId !== identityId);
          return entries.length > 0 ? { ...prev, entries } : null;
        });
        await refresh();
      } catch (e) {
        setError(errorMessage(e, 'Could not remove this pN'));
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const closeList = useCallback(() => {
    setList(null);
    setError(null);
  }, []);

  const resolveEnrollWaiters = useCallback(() => {
    const waiters = enrollWaiters.current;
    enrollWaiters.current = [];
    for (const w of waiters) w();
  }, []);

  const onUnlockedForVault = useCallback(async (material: ConsentVaultEnrollMaterial) => {
    const a = adapterRef.current;
    if (!(await a.isAvailable())) return;
    if (await a.hasIdentity(material.identityId)) return;
    setError(null);
    setEnrollMaterial(material);
    await new Promise<void>((resolve) => {
      enrollWaiters.current.push(resolve);
    });
  }, []);

  const confirmEnroll = useCallback(async () => {
    const material = enrollMaterial;
    if (!material) {
      resolveEnrollWaiters();
      return;
    }
    const key1 = material.key1?.trim() ?? '';
    const key2 = material.key2?.trim() ?? '';
    const encryptedIdentityJson = material.encryptedIdentityJson?.trim() ?? '';
    if (!key1 || !key2 || !encryptedIdentityJson) {
      setError('Vault enroll requires identity file, Key 1, and Key 2');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adapterRef.current.enroll({
        kind: 'unlock_keys',
        identityId: material.identityId,
        publicKey: material.publicKey,
        key1,
        key2,
        encryptedIdentityJson,
      });
      setEnrollMaterial(null);
      await refresh();
      resolveEnrollWaiters();
    } catch (e) {
      setError(errorMessage(e, 'Could not enable device unlock'));
    } finally {
      setBusy(false);
    }
  }, [enrollMaterial, refresh, resolveEnrollWaiters]);

  const declineEnroll = useCallback(() => {
    setEnrollMaterial(null);
    setError(null);
    resolveEnrollWaiters();
  }, [resolveEnrollWaiters]);

  const onVaultFactorsConsumed = useCallback(() => setFactors(null), []);

  return {
    vaultFactors: factors,
    onVaultFactorsConsumed,
    onUnlockedForVault,
    offerForSearch,
    refresh,
    layer: {
      adapter,
      overlayOpen,
      list,
      enrollOpen: enrollMaterial != null,
      busy,
      error,
      savedCount,
      factorsActive: factors != null,
      unlockForSignIn,
      skipToFullUnlock,
      openSavedPns,
      continueWith,
      removeSaved,
      closeList,
      confirmEnroll,
      declineEnroll,
    },
  };
}

const savedPnsButtonWrap: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 16,
  zIndex: 150,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'none',
};

const savedPnsButton: CSSProperties = {
  pointerEvents: 'auto',
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid #444',
  background: 'rgba(26,26,26,0.9)',
  color: '#ddd',
  fontSize: 13,
  cursor: 'pointer',
};

/** Overlay, saved-pN list, save prompt, and the main-screen "Saved pNs" button. */
export function UnlockSessionVaultLayer({ vault }: { vault: UnlockSessionVault }) {
  const s = vault.layer;
  const { deviceNoun, biometricNoun } = s.adapter;
  const listOpen = s.list != null && !s.factorsActive;
  const manage = s.list?.mode === 'manage';
  const showSavedButton = s.savedCount > 0 && !s.overlayOpen && !listOpen && !s.enrollOpen && !s.factorsActive;

  return (
    <>
      <SessionVaultUnlockOverlay
        open={s.overlayOpen && !s.factorsActive && !listOpen}
        title="Unlock pN"
        body={`Confirm with ${biometricNoun} to continue with a saved pN.`}
        unlockLabel={`Unlock with ${biometricNoun}`}
        error={s.error}
        busy={s.busy}
        onUnlock={() => void s.unlockForSignIn()}
        onUseFullUnlock={s.skipToFullUnlock}
      />
      <SessionVaultIdentityPicker
        open={listOpen}
        title={manage ? 'Saved pNs' : 'Choose a pN'}
        body={
          manage
            ? `Remove pNs you no longer use on this ${deviceNoun}. Their files and keys elsewhere are not touched.`
            : 'Continue with a saved pN, or remove ones you no longer use.'
        }
        options={(s.list?.entries ?? []).map((e) => ({ identityId: e.identityId, label: s.adapter.label(e) }))}
        busy={s.busy}
        error={s.error}
        selectable={!manage}
        onSelect={s.continueWith}
        onRemove={(id) => void s.removeSaved(id)}
        onUseDifferent={manage ? undefined : s.closeList}
        onCancel={manage ? s.closeList : undefined}
        cancelLabel="Done"
      />
      <SessionVaultEnrollPrompt
        open={s.enrollOpen}
        title={`Save unlock on this ${deviceNoun}?`}
        body={`Next time use ${biometricNoun}, then pick this pN — without re-entering Key 1, Key 2, and your identity file. Only on this personal ${deviceNoun}.`}
        confirmLabel={`Enable with ${biometricNoun}`}
        busy={s.busy}
        error={s.error}
        onConfirm={() => void s.confirmEnroll()}
        onDecline={s.declineEnroll}
      />
      {showSavedButton ? (
        <div style={savedPnsButtonWrap}>
          {s.error ? <span style={{ fontSize: 12, color: '#f87171' }}>{s.error}</span> : null}
          <button type="button" style={savedPnsButton} disabled={s.busy} onClick={() => void s.openSavedPns()}>
            Saved pNs
          </button>
        </div>
      ) : null}
    </>
  );
}
