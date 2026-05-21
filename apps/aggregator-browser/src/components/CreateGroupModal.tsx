/**
 * Create group — owner picks connected members; client wraps chatKey.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getConnections, type Connection } from '../services/connectionService';
import { createGroup } from '../services/groupService';
import { isDmIdentityReady } from '../services/dmIdentitySession';

interface CreateGroupModalProps {
  ownerPnIdentifier: string;
  onClose: () => void;
  onCreated: (groupId: string, title: string) => void;
}

export function CreateGroupModal({ ownerPnIdentifier, onClose, onCreated }: CreateGroupModalProps) {
  const [title, setTitle] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConnections(ownerPnIdentifier)
      .then((list) => setConnections(list))
      .catch(() => setConnections([]));
  }, [ownerPnIdentifier]);

  const toggle = (pn: string) => {
    setSelected((prev) => ({ ...prev, [pn]: !prev[pn] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDmIdentityReady()) {
      setError('Unlock messaging before creating a group');
      return;
    }
    const members = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([memberPnIdentifier]) => ({ memberPnIdentifier, accessRole: 'readWrite' as const }));
    if (!title.trim() || members.length === 0) {
      setError('Enter a title and select at least one member');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await createGroup(ownerPnIdentifier, title.trim(), members);
      onCreated(result.groupId, result.title);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">New group</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Group title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white"
          />
          <p className="text-sm text-neutral-400">Members must already be connected to you.</p>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {connections.map((c) => (
              <label
                key={c.userPnIdentifier}
                className="flex items-center gap-2 text-sm text-white cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!selected[c.userPnIdentifier]}
                  onChange={() => toggle(c.userPnIdentifier)}
                />
                <span>{c.userPnIdentifier.slice(0, 20)}…</span>
              </label>
            ))}
            {connections.length === 0 && (
              <p className="text-sm text-neutral-500">No connections yet.</p>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-white py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create group'}
          </button>
        </form>
      </div>
    </div>
  );
}
