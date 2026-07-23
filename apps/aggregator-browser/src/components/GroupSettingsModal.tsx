/**
 * Group settings — owner can edit title, roles, add/remove members.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getConnections, type Connection } from '../services/connectionService';
import {
  listGroups,
  updateGroupTitle,
  updateMemberAccessRole,
  addGroupMember,
  removeGroupMember,
  type GroupAccessRole,
  type GroupRecord
} from '../services/groupService';

interface GroupSettingsModalProps {
  ownerPnIdentifier: string;
  groupId: string;
  initialTitle: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function GroupSettingsModal({
  ownerPnIdentifier,
  groupId,
  initialTitle,
  onClose,
  onUpdated
}: GroupSettingsModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [members, setMembers] = useState<GroupRecord[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [addPn, setAddPn] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const groups = await listGroups(ownerPnIdentifier);
    const rows = groups.filter((g) => g.groupId === groupId && g.ownerPnIdentifier === ownerPnIdentifier);
    setMembers(rows);
  };

  useEffect(() => {
    reload().catch(() => setMembers([]));
    getConnections(ownerPnIdentifier)
      .then(setConnections)
      .catch(() => setConnections([]));
  }, [ownerPnIdentifier, groupId]);

  const memberPns = [...new Set(members.map((m) => m.memberPnIdentifier))];

  const handleSaveTitle = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateGroupTitle(ownerPnIdentifier, groupId, title.trim());
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update title');
    } finally {
      setLoading(false);
    }
  };

  const handleRole = async (memberPn: string, role: GroupAccessRole) => {
    setLoading(true);
    setError(null);
    try {
      await updateMemberAccessRole(ownerPnIdentifier, groupId, memberPn, role);
      await reload();
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!addPn) return;
    setLoading(true);
    setError(null);
    try {
      await addGroupMember(ownerPnIdentifier, groupId, addPn, 'readWrite');
      setAddPn('');
      await reload();
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (memberPn: string) => {
    if (memberPn === ownerPnIdentifier) return;
    setLoading(true);
    setError(null);
    try {
      await removeGroupMember(ownerPnIdentifier, groupId, memberPn);
      await reload();
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  const existing = new Set(memberPns);
  const addable = connections.filter((c) => !existing.has(c.userPnIdentifier));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Group settings</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-400">Title</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white text-sm"
              />
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveTitle}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-neutral-400 mb-2">Members</p>
            <ul className="space-y-2">
              {memberPns.map((pn) => {
                const row = members.find((m) => m.memberPnIdentifier === pn);
                const role = row?.accessRole || 'readWrite';
                return (
                  <li
                    key={pn}
                    className="flex items-center justify-between gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm"
                  >
                    <span className="text-white truncate">
                      {pn === ownerPnIdentifier ? `${pn.slice(0, 16)}… (owner)` : `${pn.slice(0, 20)}…`}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {pn !== ownerPnIdentifier && (
                        <>
                          <select
                            value={role}
                            disabled={loading}
                            onChange={(e) =>
                              handleRole(pn, e.target.value as GroupAccessRole)
                            }
                            className="rounded bg-neutral-700 text-xs text-white px-2 py-1"
                          >
                            <option value="readWrite">Can send</option>
                            <option value="readOnly">Read only</option>
                          </select>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleRemove(pn)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="text-xs text-neutral-400 mb-2">Add member</p>
            <div className="flex gap-2">
              <select
                value={addPn}
                onChange={(e) => setAddPn(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white text-sm"
              >
                <option value="">Select connection…</option>
                {addable.map((c) => (
                  <option key={c.userPnIdentifier} value={c.userPnIdentifier}>
                    {c.userPnIdentifier.slice(0, 24)}…
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={loading || !addPn}
                onClick={handleAdd}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
