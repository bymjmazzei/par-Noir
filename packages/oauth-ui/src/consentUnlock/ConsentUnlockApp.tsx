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

export type ConsentUnlockAppProps = {
  /** Override search string (tests / deep links). Default: window.location.search */
  search?: string;
  apiEndpointDefault?: string;
  /** Capacitor: open redirect_uri outside the unlock WebView */
  openExternal?: (url: string) => void | Promise<void>;
  /** Optional branding asset base for logo */
  assetBase?: string;
};

type Step = 'unlock' | 'consent';
type UnlockMode = 'file' | 'usb' | 'nfc';
type DataPointChoice = '' | 'shared' | 'not-shared';

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    background: '#000',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  container: { width: '100%', maxWidth: 420 },
  formBox: {
    background: 'rgba(26, 26, 26, 0.95)',
    border: '1px solid #333',
    borderRadius: 12,
    padding: 32,
  },
  label: { display: 'block', color: '#e5e7eb', fontSize: 14, fontWeight: 500, marginBottom: 8 },
  input: {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(26, 26, 26, 0.95)',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    boxSizing: 'border-box' as const,
  },
  error: {
    background: '#7f1d1d',
    border: '1px solid #991b1b',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
  },
  btnRow: { display: 'flex', gap: 12, marginTop: 24 },
  btn: {
    flex: 1,
    padding: '12px 24px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    background: 'rgba(26, 26, 26, 0.95)',
    border: '1px solid #4b5563',
    color: '#fff',
  },
  modeRow: { display: 'flex', gap: 8, marginBottom: 20 },
  modeBtn: {
    flex: 1,
    padding: '10px 8px',
    fontSize: 13,
    borderRadius: 8,
    cursor: 'pointer',
    background: 'rgba(40, 40, 40, 0.95)',
    border: '1px solid #444',
    color: '#9ca3af',
  },
  modeBtnActive: {
    borderColor: '#3b82f6',
    color: '#fff',
    background: 'rgba(30, 58, 138, 0.35)',
  },
  fileArea: {
    border: '2px dashed #4b5563',
    borderRadius: 8,
    padding: 16,
    textAlign: 'center' as const,
    cursor: 'pointer',
    marginBottom: 16,
  },
  hint: { color: '#6b7280', fontSize: 12, marginBottom: 16, lineHeight: 1.4 },
  step: {
    textAlign: 'center' as const,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 24,
    color: '#fff',
  },
  permItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
};

export function ConsentUnlockApp(props: ConsentUnlockAppProps): React.ReactElement {
  const params = useMemo(
    () =>
      parseConsentUnlockParams(props.search ?? (typeof window !== 'undefined' ? window.location.search : ''), {
        apiEndpoint: props.apiEndpointDefault,
        redirectUriFallbackOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    [props.search, props.apiEndpointDefault]
  );

  return <ConsentUnlockInner params={params} openExternal={props.openExternal} assetBase={props.assetBase} />;
}

function ConsentUnlockInner(props: {
  params: ConsentUnlockParams;
  openExternal?: (url: string) => void | Promise<void>;
  assetBase?: string;
}): React.ReactElement {
  const { params, openExternal, assetBase } = props;
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

  const afterUnlock = useCallback(
    async (unlocked: UnlockedIdentityBundle) => {
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
    [params, needsConsent, finishWithCode, loadCatalog, dataPointIds]
  );

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

        await afterUnlock(unlocked);
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
  const logoSrc = `${(assetBase || 'https://browse.parnoir.com').replace(/\/$/, '')}/branding/Par-Noir-Icon-White.png`;

  let redirectHost = params.redirectUri;
  try {
    redirectHost = new URL(params.redirectUri).hostname;
  } catch {
    /* keep */
  }

  const modeBtnStyle = (mode: UnlockMode): React.CSSProperties => ({
    ...styles.modeBtn,
    ...(unlockMode === mode ? styles.modeBtnActive : null),
  });

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={logoSrc} alt="par Noir" style={{ width: 96, height: 96, objectFit: 'contain' }} />
          <h1 style={{ fontSize: 22, marginTop: 12 }}>Unlock pN</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>
            {params.clientId} · {redirectHost}
          </p>
        </div>

        {step === 'unlock' && (
          <div style={styles.formBox}>
            <div style={styles.step}>Step 1 — Unlock</div>
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.modeRow} role="tablist" aria-label="Unlock method">
              <button type="button" style={modeBtnStyle('file')} onClick={() => changeMode('file')}>
                File
              </button>
              <button type="button" style={modeBtnStyle('usb')} onClick={() => changeMode('usb')}>
                USB
              </button>
              <button type="button" style={modeBtnStyle('nfc')} onClick={() => changeMode('nfc')}>
                NFC
              </button>
            </div>

            <form {...SECRET_KEY_FORM_ATTRS} onSubmit={onUnlock}>
              {unlockMode === 'file' && (
                <div
                  style={styles.fileArea}
                  onClick={() => document.getElementById('pn-identity-file')?.click()}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      document.getElementById('pn-identity-file')?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div style={{ color: '#e5e7eb', fontWeight: 500 }}>{fileName || 'Select .pn identity file'}</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>File stays on this device</div>
                  <input
                    id="pn-identity-file"
                    type="file"
                    accept=".pn,.json,application/json"
                    style={{ display: 'none' }}
                    onChange={(ev) => void onFile(ev.target.files?.[0] || null)}
                  />
                </div>
              )}

              {unlockMode === 'usb' && (
                <>
                  <p style={styles.hint}>
                    Use the USB key export from the dashboard (key file + drive passcode; optional payload).
                  </p>
                  <div
                    style={styles.fileArea}
                    onClick={() => document.getElementById('pn-usb-key')?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') document.getElementById('pn-usb-key')?.click();
                    }}
                  >
                    <div style={{ color: '#e5e7eb', fontWeight: 500 }}>{usbKeyName || 'Select key file'}</div>
                    <input
                      id="pn-usb-key"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={(ev) => void onUsbKey(ev.target.files?.[0] || null)}
                    />
                  </div>
                  <div
                    style={styles.fileArea}
                    onClick={() => document.getElementById('pn-usb-payload')?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') document.getElementById('pn-usb-payload')?.click();
                    }}
                  >
                    <div style={{ color: '#e5e7eb', fontWeight: 500 }}>
                      {usbPayloadName || 'Optional — parnoir-payload.enc'}
                    </div>
                    <input
                      id="pn-usb-payload"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={(ev) => void onUsbPayload(ev.target.files?.[0] || null)}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={styles.label}>Drive passcode</label>
                    <input
                      type="password"
                      autoComplete="off"
                      style={styles.input}
                      value={usbDrivePasscode}
                      onChange={(ev) => setUsbDrivePasscode(ev.target.value)}
                    />
                  </div>
                </>
              )}

              {unlockMode === 'nfc' && (
                <>
                  <p style={styles.hint}>Web NFC on Chrome Android. Tap the card, then enter Key 1 and Key 2.</p>
                  <button
                    type="button"
                    style={{ ...styles.btn, marginBottom: 12 }}
                    disabled={nfcScanning || busy}
                    onClick={() => void onNfcScan()}
                  >
                    {nfcScanning ? 'Scanning…' : 'Tap NFC card'}
                  </button>
                  {nfcStatus ? (
                    <p style={{ color: nfcPayload ? '#86efac' : '#9ca3af', fontSize: 13, marginBottom: 16 }}>
                      {nfcStatus}
                    </p>
                  ) : null}
                </>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={styles.label}>Key 1</label>
                <input
                  {...key1Props}
                  type={showKey1 ? 'text' : 'password'}
                  style={styles.input}
                  value={pnName}
                  onChange={(ev) => setPnName(ev.target.value)}
                />
                <button type="button" style={{ ...styles.btn, marginTop: 8 }} onClick={() => setShowKey1((v) => !v)}>
                  {showKey1 ? 'Hide' : 'Show'}
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={styles.label}>Key 2</label>
                <input
                  {...key2Props}
                  type={showKey2 ? 'text' : 'password'}
                  style={styles.input}
                  value={passcode}
                  onChange={(ev) => setPasscode(ev.target.value)}
                />
                <button type="button" style={{ ...styles.btn, marginTop: 8 }} onClick={() => setShowKey2((v) => !v)}>
                  {showKey2 ? 'Hide' : 'Show'}
                </button>
              </div>

              <button type="submit" style={styles.btn} disabled={busy}>
                {busy ? 'Unlocking…' : 'Unlock pN'}
              </button>
            </form>
          </div>
        )}

        {step === 'consent' && (
          <div style={styles.formBox}>
            <div style={styles.step}>Step 2 — Consent</div>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>
              Identity <code>{pnIdentifier}</code>
            </p>
            {error && <div style={styles.error}>{error}</div>}

            {!isMessagingHandoffClient(params.clientId) && (
              <div style={{ marginBottom: 16, color: '#e5e7eb', fontSize: 14 }}>
                <div>• Verify your identity</div>
                <div>• Access profile information allowed by scopes</div>
              </div>
            )}

            {integrator && (
              <div style={{ marginBottom: 16, fontSize: 14, color: '#e5e7eb' }}>
                App storage under <code>integrators/{params.clientId}/</code>
              </div>
            )}

            {cloudAccess && (
              <div style={{ marginBottom: 16, fontSize: 14, color: '#9ca3af' }}>
                Cloud access scopes requested
              </div>
            )}

            {dataPointIds.map((id) => {
              const meta = catalog[id] || {};
              const offerable =
                availableDataPoints &&
                availableDataPoints[id] &&
                availableDataPoints[id].available === true;
              return (
                <div key={id} style={styles.permItem}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{meta.name || id}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {offerable
                        ? meta.description || `Share this proof with ${params.clientId}`
                        : availableDataPoints == null
                          ? 'Proof availability unknown (cloud not readable during unlock).'
                          : 'You do not have this proof available to share.'}
                    </div>
                  </div>
                  {offerable && (
                    <select
                      value={dataPointChoices[id] || ''}
                      onChange={(ev) =>
                        setDataPointChoices((prev) => ({
                          ...prev,
                          [id]: ev.target.value as DataPointChoice,
                        }))
                      }
                      style={{ ...styles.input, width: 120 }}
                    >
                      <option value="">Select…</option>
                      <option value="shared">Share</option>
                      <option value="not-shared">Don&apos;t Share</option>
                    </select>
                  )}
                </div>
              );
            })}

            <div style={styles.btnRow}>
              <button
                type="button"
                style={styles.btn}
                disabled={busy}
                onClick={() =>
                  denyOAuthConsent({
                    redirectUri: params.redirectUri,
                    state: params.state,
                    popupFlow: params.popup,
                  })
                }
              >
                Deny
              </button>
              <button type="button" style={styles.btn} disabled={busy} onClick={() => void onApprove()}>
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
