import React, { useCallback, useEffect, useState } from 'react';
import { Layers, RefreshCw, Plus, Download, Shield, UserPlus, Trash2 } from 'lucide-react';
import { IdentityCrypto, type EncryptedIdentity } from '../../utils/crypto';
import { VolumeIdGenerator } from '../../utils/crypto/volumeIdGenerator';
import { SecureCredentialManager } from '../../utils/secureCredentialManager';
import { sealSubExportPayload, unsealSubExportPayload } from '../../utils/subIdentitySeal';
import {
  fetchOwnedAssets,
  createOwnedAsset,
  revokeOwnedAsset,
  auditSubExport,
  fetchDelegations,
  createDelegation,
  revokeDelegation,
  postIpfsManifestPointer,
  type OwnedAssetDto
} from '../../services/ownedAssetsApi';
import { ipfsMetadataService } from '../../utils/ipfsMetadataService';

const SUB_KINDS = ['feed', 'device', 'ai_agent', 'smart_device'] as const;
type SubKind = (typeof SUB_KINDS)[number];

const KIND_LABELS: Record<SubKind, string> = {
  feed: 'Feed',
  device: 'Device (phone, laptop)',
  ai_agent: 'AI agent',
  smart_device: 'Smart device (IoT)',
};

function randomSecret(len = 24): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, len);
}

const STORAGE_SEAL_PREFIX = 'par_noir_sub_seal_';

interface ScopeOption {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface SubPnTabProps {
  accessToken: string | null | undefined;
  connectError?: string | null;
  sessionId: string | undefined;
  publicKey: string | undefined;
  availableScopes?: ScopeOption[];
}

export const SubPnTab: React.FC<SubPnTabProps> = ({
  accessToken,
  connectError,
  sessionId,
  publicKey,
  availableScopes = []
}) => {
  const [assets, setAssets] = useState<OwnedAssetDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<SubKind>('ai_agent');
  const [label, setLabel] = useState('');
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportPassConfirm, setExportPassConfirm] = useState('');
  const [showExportAuthModal, setShowExportAuthModal] = useState(false);
  const [authPnName, setAuthPnName] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');
  const [authFile, setAuthFile] = useState<File | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [delegations, setDelegations] = useState<
    Array<{
      id: string;
      delegateePnIdentifier: string | null;
      delegateeClientId: string | null;
      scope: string;
      status: string;
    }>
  >([]);
  const [newDelPn, setNewDelPn] = useState('');
  const [newDelClient, setNewDelClient] = useState('');
  const [delegationBusyScope, setDelegationBusyScope] = useState<string | null>(null);

  const rootPnForIpfs = useCallback(async (): Promise<string | null> => {
    if (!sessionId || !publicKey) return null;
    const c = SecureCredentialManager.getCredentials(sessionId);
    if (!c?.pnName || !c?.passcode) return null;
    return VolumeIdGenerator.generateVolumeId({
      pnName: c.pnName,
      passcode: c.passcode,
      publicKey
    });
  }, [sessionId, publicKey]);

  const syncIpfsManifest = useCallback(
    async (list: OwnedAssetDto[]) => {
      if (!accessToken) return;
      const pnId = (await rootPnForIpfs()) || 'pn-unknown';
      const ownedAssets = list
        .filter((a) => a.status === 'active' && a.kind !== 'human')
        .map((a) => ({
          assetId: a.id,
          kind: a.kind,
          subjectPnIdentifier: a.subjectPnIdentifier || undefined,
          label: typeof a.metadata?.label === 'string' ? a.metadata.label : undefined
        }));
      try {
        if (!ipfsMetadataService.isAvailable()) return;
        const res = await ipfsMetadataService.storePNMetadata({
          pnId,
          name: 'par Noir manifest',
          ownedAssets,
          updatedAt: new Date().toISOString()
        } as Parameters<typeof ipfsMetadataService.storePNMetadata>[0]);
        if (res.success && res.cid) {
          await postIpfsManifestPointer(accessToken, res.cid);
        }
      } catch {
        /* optional IPFS */
      }
    },
    [accessToken, rootPnForIpfs]
  );

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchOwnedAssets(accessToken);
      setAssets(list);
      void syncIpfsManifest(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load owned assets');
    } finally {
      setLoading(false);
    }
  }, [accessToken, syncIpfsManifest]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = assets.find((a) => a.id === selectedId) || null;

  const loadDelegations = useCallback(async () => {
    if (!accessToken || !selectedId) return;
    try {
      const r = await fetchDelegations(accessToken, selectedId);
      setDelegations(r.delegations.filter((d) => d.status === 'active'));
    } catch {
      setDelegations([]);
    }
  }, [accessToken, selectedId]);

  useEffect(() => {
    void loadDelegations();
  }, [loadDelegations]);

  const createSub = async () => {
    if (!accessToken) {
      setErr('Sign in with par Noir (OAuth) to register subs.');
      return;
    }
    const pass = exportPassphrase.trim();
    if (!pass) {
      setErr('Set an export passphrase to protect the downloadable sub backup.');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const subPnName = `sub-${randomSecret(16)}`;
      const subPass = randomSecret(32);
      const nickname = label.trim() || `Sub ${createKind}`;
      const creation = await IdentityCrypto.createIdentity(subPnName, nickname, subPass);
      const encrypted = creation.identity;
      const subject = await VolumeIdGenerator.generateVolumeId({
        pnName: subPnName,
        passcode: subPass,
        publicKey: encrypted.publicKey
      });
      const asset = await createOwnedAsset(accessToken, {
        kind: createKind,
        subjectPnIdentifier: subject,
        metadata: { label: nickname, parentWrapped: true }
      });
      const portable = JSON.stringify({
        pnName: subPnName,
        passcode: subPass,
        encryptedIdentity: encrypted,
        kind: createKind,
        assetId: asset.id
      });
      const sealed = await sealSubExportPayload(portable, pass);
      localStorage.setItem(`${STORAGE_SEAL_PREFIX}${asset.id}`, sealed);
      setExportPassphrase('');
      setLabel('');
      await load();
      setSelectedId(asset.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  };

  const closeExportAuthModal = () => {
    if (authLoading) return;
    setShowExportAuthModal(false);
    setAuthPnName('');
    setAuthPasscode('');
    setAuthFile(null);
    setAuthError(null);
  };

  const parseIdentityFile = async (file: File): Promise<EncryptedIdentity> => {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as
      | EncryptedIdentity
      | { identities?: EncryptedIdentity[]; encryptedIdentity?: EncryptedIdentity };

    if (parsed && typeof parsed === 'object') {
      if ('encryptedData' in parsed && 'iv' in parsed && 'salt' in parsed) {
        return parsed as EncryptedIdentity;
      }
      if (Array.isArray(parsed.identities) && parsed.identities.length === 1) {
        return parsed.identities[0];
      }
      if (parsed.encryptedIdentity && parsed.encryptedIdentity.encryptedData) {
        return parsed.encryptedIdentity;
      }
    }
    throw new Error('Invalid identity file. Use your root pN identity file.');
  };

  const doDownloadExport = async () => {
    if (!selected || !accessToken) return;
    const ep = exportPassConfirm.trim();
    if (!ep) {
      setErr('Enter your export passphrase.');
      return;
    }
    const sealed = localStorage.getItem(`${STORAGE_SEAL_PREFIX}${selected.id}`);
    if (!sealed) {
      setErr('No local sealed backup for this sub (created before backup feature or cleared storage).');
      return;
    }
    try {
      const raw = await unsealSubExportPayload(sealed, ep);
      const parsed = JSON.parse(raw) as {
        encryptedIdentity: EncryptedIdentity;
        pnName: string;
        passcode: string;
      };
      const blob = new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              type: 'par-noir-sub-identity',
              publicKey: parsed.encryptedIdentity.publicKey,
              encryptedData: parsed.encryptedIdentity.encryptedData,
              iv: parsed.encryptedIdentity.iv,
              salt: parsed.encryptedIdentity.salt,
              pnName: parsed.pnName,
              passcode: parsed.passcode
            },
            null,
            2
          )
        ],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sub-pn-${selected.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await auditSubExport(accessToken, selected.id);
      setExportPassConfirm('');
    } catch {
      setErr('Export passphrase wrong or corrupt backup.');
    }
  };

  const handleConfirmFullReauthAndExport = async () => {
    if (!authFile) {
      setAuthError('Upload your root pN identity file.');
      return;
    }
    if (!authPnName.trim() || !authPasscode.trim()) {
      setAuthError('Enter your pN name and passcode.');
      return;
    }
    if (!sessionId) {
      setAuthError('No active root identity session. Unlock again.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const encryptedIdentity = await parseIdentityFile(authFile);
      const authSession = await IdentityCrypto.authenticateIdentity(
        encryptedIdentity,
        authPasscode.trim(),
        authPnName.trim()
      );
      if (authSession.id !== sessionId) {
        throw new Error('Re-authenticated identity does not match the currently unlocked root pN.');
      }
      closeExportAuthModal();
      await doDownloadExport();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Re-authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const getDelegationTarget = (): { delegateePnIdentifier?: string; delegateeClientId?: string } | null => {
    const pn = newDelPn.trim();
    const client = newDelClient.trim();
    if (!pn && !client) return null;
    if (pn && client) return null;
    return pn ? { delegateePnIdentifier: pn } : { delegateeClientId: client };
  };

  const isScopeEnabledForTarget = (scope: string): boolean => {
    const target = getDelegationTarget();
    if (!target) return false;
    return delegations.some((d) => {
      const targetMatchesPn =
        target.delegateePnIdentifier && d.delegateePnIdentifier === target.delegateePnIdentifier;
      const targetMatchesClient = target.delegateeClientId && d.delegateeClientId === target.delegateeClientId;
      return (targetMatchesPn || targetMatchesClient) && d.scope === scope;
    });
  };

  const handleScopeToggle = async (scope: string, nextEnabled: boolean) => {
    if (!accessToken || !selectedId) return;
    const target = getDelegationTarget();
    if (!target) {
      setErr('Choose either a delegate pN identifier or a client id first.');
      return;
    }
    if (!nextEnabled && !isScopeEnabledForTarget(scope)) return;

    setErr(null);
    setDelegationBusyScope(scope);
    try {
      if (nextEnabled) {
        await createDelegation(accessToken, selectedId, {
          ...target,
          scope
        });
      } else {
        const match = delegations.find((d) => {
          const targetMatchesPn =
            target.delegateePnIdentifier && d.delegateePnIdentifier === target.delegateePnIdentifier;
          const targetMatchesClient = target.delegateeClientId && d.delegateeClientId === target.delegateeClientId;
          return (targetMatchesPn || targetMatchesClient) && d.scope === scope;
        });
        if (match) {
          await revokeDelegation(accessToken, match.id);
        }
      }
      await loadDelegations();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delegation update failed');
    } finally {
      setDelegationBusyScope(null);
    }
  };

  const subs = assets.filter((a) => SUB_KINDS.includes(a.kind as SubKind) && a.status === 'active');

  return (
    <div className="space-y-6 text-text-primary">
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Sub-pN and owned assets
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Create sub-identities bound to your main pN (agents, devices, feeds). Register on the par Noir API with your
          session token. Export requires your main passcode and the export passphrase you set at creation.
        </p>
      </div>

      {!accessToken && (
        <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-700 text-sm space-y-2">
          <p>API session is still initializing. Unlock your pN again if this message persists.</p>
          {connectError && (
            <p className="text-red-400" role="alert">
              {connectError}
            </p>
          )}
        </div>
      )}

      {err && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-700 text-sm" role="alert">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border hover:bg-border text-sm"
          disabled={loading || !accessToken}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-modal-bg border border-border rounded-lg p-4 space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create sub
          </h4>
          <label className="block text-sm">
            <span className="text-text-secondary">Kind</span>
            <select
              className="mt-1 w-full rounded-md bg-secondary border border-border px-3 py-2"
              value={createKind}
              onChange={(e) => setCreateKind(e.target.value as SubKind)}
            >
              {SUB_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Label</span>
            <input
              className="mt-1 w-full rounded-md bg-secondary border border-border px-3 py-2"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My agent"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Export passphrase</span>
            <input
              type="password"
              className="mt-1 w-full rounded-md bg-secondary border border-border px-3 py-2"
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
              placeholder="Encrypts backup; required to download"
            />
          </label>
          <button
            type="button"
            onClick={() => void createSub()}
            className="w-full py-2 rounded-md bg-primary text-bg-primary font-medium hover:opacity-90 disabled:opacity-50"
            disabled={loading || !accessToken}
          >
            Create and register
          </button>
        </div>

        <div className="bg-modal-bg border border-border rounded-lg p-4">
          <h4 className="font-medium mb-2">Your subs ({subs.length})</h4>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {subs.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm ${
                    selectedId === a.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:bg-border'
                  }`}
                >
                  <div className="font-medium">{(a.metadata?.label as string) || a.kind}</div>
                  <div className="text-xs text-text-secondary truncate">{a.subjectPnIdentifier || a.id}</div>
                </button>
              </li>
            ))}
            {subs.length === 0 && <li className="text-sm text-text-secondary">No subs yet.</li>}
          </ul>
        </div>
      </div>

      {selected && (
        <div className="space-y-4 border border-border rounded-lg p-4 bg-secondary/30">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <h4 className="font-semibold">Mini dashboard — {String(selected.metadata?.label || selected.kind)}</h4>
              <p className="text-xs text-text-secondary mt-1">Kind: {selected.kind}</p>
              <p className="text-xs text-text-secondary font-mono break-all">Subject: {selected.subjectPnIdentifier}</p>
            </div>
            <button
              type="button"
              className="text-sm px-3 py-1 rounded-md border border-red-700 text-red-400 hover:bg-red-900/20"
              onClick={async () => {
                if (!accessToken) return;
                if (!confirm('Revoke this asset on the network?')) return;
                await revokeOwnedAsset(accessToken, selected.id);
                localStorage.removeItem(`${STORAGE_SEAL_PREFIX}${selected.id}`);
                setSelectedId(null);
                await load();
              }}
            >
              Revoke on API
            </button>
          </div>

          <div className="text-sm text-text-secondary space-y-1">
            {selected.kind === 'ai_agent' && (
              <p>Use Delegations below to scope ZKP or integrations when enforcement lands on those routes.</p>
            )}
            {selected.kind === 'feed' && <p>Link feed folders from Storage; registry row tracks this sub subject.</p>}
            {selected.kind === 'device' && (
              <p>
                <strong>Device:</strong> Your phone, laptop, or tablet. For device sync and per-device identity; profile
                in metadata and Drive.
              </p>
            )}
            {selected.kind === 'smart_device' && (
              <p>
                <strong>Smart device:</strong> IoT and smart-home devices (speakers, appliances). For connected things
                that act on your behalf; extend metadata for connections.
              </p>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <h5 className="font-medium flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export sub backup
            </h5>
            <p className="text-xs text-text-secondary">
              Full re-auth is required before export: root identity file + pN name + passcode, then export passphrase.
            </p>
            <input
              type="password"
              className="w-full max-w-md rounded-md bg-secondary border border-border px-3 py-2 text-sm"
              placeholder="Export passphrase"
              value={exportPassConfirm}
              onChange={(e) => setExportPassConfirm(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowExportAuthModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-700 text-white text-sm hover:bg-green-600"
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <h5 className="font-medium flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Delegations
            </h5>
            <p className="text-xs text-text-secondary">
              Select one delegate target, then toggle Privacy/Sharing scopes on or off.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <input
                className="rounded-md bg-secondary border border-border px-2 py-1 text-sm flex-1 min-w-[140px]"
                placeholder="Delegatee pn-…"
                value={newDelPn}
                onChange={(e) => setNewDelPn(e.target.value)}
              />
              <input
                className="rounded-md bg-secondary border border-border px-2 py-1 text-sm flex-1 min-w-[120px]"
                placeholder="Or client id"
                value={newDelClient}
                onChange={(e) => setNewDelClient(e.target.value)}
              />
            </div>
            {!getDelegationTarget() && (
              <p className="text-xs text-amber-400">Enter exactly one target (pN or client id) to enable scope toggles.</p>
            )}
            {newDelPn.trim() && newDelClient.trim() && (
              <p className="text-xs text-amber-400">Use either delegatee pN or client id, not both at the same time.</p>
            )}
            <div className="space-y-2">
              {availableScopes.length === 0 && (
                <p className="text-xs text-text-secondary">No Privacy/Sharing scopes are available yet.</p>
              )}
              {availableScopes.map((scope) => {
                const checked = isScopeEnabledForTarget(scope.key);
                const disabled =
                  !scope.enabled || !getDelegationTarget() || delegationBusyScope === scope.key || !!(newDelPn.trim() && newDelClient.trim());
                return (
                  <label
                    key={scope.key}
                    className={`flex items-start justify-between gap-3 rounded border px-3 py-2 ${
                      scope.enabled ? 'border-border bg-modal-bg' : 'border-amber-700 bg-amber-900/20'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium">{scope.label}</span>
                      <span className="block text-xs text-text-secondary">{scope.description}</span>
                      {!scope.enabled && (
                        <span className="block text-xs text-amber-400 mt-1">Disabled by global Privacy/Sharing policy.</span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => void handleScopeToggle(scope.key, e.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
            <ul className="space-y-2">
              {delegations.map((d) => (
                <li
                  key={d.id}
                  className="flex justify-between items-center text-sm bg-modal-bg border border-border rounded px-3 py-2"
                >
                  <span>
                    {d.delegateePnIdentifier || d.delegateeClientId} — {d.scope}
                  </span>
                  <button
                    type="button"
                    aria-label="Revoke delegation"
                    className="p-1 text-red-400 hover:bg-red-900/20 rounded"
                    onClick={async () => {
                      if (!accessToken) return;
                      await revokeDelegation(accessToken, d.id);
                      await loadDelegations();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border pt-4 flex items-center gap-2 text-xs text-text-secondary">
            <Shield className="w-4 h-4" />
            API keys for your account appear as separate rows (kind api_key) when synced from the registry.
          </div>
        </div>
      )}

      {showExportAuthModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-modal-bg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="font-semibold">Full re-auth required</h5>
              <button type="button" className="text-text-secondary" onClick={closeExportAuthModal}>
                x
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              Re-authenticate with your root identity file, pN name, and passcode to export this sub backup.
            </p>
            <input
              type="file"
              accept=".did,.json,.pn,.id,.identity,application/json"
              onChange={(e) => setAuthFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            <input
              type="password"
              placeholder="Root pN name"
              value={authPnName}
              onChange={(e) => setAuthPnName(e.target.value)}
              className="w-full rounded-md bg-secondary border border-border px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="Root passcode"
              value={authPasscode}
              onChange={(e) => setAuthPasscode(e.target.value)}
              className="w-full rounded-md bg-secondary border border-border px-3 py-2 text-sm"
            />
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeExportAuthModal}
                className="px-3 py-2 rounded bg-secondary border border-border text-sm"
                disabled={authLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmFullReauthAndExport()}
                className="px-3 py-2 rounded bg-primary text-bg-primary text-sm"
                disabled={authLoading}
              >
                {authLoading ? 'Verifying...' : 'Verify and export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
