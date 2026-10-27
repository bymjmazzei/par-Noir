import React, { useCallback, useEffect, useState } from 'react';
import { Layers, RefreshCw, Plus, Download, Shield, UserPlus, Trash2 } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';
import { IdentityCrypto, VolumeIdGenerator, type EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  HostedShellLaunch,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  normalizeAgentLabel,
  type HostedShellSession,
} from '@par-noir/oauth-ui';
import {
  AI_DATA_DISCLOSURE,
  AI_SCOPES,
  AI_SCOPE_LABELS,
  ATTESTABLE_DATA_POINT_IDS,
  STANDARD_DATA_POINTS,
  type AgentAttestation,
  type AgentDelegationDraft,
  type AiScope,
} from '@par-noir/standard-data-points';
import { buildAgentDelegationDraft, loadAgentAttestations } from '../../services/agentAttestations';
import {
  buildSealedSubExportFile,
  isSubKindExportable,
  sealSubExportPayload,
  unsealSubExportPayload,
} from '../../utils/subIdentitySeal';
import {
  createOwnedAsset,
  revokeOwnedAsset,
  rekeyOwnedAsset,
  auditSubExport,
  fetchDelegations,
  createDelegation,
  revokeDelegation,
  agentFromShellSession,
  registerAiAgent,
  revokeAiAgent,
  type OwnedAssetDto
} from '../../services/ownedAssetsApi';
import {
  getMonetizationStatusCached,
  getOwnedAssetsCached,
} from '../../services/dashboardSessionCache';
import { republishOwnedAssetsManifest } from '../../services/ownedAssetsManifestService';
import { FeedCreator } from '../feeds/FeedCreator';
import { AiAgentConnectCard, AiAgentConnectorList } from './AiAgentConnect';

const SUB_KINDS = ['feed', 'device', 'ai_agent', 'smart_device'] as const;
type SubKind = (typeof SUB_KINDS)[number];

const KIND_LABELS: Record<SubKind, string> = {
  feed: 'Feed',
  device: 'Device (phone, laptop)',
  ai_agent: 'AI agent',
  smart_device: 'Smart device (IoT)',
};

/** Kinds always available; feed requires verified identity. */
const BASE_SUB_KINDS: SubKind[] = ['device', 'ai_agent', 'smart_device'];

const FEED_CAPABILITY_SCOPES = [
  {
    key: 'read',
    label: 'Access (read)',
    description: 'View feed content and metadata'
  },
  {
    key: 'write',
    label: 'Post (write)',
    description: 'Create and edit posts on this feed'
  },
  {
    key: 'manage',
    label: 'Manage',
    description: 'Delegate access and manage feed settings'
  }
] as const;

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
  pnIdentifier: string | null | undefined;
  connectError?: string | null;
  sessionId: string | undefined;
  publicKey: string | undefined;
  availableScopes?: ScopeOption[];
}

export const SubPnTab: React.FC<SubPnTabProps> = ({
  accessToken,
  pnIdentifier,
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
  const [rotatePending, setRotatePending] = useState(false);
  const [authKey1, setAuthKey1] = useState('');
  const [authKey2, setAuthKey2] = useState('');
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
  const [showFeedCreator, setShowFeedCreator] = useState(false);
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);
  const [agentScopes, setAgentScopes] = useState<AiScope[]>([AI_SCOPES.filesPublished]);
  const [agentAck, setAgentAck] = useState(false);
  const [heldAttestations, setHeldAttestations] = useState<AgentAttestation[] | null>(null);
  const [agentProofs, setAgentProofs] = useState<string[]>([]);
  const agentDraftRef = React.useRef<AgentDelegationDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const creatableKinds: SubKind[] = isIdentityVerified
    ? ['feed', ...BASE_SUB_KINDS]
    : BASE_SUB_KINDS;

  useEffect(() => {
    if (!accessToken) {
      setIsIdentityVerified(false);
      return;
    }
    let cancelled = false;
    void getMonetizationStatusCached(accessToken)
      .then((s) => {
        if (!cancelled) setIsIdentityVerified(!!s.verified);
      })
      .catch(() => {
        if (!cancelled) setIsIdentityVerified(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (createKind === 'feed' && !isIdentityVerified) {
      setCreateKind('ai_agent');
    }
  }, [createKind, isIdentityVerified]);

  const syncIpfsManifest = useCallback(
    async (_list: OwnedAssetDto[]) => {
      if (!accessToken) return;
      try {
        if (pnIdentifier) await republishOwnedAssetsManifest(accessToken, pnIdentifier, publicKey);
      } catch {
        /* optional IPFS */
      }
    },
    [accessToken, publicKey]
  );

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!accessToken || !pnIdentifier) return;
    setLoading(true);
    setErr(null);
    try {
      const { waitForLocalGoogleAccessToken } = await import('../../services/deviceApiService');
      const cloudTok = await waitForLocalGoogleAccessToken(pnIdentifier, 12000);
      if (!cloudTok) {
        setErr('Reconnect Google Drive on this device to manage owned assets.');
        setAssets([]);
        return;
      }
      const list = await getOwnedAssetsCached(accessToken, pnIdentifier, { force: opts?.force });
      setAssets(list);
      void syncIpfsManifest(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load owned assets');
    } finally {
      setLoading(false);
    }
  }, [accessToken, pnIdentifier, syncIpfsManifest]);

  const assetsLenRef = React.useRef(0);
  assetsLenRef.current = assets.length;
  const initialLoadStartedRef = React.useRef(false);

  useEffect(() => {
    // Keep-alive mounts this tab at unlock — wait for a local Google token before
    // the first owned-assets GET (otherwise unlock races → red 409 storm).
    if (!accessToken || !pnIdentifier || initialLoadStartedRef.current) return;
    let cancelled = false;
    void (async () => {
      const { waitForLocalGoogleAccessToken } = await import('../../services/deviceApiService');
      const cloudTok = await waitForLocalGoogleAccessToken(pnIdentifier, 20000);
      if (cancelled || !cloudTok) return;
      initialLoadStartedRef.current = true;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, pnIdentifier, load]);

  useEffect(() => {
    const onReady = () => {
      if (assetsLenRef.current === 0) void load();
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    return () => window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
  }, [load]);

  const selected = assets.find((a) => a.id === selectedId) || null;

  const loadDelegations = useCallback(async () => {
    if (!accessToken || !selectedId) return;
    try {
      if (!pnIdentifier) return;
      const r = await fetchDelegations(accessToken, pnIdentifier, selectedId);
      setDelegations(r.delegations.filter((d) => d.status === 'active'));
    } catch {
      setDelegations([]);
    }
  }, [accessToken, pnIdentifier, selectedId]);

  useEffect(() => {
    void loadDelegations();
  }, [loadDelegations]);

  const createSub = async () => {
    if (createKind === 'feed') {
      setShowFeedCreator(true);
      return;
    }
    if (createKind === 'ai_agent') return;
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
      const subKey1 = `sub-${randomSecret(16)}`;
      const subPass = randomSecret(32);
      const nickname = label.trim() || `Sub ${createKind}`;
      const creation = await IdentityCrypto.createIdentity(subKey1, nickname, subPass);
      const encrypted = creation.identity;
      const subject = await VolumeIdGenerator.generateCanonicalVolumeId(encrypted.publicKey);
      if (!pnIdentifier) throw new Error('Missing pn identifier');
      const asset = await createOwnedAsset(accessToken, pnIdentifier, {
        kind: createKind,
        subjectPnIdentifier: subject,
        metadata: { label: nickname, parentWrapped: true }
      });
      const portable = JSON.stringify({
        key1: subKey1,
        key2: subPass,
        encryptedIdentity: encrypted,
        kind: createKind,
        assetId: asset.id
      });
      const sealed = await sealSubExportPayload(portable, pass);
      localStorage.setItem(`${STORAGE_SEAL_PREFIX}${asset.id}`, sealed);
      setExportPassphrase('');
      setLabel('');
      await load({ force: true });
      setSelectedId(asset.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  };

  const agentLabel = normalizeAgentLabel(label);
  const wantsProofs = agentScopes.includes(AI_SCOPES.proofs);
  const proofsReady = !wantsProofs || (heldAttestations !== null && agentProofs.length > 0);
  const canAddAgent =
    !!accessToken && !!agentLabel && agentScopes.length > 0 && proofsReady && agentAck && !loading;

  const toggleAgentScope = (scope: AiScope, on: boolean) => {
    setAgentScopes((prev) => (on ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope)));
  };

  const toggleAgentProof = (id: string, on: boolean) => {
    setAgentProofs((prev) => (on ? [...new Set([...prev, id])] : prev.filter((p) => p !== id)));
  };

  useEffect(() => {
    if (!wantsProofs || heldAttestations !== null || !accessToken || !pnIdentifier) return;
    let cancelled = false;
    void loadAgentAttestations(pnIdentifier, accessToken)
      .then((list) => {
        if (!cancelled) setHeldAttestations(list);
      })
      .catch(() => {
        if (!cancelled) setHeldAttestations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [wantsProofs, heldAttestations, accessToken, pnIdentifier]);

  const agentDelegationDraft = (): AgentDelegationDraft => {
    const draft = buildAgentDelegationDraft({
      scopes: agentScopes,
      held: heldAttestations ?? [],
      picked: agentProofs,
    });
    agentDraftRef.current = draft;
    return draft;
  };

  const onAgentSession = async (session: HostedShellSession) => {
    if (!accessToken || !pnIdentifier) return;
    setErr(null);
    setNotice(null);
    setLoading(true);
    try {
      const agent = agentFromShellSession(session, sessionId, agentDraftRef.current);
      const asset = await registerAiAgent(accessToken, pnIdentifier, {
        label: agentLabel,
        ...agent,
      });
      agentDraftRef.current = null;
      setLabel('');
      setAgentAck(false);
      setAgentProofs([]);
      await load({ force: true });
      setSelectedId(asset.id);
      setNotice(`AI agent "${agentLabel}" added. Connect an app from its panel below.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the AI agent');
    } finally {
      setLoading(false);
    }
  };

  const revokeSelected = async () => {
    if (!accessToken || !selected || !pnIdentifier) return;
    const isAgent = selected.kind === 'ai_agent';
    if (!confirm(isAgent ? 'Revoke this AI agent? Its access stops immediately.' : 'Revoke this asset on the network?')) {
      return;
    }
    setErr(null);
    setNotice(null);
    try {
      if (isAgent) {
        const result = await revokeAiAgent(accessToken, pnIdentifier, selected.id);
        if (!result.sheetSynced) {
          setNotice('Access revoked. Reconnect Google Drive to update this list.');
        }
      } else {
        await revokeOwnedAsset(accessToken, pnIdentifier, selected.id);
        localStorage.removeItem(`${STORAGE_SEAL_PREFIX}${selected.id}`);
      }
      setSelectedId(null);
      await load({ force: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Revoke failed');
    }
  };

  const downloadSealedBackup = (assetId: string, sealed: string) => {
    const blob = new Blob([buildSealedSubExportFile(assetId, sealed)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sub-pn-${assetId.slice(0, 8)}.sealed.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const closeExportAuthModal = () => {
    if (authLoading) return;
    setRotatePending(false);
    setShowExportAuthModal(false);
    setAuthKey1('');
    setAuthKey2('');
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
    if (!isSubKindExportable(selected.kind)) {
      setErr('AI agents live in par Noir Unlock on the Mac that added them and cannot be exported.');
      return;
    }
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
      await unsealSubExportPayload(sealed, ep);
      downloadSealedBackup(selected.id, sealed);
      if (!pnIdentifier) throw new Error('Missing pn identifier');
      await auditSubExport(accessToken, pnIdentifier, selected.id);
      setExportPassConfirm('');
    } catch {
      setErr('Export passphrase wrong or corrupt backup.');
    }
  };

  const handleConfirmFullReauthAndRotate = async (shellAuthorized = false) => {
    if (!selected || !accessToken) {
      setAuthError('Select a sub-pN first.');
      return;
    }
    if (!shellAuthorized && (!authFile || !authKey1.trim() || !authKey2.trim())) {
      setAuthError('Unlock in par Noir Unlock to rotate this sub identity.');
      return;
    }
    if (!sessionId) {
      setAuthError('No active root identity session. Unlock again.');
      return;
    }
    if (!isSubKindExportable(selected.kind)) {
      setAuthError('Revoke this AI agent and add a new one instead of rotating.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      if (!shellAuthorized) {
        const encryptedIdentity = await parseIdentityFile(authFile!);
        const authSession = await IdentityCrypto.authenticateIdentity(
          encryptedIdentity,
          authKey2.trim(),
          authKey1.trim()
        );
        if (authSession.id !== sessionId) {
          throw new Error('Re-authenticated identity does not match the currently unlocked root pN.');
        }
      }

      const subKey1 = `sub-${randomSecret(16)}`;
      const subPass = randomSecret(32);
      const nickname =
        (typeof selected.metadata?.label === 'string' ? selected.metadata.label : null) ||
        `Rotated ${selected.kind}`;
      const creation = await IdentityCrypto.createIdentity(subKey1, nickname, subPass);
      const encrypted = creation.identity;
      const subject = await VolumeIdGenerator.generateCanonicalVolumeId(encrypted.publicKey);

      if (!pnIdentifier) throw new Error('Missing pn identifier');
      const newAsset = await rekeyOwnedAsset(accessToken, pnIdentifier, selected.id, {
        newSubjectPnIdentifier: subject,
        newSubjectPublicKey: encrypted.publicKey,
        reason: 'compromise',
        migrateDelegations: true,
      });

      const portable = JSON.stringify({
        key1: subKey1,
        key2: subPass,
        encryptedIdentity: encrypted,
        kind: newAsset.kind,
        assetId: newAsset.id,
      });
      const pass = exportPassConfirm.trim() || exportPassphrase.trim();
      if (!pass) {
        throw new Error('Set an export passphrase before rotating (used to seal the new backup).');
      }
      const sealed = await sealSubExportPayload(portable, pass);
      localStorage.removeItem(`${STORAGE_SEAL_PREFIX}${selected.id}`);
      localStorage.setItem(`${STORAGE_SEAL_PREFIX}${newAsset.id}`, sealed);
      downloadSealedBackup(newAsset.id, sealed);

      closeExportAuthModal();
      setRotatePending(false);
      await load({ force: true });
      setSelectedId(newAsset.id);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Sub rotation failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmFullReauthAndExport = async (shellAuthorized = false) => {
    if (!shellAuthorized && !authFile) {
      setAuthError('Unlock in par Noir Unlock to export this sub backup.');
      return;
    }
    if (!shellAuthorized && (!authKey1.trim() || !authKey2.trim())) {
      setAuthError('Unlock in par Noir Unlock to export this sub backup.');
      return;
    }
    if (!sessionId) {
      setAuthError('No active root identity session. Unlock again.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      if (!shellAuthorized) {
        const encryptedIdentity = await parseIdentityFile(authFile!);
        const authSession = await IdentityCrypto.authenticateIdentity(
          encryptedIdentity,
          authKey2.trim(),
          authKey1.trim()
        );
        if (authSession.id !== sessionId) {
          throw new Error('Re-authenticated identity does not match the currently unlocked root pN.');
        }
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
    if (selected?.kind === 'feed') {
      if (!pn || !pn.startsWith('pn-')) return null;
      return { delegateePnIdentifier: pn };
    }
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
        if (!pnIdentifier) throw new Error('Missing pn identifier');
        await createDelegation(accessToken, pnIdentifier, selectedId, {
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
          if (!pnIdentifier) throw new Error('Missing pn identifier');
          await revokeDelegation(accessToken, pnIdentifier, match.id);
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
          <SectionInfo title="Sub-pN and owned assets">
            <p>
              Create sub-identities bound to your main pN (agents, devices, feeds). Register on the par Noir API with
              your session token. Export requires your main key2 and the export passphrase you set at creation.
            </p>
          </SectionInfo>
        </h3>
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
      {notice && (
        <div className="p-3 rounded-lg bg-secondary border border-border text-sm" role="status">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void load({ force: true })}
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
              {creatableKinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {!isIdentityVerified && (
            <p className="text-xs text-text-secondary">
              Feed sub-pNs appear here after you verify your identity (Privacy &amp; Sharing).
            </p>
          )}
          {createKind === 'feed' ? (
            <>
              <p className="text-sm text-text-secondary">
                Feeds require a monthly subscription. After activation the feed appears in this list; post and switch
                contexts in the browser.
              </p>
              <button
                type="button"
                onClick={() => setShowFeedCreator(true)}
                className="w-full py-2 rounded-md bg-primary text-bg-primary font-medium hover:opacity-90 disabled:opacity-50"
                disabled={loading || !accessToken}
              >
                Subscribe and register feed — $5 / month
              </button>
            </>
          ) : createKind === 'ai_agent' ? (
            <>
              <label className="block text-sm">
                <span className="text-text-secondary">Name</span>
                <input
                  className="mt-1 w-full rounded-md bg-secondary border border-border px-3 py-2"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Cursor, Claude Desktop…"
                  maxLength={40}
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm text-text-secondary">What it can read</legend>
                {(Object.values(AI_SCOPES) as AiScope[]).map((scope) => (
                  <label key={scope} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={agentScopes.includes(scope)}
                      onChange={(e) => toggleAgentScope(scope, e.target.checked)}
                    />
                    <span>{AI_SCOPE_LABELS[scope]}</span>
                  </label>
                ))}
              </fieldset>
              {wantsProofs ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm text-text-secondary">Proofs it may ask about</legend>
                  <p className="text-xs text-text-secondary">
                    Checked on this device. The agent only gets yes or no, the level and the expiry.
                  </p>
                  {heldAttestations === null ? (
                    <p className="text-xs text-text-secondary">Checking your proofs…</p>
                  ) : (
                    ATTESTABLE_DATA_POINT_IDS.map((id) => {
                      const held = heldAttestations.find((a) => a.dataPointId === id);
                      return (
                        <label key={id} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={!held}
                            checked={!!held && agentProofs.includes(id)}
                            onChange={(e) => toggleAgentProof(id, e.target.checked)}
                          />
                          <span>
                            {STANDARD_DATA_POINTS[id]?.name || id}
                            <span className="text-xs text-text-secondary">
                              {held
                                ? ` — answers ${held.satisfied ? 'yes' : 'no'}${held.level === 'verified' ? ', verified' : ''}`
                                : ' — not on file'}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </fieldset>
              ) : null}
              <div className="p-3 rounded-md border border-amber-700 bg-amber-900/20 text-xs space-y-2">
                <p>{AI_DATA_DISCLOSURE}</p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agentAck}
                    onChange={(e) => setAgentAck(e.target.checked)}
                  />
                  <span>I understand</span>
                </label>
              </div>
              <HostedShellLaunch
                op="agent"
                agentLabel={agentLabel}
                agentDelegation={agentDelegationDraft}
                buttonOnly
                disabled={!canAddAgent}
                label="Approve in par Noir Unlock"
                onSession={(session) => void onAgentSession(session)}
              />
              <p className="text-xs text-text-secondary">
                Unlock creates the agent and keeps its keys in Touch ID on this Mac. Nothing to download.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
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
              <h4 className="font-semibold flex items-center gap-2">
                Mini dashboard — {String(selected.metadata?.label || selected.kind)}
                <SectionInfo title="About this sub type">
                  {selected.kind === 'ai_agent' && (
                    <p>
                      An AI tool signs in as this agent through par Noir Unlock on the Mac that added it. The API checks
                      these scopes on every request; revoke stops access immediately.
                    </p>
                  )}
                  {selected.kind === 'feed' && (
                    <p>
                      Monthly feed sub-pN. Post and switch contexts in the browser. Delegate read / write / manage below
                      so other pNs can use this feed.
                    </p>
                  )}
                  {selected.kind === 'device' && (
                    <p>
                      <strong>Device:</strong> Your phone, laptop, or tablet. For device sync and per-device identity;
                      profile in metadata and Drive.
                    </p>
                  )}
                  {selected.kind === 'smart_device' && (
                    <p>
                      <strong>Smart device:</strong> IoT and smart-home devices (speakers, appliances). For connected
                      things that act on your behalf; extend metadata for connections.
                    </p>
                  )}
                </SectionInfo>
              </h4>
              <p className="text-xs text-text-secondary mt-1">Kind: {selected.kind}</p>
              <p className="text-xs text-text-secondary font-mono break-all">Subject: {selected.subjectPnIdentifier}</p>
            </div>
            <button
              type="button"
              className="text-sm px-3 py-1 rounded-md border border-red-700 text-red-400 hover:bg-red-900/20"
              onClick={() => void revokeSelected()}
            >
              {selected.kind === 'ai_agent' ? 'Revoke AI agent' : 'Revoke on API'}
            </button>
          </div>

          {selected.kind === 'ai_agent' ? (
            <div className="border-t border-border pt-4 space-y-2 text-sm">
              <h5 className="font-medium">Can read</h5>
              <ul className="list-disc pl-5 text-text-secondary">
                {(Array.isArray(selected.metadata?.scopes) ? (selected.metadata.scopes as string[]) : [])
                  .filter((s): s is AiScope => s in AI_SCOPE_LABELS)
                  .map((s) => (
                    <li key={s}>{AI_SCOPE_LABELS[s]}</li>
                  ))}
              </ul>
              <p className="text-xs text-text-secondary">
                Not exportable. To change what it can read, revoke it and add a new agent.
              </p>
              <h5 className="font-medium pt-2">Connected apps</h5>
              <AiAgentConnectorList accessToken={accessToken} pnIdentifier={pnIdentifier} agentId={selected.id} />
              <p className="text-xs text-text-secondary">Revoking this agent signs every app out.</p>
              <AiAgentConnectCard />
            </div>
          ) : (
          <>
          <div className="border-t border-border pt-4 space-y-3">
            <h5 className="font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Rotate sub identity (compromised)
              <SectionInfo title="Rotate sub identity (compromised)">
                <p>
                  Issues a new cryptographic subject for this sub, revokes the old subject on the network, and
                  downloads a fresh export backup. Requires root re-auth.
                </p>
              </SectionInfo>
            </h5>
            <button
              type="button"
              onClick={() => {
                setRotatePending(true);
                setShowExportAuthModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-amber-800 text-white text-sm hover:bg-amber-700"
            >
              <RefreshCw className="w-4 h-4" />
              Rotate compromised sub
            </button>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <h5 className="font-medium flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export sub backup
              <SectionInfo title="Export sub backup">
                <p>
                  Full re-auth is required before export: root identity file + Key 1 + Key 2, then export
                  passphrase.
                </p>
              </SectionInfo>
            </h5>
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
              {selected.kind === 'feed'
                ? 'Select one delegate target, then toggle feed access capabilities.'
                : 'Select one delegate target, then toggle Privacy/Sharing scopes on or off.'}
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <input
                className="rounded-md bg-secondary border border-border px-2 py-1 text-sm flex-1 min-w-[140px]"
                placeholder="Delegatee pn-…"
                value={newDelPn}
                onChange={(e) => setNewDelPn(e.target.value)}
              />
              {selected.kind !== 'feed' && (
                <input
                  className="rounded-md bg-secondary border border-border px-2 py-1 text-sm flex-1 min-w-[120px]"
                  placeholder="Or client id"
                  value={newDelClient}
                  onChange={(e) => setNewDelClient(e.target.value)}
                />
              )}
            </div>
            {!getDelegationTarget() && (
              <p className="text-xs text-amber-400">
                {selected.kind === 'feed'
                  ? 'Enter a delegatee pN identifier to enable capability toggles.'
                  : 'Enter exactly one target (pN or client id) to enable scope toggles.'}
              </p>
            )}
            {newDelPn.trim() && newDelClient.trim() && selected.kind !== 'feed' && (
              <p className="text-xs text-amber-400">Use either delegatee pN or client id, not both at the same time.</p>
            )}
            <div className="space-y-2">
              {selected.kind === 'feed'
                ? FEED_CAPABILITY_SCOPES.map((scope) => {
                    const checked = isScopeEnabledForTarget(scope.key);
                    const disabled =
                      !getDelegationTarget() ||
                      delegationBusyScope === scope.key ||
                      !newDelPn.trim();
                    return (
                      <label
                        key={scope.key}
                        className="flex items-start justify-between gap-3 rounded border border-border bg-modal-bg px-3 py-2"
                      >
                        <span>
                          <span className="block text-sm font-medium">{scope.label}</span>
                          <span className="block text-xs text-text-secondary">{scope.description}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => void handleScopeToggle(scope.key, e.target.checked)}
                        />
                      </label>
                    );
                  })
                : (
                  <>
                    {availableScopes.length === 0 && (
                      <p className="text-xs text-text-secondary">No Privacy/Sharing scopes are available yet.</p>
                    )}
                    {availableScopes.map((scope) => {
                      const checked = isScopeEnabledForTarget(scope.key);
                      const disabled =
                        !scope.enabled ||
                        !getDelegationTarget() ||
                        delegationBusyScope === scope.key ||
                        !!(newDelPn.trim() && newDelClient.trim());
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
                              <span className="block text-xs text-amber-400 mt-1">
                                Disabled by global Privacy/Sharing policy.
                              </span>
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
                  </>
                )}
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
                      if (!pnIdentifier) throw new Error('Missing pn identifier');
                      await revokeDelegation(accessToken, pnIdentifier, d.id);
                      await loadDelegations();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          </>
          )}

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
              {rotatePending
                ? 'Re-authenticate to rotate this sub identity and download a new export backup.'
                : 'Re-authenticate with your root identity file, Key 1, and Key 2 to export this sub backup.'}
            </p>
            <HostedShellLaunch
              op="sub_pn"
              onSession={(session) => {
                if (session.result?.authorized !== '1') return;
                if (session.did && sessionId && session.did !== sessionId) {
                  setAuthError('Unlock did not match this pN.');
                  return;
                }
                void (rotatePending ? handleConfirmFullReauthAndRotate(true) : handleConfirmFullReauthAndExport(true));
              }}
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
                onClick={() =>
                  void (rotatePending ? handleConfirmFullReauthAndRotate() : handleConfirmFullReauthAndExport())
                }
                className="px-3 py-2 rounded bg-primary text-bg-primary text-sm"
                disabled={authLoading}
              >
                {authLoading
                  ? 'Verifying...'
                  : rotatePending
                    ? 'Verify and rotate'
                    : 'Verify and export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeedCreator && (
        <FeedCreator
          isOpen={showFeedCreator}
          onClose={() => setShowFeedCreator(false)}
          authenticatedUser={sessionId ? { id: sessionId } : null}
          pnIdentifier={pnIdentifier}
          onFeedCreated={async () => {
            setShowFeedCreator(false);
            await load({ force: true });
          }}
        />
      )}
    </div>
  );
};
