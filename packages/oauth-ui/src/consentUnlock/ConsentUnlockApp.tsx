/**
 * Canonical OAuth consent + unlock UI (hosted at unlock.parnoir.com / pn-unlock app).
 * Local decrypt only; authenticate body is public_key + signature.
 * Modes: File / USB / NFC (USB+NFC via API oauth-physical-unlock.js).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { secretKeyInputProps, SECRET_KEY_FORM_ATTRS } from '../secretKeyInputAttrs';
import { isMessagingHandoffClient } from './constants';
import {
  decryptIdentityFileLocal,
  parseIdentityFileJson,
  type DecryptedIdentityRecord,
  type UnlockedIdentityBundle,
} from './decryptIdentityLocal';
import {
  mintConsentAuthorizationCode,
  requestedDataPointIds,
  requestsCloudAccess,
  scopeNeedsConsentScreen,
} from './mintConsentCode';
import { parseConsentUnlockParams, type ConsentUnlockParams } from './parseConsentParams';
import {
  loadParNoirOAuthPhysical,
  physicalResultToBundle,
  type NfcIdentityPayload,
} from './physicalUnlockLoader';
import { denyOAuthConsent, redirectWithAuthCode } from './redirectWithAuthCode';
import { consentUnlockCss, resolveConsentAssetBase } from './consentUnlockStyles';
import { toUnlockVaultEnrollMaterial } from './vaultEnroll';

/** Factors + sealed identity for biometric vault re-mint (never sent to API). */
export type ConsentVaultFactors = {
  pnName: string;
  passcode: string;
  /** JSON of EncryptedIdentityRow (or single-identity file shape). */
  encryptedIdentityJson: string;
};

/** Material the host may seal into device-session-vault after a successful local unlock. */
export type ConsentVaultEnrollMaterial = {
  identityId: string;
  publicKey: string;
  pnName: string;
  passcode: string;
  encryptedIdentityJson: string;
};

export type ConsentUnlockAppProps = {
  /** Override search string (tests / deep links). Default: window.location.search */
  search?: string;
  apiEndpointDefault?: string;
  /** Capacitor: open redirect_uri outside the unlock WebView */
  openExternal?: (url: string) => void | Promise<void>;
  /** Optional branding asset base for logo / background (defaults to page origin) */
  assetBase?: string;
  /**
   * When set (native biometric path), decrypt + mint without the factor form.
   * Host should clear after consume to avoid re-entry loops.
   */
  vaultFactors?: ConsentVaultFactors | null;
  /** Fired after successful local decrypt (before redirect); host may offer vault enroll. */
  onUnlockedForVault?: (material: ConsentVaultEnrollMaterial) => void | Promise<void>;
  /** Called once vaultFactors path finishes or fails so the host can clear vaultFactors. */
  onVaultFactorsConsumed?: () => void;
};

type Step = 'unlock' | 'consent';
type UnlockMode = 'file' | 'usb' | 'nfc';
type DataPointChoice = '' | 'shared' | 'not-shared';

function EyeIcon({ open }: { open: boolean }): React.ReactElement {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function FileDrop(props: {
  hasFile: boolean;
  title: string;
  hint?: string;
  inputId: string;
  accept?: string;
  onFile: (file: File | null) => void;
}): React.ReactElement {
  const open = () => document.getElementById(props.inputId)?.click();
  return (
    <div
      className={`file-upload-area${props.hasFile ? ' has-file' : ''}`}
      onClick={open}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') open();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="upload-icon">↑</div>
      <div className="file-name">{props.title}</div>
      {props.hint ? <div className="file-hint">{props.hint}</div> : null}
      <input
        id={props.inputId}
        type="file"
        accept={props.accept}
        onChange={(ev) => props.onFile(ev.target.files?.[0] || null)}
      />
    </div>
  );
}

export function ConsentUnlockApp(props: ConsentUnlockAppProps): React.ReactElement {
  const params = useMemo(
    () =>
      parseConsentUnlockParams(props.search ?? (typeof window !== 'undefined' ? window.location.search : ''), {
        apiEndpoint: props.apiEndpointDefault,
        redirectUriFallbackOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    [props.search, props.apiEndpointDefault]
  );

  return (
    <ConsentUnlockInner
      params={params}
      openExternal={props.openExternal}
      assetBase={props.assetBase}
      vaultFactors={props.vaultFactors}
      onUnlockedForVault={props.onUnlockedForVault}
      onVaultFactorsConsumed={props.onVaultFactorsConsumed}
    />
  );
}

function ConsentUnlockInner(props: {
  params: ConsentUnlockParams;
  openExternal?: (url: string) => void | Promise<void>;
  assetBase?: string;
  vaultFactors?: ConsentVaultFactors | null;
  onUnlockedForVault?: (material: ConsentVaultEnrollMaterial) => void | Promise<void>;
  onVaultFactorsConsumed?: () => void;
}): React.ReactElement {
  const {
    params,
    openExternal,
    assetBase,
    vaultFactors,
    onUnlockedForVault,
    onVaultFactorsConsumed,
  } = props;
  const [step, setStep] = useState<Step>('unlock');
  const [unlockMode, setUnlockMode] = useState<UnlockMode>('file');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [fileName, setFileName] = useState('');
  const [identityJson, setIdentityJson] = useState<unknown>(null);
  const [usbKeyName, setUsbKeyName] = useState('');
  const [usbKeyText, setUsbKeyText] = useState<string | null>(null);
  const [usbPayloadName, setUsbPayloadName] = useState('');
  const [usbPayloadText, setUsbPayloadText] = useState<string | null>(null);
  const [usbDrivePasscode, setUsbDrivePasscode] = useState('');
  const [nfcPayload, setNfcPayload] = useState<NfcIdentityPayload | null>(null);
  const [nfcStatus, setNfcStatus] = useState('');
  const [nfcScanning, setNfcScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showKey1, setShowKey1] = useState(false);
  const [showKey2, setShowKey2] = useState(false);

  const [authCode, setAuthCode] = useState<string | null>(null);
  const [pnIdentifier, setPnIdentifier] = useState('');
  const [bundle, setBundle] = useState<UnlockedIdentityBundle | null>(null);
  const [dataPointChoices, setDataPointChoices] = useState<Record<string, DataPointChoice>>({});
  const [availableDataPoints, setAvailableDataPoints] = useState<Record<
    string,
    { available: boolean; reason?: string }
  > | null>(null);
  const [catalog, setCatalog] = useState<Record<string, { name?: string; description?: string }>>({});

  const dataPointIds = useMemo(() => requestedDataPointIds(params.scope), [params.scope]);
  const needsConsent = scopeNeedsConsentScreen(params.scope);
  const cloudAccess = requestsCloudAccess(params.scope);
  const integrator = params.scope.split(/\s+/).includes('cloud:app');

  useEffect(() => {
    if (unlockMode === 'usb' || unlockMode === 'nfc') {
      void loadParNoirOAuthPhysical(params.apiEndpoint).catch(() => {
        /* surfaced on unlock / scan */
      });
    }
  }, [unlockMode, params.apiEndpoint]);

  const changeMode = useCallback((mode: UnlockMode) => {
    setUnlockMode(mode);
    setError(null);
    if (mode !== 'nfc') {
      setNfcPayload(null);
      setNfcStatus('');
    }
  }, []);

  const onFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setIdentityJson(JSON.parse(text));
  }, []);

  const onUsbKey = useCallback(async (file: File | null) => {
    if (!file) return;
    setUsbKeyName(file.name);
    setUsbKeyText(await file.text());
  }, []);

  const onUsbPayload = useCallback(async (file: File | null) => {
    if (!file) {
      setUsbPayloadName('');
      setUsbPayloadText(null);
      return;
    }
    setUsbPayloadName(file.name);
    setUsbPayloadText(await file.text());
  }, []);

  const onNfcScan = useCallback(async () => {
    setError(null);
    setNfcScanning(true);
    setNfcStatus('Hold your card near the phone…');
    try {
      const physical = await loadParNoirOAuthPhysical(params.apiEndpoint);
      if (!physical.hasNfc()) {
        setNfcStatus('NFC requires Chrome on Android (Web NFC).');
        setNfcPayload(null);
        return;
      }
      const payload = await physical.readNfcIdentity();
      setNfcPayload(payload);
      setNfcStatus('Card read. Enter Key 1 and Key 2, then Unlock.');
    } catch (err) {
      setNfcPayload(null);
      setNfcStatus(err instanceof Error ? err.message : 'NFC read failed');
    } finally {
      setNfcScanning(false);
    }
  }, [params.apiEndpoint]);

  const finishWithCode = useCallback(
    async (
      code: string,
      granted: string[],
      consentShown: boolean,
      unlocked: UnlockedIdentityBundle
    ) => {
      await redirectWithAuthCode({
        code,
        redirectUri: params.redirectUri,
        state: params.state,
        popupFlow: params.popup,
        clientId: params.clientId,
        grantedDataPoints: granted,
        consentShown,
        encryptedIdentity: unlocked.encryptedIdentity,
        decryptedIdentity: unlocked.decryptedIdentity,
        openExternal,
      });
    },
    [params, openExternal]
  );

  const loadCatalog = useCallback(async () => {
    if (dataPointIds.length === 0) return;
    try {
      const res = await fetch(`${params.apiEndpoint}/api/v1/standard-data-points`);
      if (!res.ok) return;
      const body = await res.json();
      const rows = body.dataPoints || body.data_points || body;
      if (!Array.isArray(rows)) return;
      const next: Record<string, { name?: string; description?: string }> = {};
      for (const row of rows) {
        if (row?.id) next[row.id] = row;
      }
      setCatalog(next);
    } catch {
      /* ignore */
    }
  }, [dataPointIds.length, params.apiEndpoint]);

  const notifyVault = useCallback(
    async (unlocked: UnlockedIdentityBundle, key1: string, key2: string) => {
      if (!onUnlockedForVault) return;
      await onUnlockedForVault(toUnlockVaultEnrollMaterial(unlocked, key1, key2));
    },
    [onUnlockedForVault]
  );

  const afterUnlock = useCallback(
    async (unlocked: UnlockedIdentityBundle, key1: string, key2: string) => {
      setBundle(unlocked);
      const mint = await mintConsentAuthorizationCode({
        apiEndpoint: params.apiEndpoint,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        scope: params.scope,
        state: params.state,
        nonce: params.nonce,
        publicKey: unlocked.publicKey,
        decryptedIdentity: unlocked.decryptedIdentity as DecryptedIdentityRecord,
      });

      setAuthCode(mint.code);
      setPnIdentifier(mint.pnIdentifier);

      // Cross-process broker (Electron/Cap openExternal): hand off to the caller
      // immediately. Grant lookup has no cloud AT here, so "existingGrant" is
      // almost always null and showing consent re-asks permissions before browse
      // ever gets the code. Browse checks grants after session + cloud hydrate.
      if (openExternal) {
        await finishWithCode(
          mint.code,
          mint.existingGrant?.dataPoints || [],
          false,
          unlocked
        );
        await notifyVault(unlocked, key1, key2);
        return;
      }

      await notifyVault(unlocked, key1, key2);

      if (mint.existingGrant) {
        await finishWithCode(mint.code, mint.existingGrant.dataPoints || [], false, unlocked);
        return;
      }
      if (!needsConsent) {
        await finishWithCode(mint.code, [], false, unlocked);
        return;
      }

      setAvailableDataPoints(mint.availableDataPoints ?? null);
      await loadCatalog();
      const initial: Record<string, DataPointChoice> = {};
      for (const id of dataPointIds) initial[id] = '';
      setDataPointChoices(initial);
      setStep('consent');
    },
    [params, needsConsent, finishWithCode, loadCatalog, dataPointIds, notifyVault, openExternal]
  );

  /** Biometric vault path: decrypt sealed identity + mint without the factor form. */
  useEffect(() => {
    if (!vaultFactors?.encryptedIdentityJson || !vaultFactors.pnName || !vaultFactors.passcode) {
      return;
    }
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const raw = JSON.parse(vaultFactors.encryptedIdentityJson) as unknown;
        const row = parseIdentityFileJson(raw);
        const unlocked = await decryptIdentityFileLocal(
          row,
          vaultFactors.pnName,
          vaultFactors.passcode
        );
        if (cancelled) return;
        await afterUnlock(unlocked, vaultFactors.pnName, vaultFactors.passcode);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Biometric unlock failed');
          setStep('unlock');
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          onVaultFactorsConsumed?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when vaultFactors identity changes (host clears after consume).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: vaultFactors object identity
  }, [vaultFactors]);

  const onUnlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      setError(null);
      if (!pnName || !passcode) {
        setError('Please enter Key 1 and Key 2');
        return;
      }

      if (unlockMode === 'file' && !identityJson) {
        setError('Please select your pN identity file');
        return;
      }
      if (unlockMode === 'usb') {
        if (!usbKeyText || !usbDrivePasscode) {
          setError('Select the key file and enter the drive passcode');
          return;
        }
      }
      if (unlockMode === 'nfc' && !nfcPayload) {
        setError('Tap NFC card first, then enter Key 1 and Key 2');
        return;
      }

      setBusy(true);
      try {
        let unlocked: UnlockedIdentityBundle;

        if (unlockMode === 'nfc') {
          const physical = await loadParNoirOAuthPhysical(params.apiEndpoint);
          const result = await physical.unlockBoundIdentity(
            nfcPayload!.boundPnBlob,
            nfcPayload!.uid,
            pnName,
            passcode
          );
          unlocked = physicalResultToBundle(result) as UnlockedIdentityBundle;
        } else if (unlockMode === 'usb') {
          const physical = await loadParNoirOAuthPhysical(params.apiEndpoint);
          const result = await physical.unlockFromUsbKeyAndPayload(
            usbKeyText!,
            usbDrivePasscode,
            usbPayloadText,
            pnName,
            passcode
          );
          unlocked = physicalResultToBundle(result) as UnlockedIdentityBundle;
        } else {
          const row = parseIdentityFileJson(identityJson);
          unlocked = await decryptIdentityFileLocal(row, pnName, passcode);
        }

        await afterUnlock(unlocked, pnName, passcode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unlock');
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      pnName,
      passcode,
      unlockMode,
      identityJson,
      usbKeyText,
      usbDrivePasscode,
      usbPayloadText,
      nfcPayload,
      params.apiEndpoint,
      afterUnlock,
    ]
  );

  const onApprove = useCallback(async () => {
    if (!authCode || !bundle) return;
    for (const id of dataPointIds) {
      const offerable =
        availableDataPoints &&
        availableDataPoints[id] &&
        availableDataPoints[id].available === true;
      if (!offerable) continue;
      if (!dataPointChoices[id]) {
        setError('Please choose whether to share each requested proof');
        return;
      }
    }
    const granted = dataPointIds.filter((id) => dataPointChoices[id] === 'shared');
    setBusy(true);
    try {
      await finishWithCode(authCode, granted, true, bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete unlock');
      setBusy(false);
    }
  }, [authCode, bundle, dataPointIds, dataPointChoices, availableDataPoints, finishWithCode]);

  const key1Props = secretKeyInputProps('key1', 'unlock');
  const key2Props = secretKeyInputProps('key2', 'unlock');
  const resolvedAssetBase = resolveConsentAssetBase(assetBase);
  const logoSrc = `${resolvedAssetBase}/branding/Par-Noir-Logo-White.png`;

  let redirectHost = params.redirectUri;
  try {
    redirectHost = new URL(params.redirectUri).hostname;
  } catch {
    /* keep */
  }

  const genericScopes = params.scope
    .split(/\s+/)
    .filter((s) => s && !s.startsWith('datapoint:') && s !== 'cloud:app' && !s.startsWith('cloud:'));

  return (
    <div className="pn-consent-page">
      <style>{consentUnlockCss(resolvedAssetBase)}</style>
      <div className="container">
        <div className="header">
          <div className="logo-container">
            <img src={logoSrc} alt="par Noir" />
          </div>
        </div>

        {step === 'unlock' && vaultFactors ? (
          <div className="form-container">
            <div className="step-indicator">Unlocking with biometrics…</div>
            {error ? <div className="error">{error}</div> : null}
            {busy ? <span className="loading" /> : null}
          </div>
        ) : null}

        {step === 'unlock' && !vaultFactors && (
          <div className="form-container">
            <div className="step-indicator">Step 1: Unlock Your pN</div>

            <div className="mode-row" role="tablist" aria-label="Unlock method">
              <button
                type="button"
                className={`mode-btn${unlockMode === 'file' ? ' active' : ''}`}
                onClick={() => changeMode('file')}
              >
                File
              </button>
              <button
                type="button"
                className={`mode-btn${unlockMode === 'usb' ? ' active' : ''}`}
                onClick={() => changeMode('usb')}
              >
                USB
              </button>
              <button
                type="button"
                className={`mode-btn${unlockMode === 'nfc' ? ' active' : ''}`}
                onClick={() => changeMode('nfc')}
              >
                NFC
              </button>
            </div>

            <form {...SECRET_KEY_FORM_ATTRS} onSubmit={onUnlock}>
              {unlockMode === 'file' && (
                <div className="form-group">
                  <label>pN Identity File</label>
                  <FileDrop
                    hasFile={!!fileName}
                    title={fileName || 'Tap to upload pN file'}
                    hint="(.did or .json files)"
                    inputId="pn-identity-file"
                    accept=".did,.json,.pn,.id,.identity,application/json"
                    onFile={(f) => void onFile(f)}
                  />
                </div>
              )}

              {unlockMode === 'usb' && (
                <>
                  <p className="physical-hint">
                    Use the same USB backup as in the dashboard: key file (and payload if you use two
                    files), plus the drive passcode you set when exporting.
                  </p>
                  <div className="form-group">
                    <label>Key file (parnoir-key.enc)</label>
                    <FileDrop
                      hasFile={!!usbKeyName}
                      title={usbKeyName || 'Select key file'}
                      inputId="pn-usb-key"
                      accept=".enc,application/octet-stream,text/plain,.json"
                      onFile={(f) => void onUsbKey(f)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Drive passcode</label>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="Passcode for USB key file"
                      value={usbDrivePasscode}
                      onChange={(ev) => setUsbDrivePasscode(ev.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payload file (if separate)</label>
                    <FileDrop
                      hasFile={!!usbPayloadName}
                      title={usbPayloadName || 'Optional — parnoir-payload.enc'}
                      inputId="pn-usb-payload"
                      accept=".enc,application/json,text/plain"
                      onFile={(f) => void onUsbPayload(f)}
                    />
                  </div>
                </>
              )}

              {unlockMode === 'nfc' && (
                <>
                  <p className="physical-hint">
                    Hold your NFC card or fob to the back of your phone (Chrome on Android). Then enter
                    Key 1 and Key 2 below.
                  </p>
                  <button
                    type="button"
                    className="btn-primary btn-full"
                    style={{ marginBottom: 8 }}
                    disabled={nfcScanning || busy}
                    onClick={() => void onNfcScan()}
                  >
                    {nfcScanning ? 'Scanning…' : 'Tap NFC card'}
                  </button>
                  <div className={`nfc-status${nfcPayload ? ' ok' : ''}`}>{nfcStatus}</div>
                </>
              )}

              <div className="form-group">
                <label>Key 1</label>
                <div className="input-wrapper">
                  <input
                    {...key1Props}
                    type={showKey1 ? 'text' : 'password'}
                    placeholder="Enter Key 1"
                    value={pnName}
                    onChange={(ev) => setPnName(ev.target.value)}
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    aria-label="Toggle Key 1 visibility"
                    onClick={() => setShowKey1((v) => !v)}
                  >
                    <EyeIcon open={showKey1} />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Key 2</label>
                <div className="input-wrapper">
                  <input
                    {...key2Props}
                    type={showKey2 ? 'text' : 'password'}
                    placeholder="Enter Key 2"
                    value={passcode}
                    onChange={(ev) => setPasscode(ev.target.value)}
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    aria-label="Toggle Key 2 visibility"
                    onClick={() => setShowKey2((v) => !v)}
                  >
                    <EyeIcon open={showKey2} />
                  </button>
                </div>
              </div>

              {error ? <div className="error">{error}</div> : null}

              <button type="submit" className="btn-primary btn-full" disabled={busy}>
                {busy ? (
                  <>
                    <span className="loading" />
                    Unlocking…
                  </>
                ) : (
                  'Unlock pN'
                )}
              </button>
            </form>
          </div>
        )}

        {step === 'consent' && (
          <div className="form-container">
            <div className="step-indicator">Step 2: Authorize Application</div>

            <div className="app-info">
              <div className="app-icon">
                <img src={logoSrc} alt="par Noir" />
              </div>
              <div className="app-details">
                <div className="app-name">{params.clientId}</div>
                <div className="app-url">{redirectHost}</div>
              </div>
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="permissions-list">
              <div className="permission-item">
                <div className="permission-text">
                  <div className="permission-title">
                    pN Identifier <span className="required-badge">(Required)</span>
                  </div>
                  <div className="permission-desc">{pnIdentifier || '…'}</div>
                </div>
              </div>

              {integrator && (
                <div className="permission-item">
                  <div className="permission-text">
                    <div className="permission-title">App storage on your Drive</div>
                    <div className="permission-desc">
                      This app may store its own files in your par Noir folder under{' '}
                      <strong>integrators/{params.clientId}/</strong>. Standard pN data points stay in
                      your pN metadata and are shared only through par Noir APIs, not copied into this
                      folder.
                    </div>
                  </div>
                </div>
              )}

              {!isMessagingHandoffClient(params.clientId) && genericScopes.length > 0 && (
                <div className="permission-item">
                  <div className="permission-text">
                    <div className="permission-title">Requested permissions</div>
                    <div className="permission-desc">{genericScopes.join(', ')}</div>
                  </div>
                </div>
              )}

              {cloudAccess && (
                <div className="permission-item">
                  <div className="permission-text">
                    <div className="permission-title">
                      Secure Cloud Access <span className="required-badge">(Required)</span>
                    </div>
                    <div className="permission-desc">
                      Access your media, companion metadata, and engagements stored in your secure cloud
                    </div>
                  </div>
                </div>
              )}

              {dataPointIds.map((id) => {
                const meta = catalog[id] || {};
                const offerable =
                  availableDataPoints &&
                  availableDataPoints[id] &&
                  availableDataPoints[id].available === true;
                return (
                  <div key={id} className="permission-item">
                    <div className="permission-text">
                      <div className="permission-title">{meta.name || id}</div>
                      <div className="permission-desc">
                        {offerable
                          ? meta.description || `Share this proof with ${params.clientId}`
                          : availableDataPoints == null
                            ? 'Proof availability unknown (cloud not readable during unlock).'
                            : 'You do not have this proof available to share.'}
                      </div>
                    </div>
                    {offerable && (
                      <select
                        className="permission-select"
                        value={dataPointChoices[id] || ''}
                        onChange={(ev) =>
                          setDataPointChoices((prev) => ({
                            ...prev,
                            [id]: ev.target.value as DataPointChoice,
                          }))
                        }
                      >
                        <option value="">Select…</option>
                        <option value="shared">Share</option>
                        <option value="not-shared">Don&apos;t Share</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="button-group">
              <button
                type="button"
                className="btn-cancel"
                disabled={busy}
                onClick={() =>
                  denyOAuthConsent({
                    redirectUri: params.redirectUri,
                    state: params.state,
                    popupFlow: params.popup,
                    openExternal,
                  })
                }
              >
                Deny
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void onApprove()}>
                {busy ? 'Continuing…' : 'Approve'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConsentUnlockApp;
