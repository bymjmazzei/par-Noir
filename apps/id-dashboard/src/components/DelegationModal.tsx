import React, { useEffect, useState } from 'react';
import { X, Users, Shield, AlertCircle } from 'lucide-react';
import {
  createAssetDelegation,
  ensureHumanOwnedAsset,
  listOwnedAssets,
  type OwnedAsset
} from '../services/ownedAssetService';

const SCOPE_OPTIONS = [
  { value: 'read', label: 'Read only' },
  { value: 'write', label: 'Read / write' },
  { value: '*', label: 'Full access' }
] as const;

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  rootPnIdentifier: string | null;
  onDelegationCreated?: () => void;
}

export const DelegationModal: React.FC<DelegationModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  rootPnIdentifier,
  onDelegationCreated
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<OwnedAsset[]>([]);
  const [ownedAssetId, setOwnedAssetId] = useState('');
  const [delegateePnIdentifier, setDelegateePnIdentifier] = useState('');
  const [scope, setScope] = useState<string>('read');

  useEffect(() => {
    if (!isOpen || !accessToken || !rootPnIdentifier) return;
    setLoadingAssets(true);
    setError(null);
    void listOwnedAssets(accessToken, rootPnIdentifier)
      .then((list) => {
        const active = list.filter((a) => a.status === 'active');
        setAssets(active);
        if (active.length > 0) setOwnedAssetId(active[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load assets'))
      .finally(() => setLoadingAssets(false));
  }, [isOpen, accessToken, rootPnIdentifier]);

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !rootPnIdentifier) {
      setError('Connect to the par Noir API to manage delegations.');
      return;
    }
    const delegatee = delegateePnIdentifier.trim();
    if (!delegatee.startsWith('pn-')) {
      setError('Delegatee must be a pn- identifier (e.g. pn-abc123).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let assetId = ownedAssetId;
      if (!assetId) {
        const asset = await ensureHumanOwnedAsset(accessToken, rootPnIdentifier, rootPnIdentifier);
        assetId = asset.id;
      }
      await createAssetDelegation(accessToken, rootPnIdentifier, assetId, {
        delegateePnIdentifier: delegatee,
        scope
      });
      onDelegationCreated?.();
      onClose();
      setDelegateePnIdentifier('');
      setScope('read');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create delegation');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Create Delegation</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleCreateDelegation} className="p-6 space-y-4">
          {!accessToken && (
            <div className="flex items-start gap-2 p-3 bg-amber-900/20 border border-amber-700 rounded-lg text-sm text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Unlock your identity and connect to the API before creating delegations.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Owned asset</label>
            {loadingAssets ? (
              <p className="text-sm text-text-secondary">Loading assets…</p>
            ) : assets.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No owned assets yet. A delegation root asset will be created automatically.
              </p>
            ) : (
              <select
                value={ownedAssetId}
                onChange={(e) => setOwnedAssetId(e.target.value)}
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md text-text-primary"
                required
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.kind} {a.subjectPnIdentifier ? `· ${a.subjectPnIdentifier}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Delegatee pN identifier
            </label>
            <input
              type="text"
              value={delegateePnIdentifier}
              onChange={(e) => setDelegateePnIdentifier(e.target.value)}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md text-text-primary"
              placeholder="pn-..."
              required
              disabled={!accessToken}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md text-text-primary"
              disabled={!accessToken}
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-text-primary rounded-md hover:bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !accessToken}
              className="flex-1 px-4 py-2 bg-primary text-bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Create delegation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DelegationModal;
