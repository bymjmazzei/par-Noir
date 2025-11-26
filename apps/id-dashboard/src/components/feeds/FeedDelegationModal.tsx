/**
 * Feed Delegation Modal
 * Allows feed owners to delegate access to other pNs
 */

import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Shield, Edit, Eye } from 'lucide-react';
import { FeedService } from '../../services/feeds/FeedService';

interface FeedDelegationModalProps {
  feedId: string;
  feedName: string;
  isOpen: boolean;
  onClose: () => void;
  authenticatedUser: { id: string } | null;
}

interface Delegate {
  delegationId: string;
  delegateDid: string;
  delegateName?: string;
  permissions: ('read' | 'write' | 'manage')[];
  createdAt: string;
}

export const FeedDelegationModal: React.FC<FeedDelegationModalProps> = ({
  feedId,
  feedName,
  isOpen,
  onClose,
  authenticatedUser
}) => {
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newDelegateDid, setNewDelegateDid] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<('read' | 'write' | 'manage')[]>(['read']);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && feedId) {
      loadDelegates();
    }
  }, [isOpen, feedId]);

  const loadDelegates = async () => {
    if (!authenticatedUser) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await FeedService.getDelegates(feedId);
      setDelegates(result.delegates.map(d => ({
        ...d,
        permissions: d.permissions as ('read' | 'write' | 'manage')[]
      })));
    } catch (err) {
      console.error('Failed to load delegates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load delegates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDelegate = async () => {
    if (!authenticatedUser || !newDelegateDid.trim()) {
      setError('Please enter a pN identifier');
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      await FeedService.delegateFeed(feedId, newDelegateDid, selectedPermissions);
      
      setNewDelegateDid('');
      setSelectedPermissions(['read']);
      await loadDelegates();
    } catch (err) {
      console.error('Failed to add delegate:', err);
      setError(err instanceof Error ? err.message : 'Failed to add delegate');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveDelegate = async (delegationId: string) => {
    if (!authenticatedUser) return;

    if (!confirm('Are you sure you want to remove this delegate?')) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await FeedService.removeDelegate(feedId, delegationId);
      
      await loadDelegates();
    } catch (err) {
      console.error('Failed to remove delegate:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove delegate');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePermission = (permission: 'read' | 'write' | 'manage') => {
    setSelectedPermissions(prev => {
      if (prev.includes(permission)) {
        // Remove permission, but keep at least 'read'
        if (permission === 'read') return prev;
        return prev.filter(p => p !== permission);
      } else {
        // Add permission
        // If adding 'manage', also add 'write'
        // If adding 'write', also add 'read'
        if (permission === 'manage') {
          return ['read', 'write', 'manage'];
        } else if (permission === 'write') {
          return ['read', 'write'];
        } else {
          return [...prev, permission];
        }
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Delegate Feed Access</h2>
            <p className="text-sm text-neutral-400 mt-1">{feedName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Add Delegate Form */}
        <div className="mb-6 p-4 bg-neutral-800 rounded-lg">
          <h3 className="text-sm font-medium text-white mb-4 flex items-center">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Delegate
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                pN Identifier
              </label>
              <input
                type="text"
                value={newDelegateDid}
                onChange={(e) => setNewDelegateDid(e.target.value)}
                placeholder="pn-..."
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Permissions
              </label>
              <div className="space-y-2">
                {(['read', 'write', 'manage'] as const).map(permission => (
                  <label
                    key={permission}
                    className="flex items-center space-x-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(permission)}
                      onChange={() => togglePermission(permission)}
                      disabled={permission === 'read'} // Read is always required
                      className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex items-center space-x-2">
                      {permission === 'read' && <Eye className="h-4 w-4 text-blue-400" />}
                      {permission === 'write' && <Edit className="h-4 w-4 text-green-400" />}
                      {permission === 'manage' && <Shield className="h-4 w-4 text-purple-400" />}
                      <span className="text-sm text-white capitalize">{permission}</span>
                      {permission === 'read' && (
                        <span className="text-xs text-neutral-400">(Required)</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleAddDelegate}
              disabled={isAdding || !newDelegateDid.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding ? 'Adding...' : 'Add Delegate'}
            </button>
          </div>
        </div>

        {/* Current Delegates */}
        <div>
          <h3 className="text-sm font-medium text-white mb-4">Current Delegates</h3>
          
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-neutral-400">Loading delegates...</p>
            </div>
          ) : delegates.length === 0 ? (
            <div className="text-center py-8 bg-neutral-800 rounded-lg">
              <p className="text-neutral-400">No delegates yet</p>
              <p className="text-xs text-neutral-500 mt-1">Add a delegate to share feed access</p>
            </div>
          ) : (
            <div className="space-y-2">
              {delegates.map(delegate => (
                <div
                  key={delegate.delegationId}
                  className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">
                      {delegate.delegateName || delegate.delegateDid}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {delegate.delegateDid}
                    </p>
                    <div className="flex items-center space-x-2 mt-2">
                      {delegate.permissions.map(perm => (
                        <span
                          key={perm}
                          className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveDelegate(delegate.delegationId)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                    title="Remove delegate"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

