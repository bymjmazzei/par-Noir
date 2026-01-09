/**
 * Edit File Modal
 * Allows owners to edit file visibility and metadata through dashboard APIs
 */

import React, { useState, useEffect } from 'react';
import { X, Globe, Lock, Users, Star } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { uploadQueueService } from '../services/uploadQueueService';

interface EditFileModalProps {
  file: IndexedFile;
  onClose: () => void;
  onSave: (file: IndexedFile) => void;
}

export function EditFileModal({ file, onClose, onSave }: EditFileModalProps) {
  const { userState } = useUserState();
  const [visibility, setVisibility] = useState<'public' | 'private' | 'friends'>(
    file.metadata.visibility || (file.metadata.isPublic ? 'public' : 'private')
  );
  const [name, setName] = useState(file.metadata.name || file.metadata.title || '');
  const [description, setDescription] = useState(file.metadata.description || '');
  const [tags, setTags] = useState((file.metadata.keywords || file.metadata.tags || []).join(', '));
  const [isTopPost, setIsTopPost] = useState(file.metadata.isTopPost || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      setError('You must be unlocked to edit files');
      return;
    }

    setError(null);
    const fileId = file.metadata.fileId || file.metadata.backendFileId;

    // Optimistically update local file state
    const updatedFile: IndexedFile = {
      ...file,
      metadata: {
        ...file.metadata,
        visibility: visibility,
        isPublic: visibility === 'public',
        name: name.trim() || file.metadata.name,
        title: name.trim() || file.metadata.title,
        description: description.trim() || undefined,
        keywords: tags.split(',').map(t => t.trim()).filter(Boolean),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        isTopPost: isTopPost
      }
    };
    onSave(updatedFile);
    onClose();

    // Queue background task
    uploadQueueService.addTask({
      type: 'updateMetadata',
      accountId: '', // Not used in aggregator-browser context
      metadata: {
        fileId,
        accountId: '', // Optional - not used for metadata updates in aggregator-browser
        metadata: {
          name: name.trim() || undefined,
          title: name.trim() || undefined,
          description: description.trim() || undefined,
          tags: tags,
          genre: '', // Not used in EditFileModal
          categories: [], // Not used in EditFileModal
          locationName: '', // Not used in EditFileModal
          locationAddress: '', // Not used in EditFileModal
          license: undefined, // Not used in EditFileModal
          // Additional fields for EditFileModal
          isPublic: visibility === 'public',
          visibility: visibility,
          isTopPost: isTopPost
        }
      },
      onComplete: (result) => {
        console.log('✅ [EditFileModal] Metadata updated:', result);
        // Update with actual result if needed
        if (result?.metadata) {
          const finalUpdatedFile: IndexedFile = {
            ...updatedFile,
            metadata: {
              ...updatedFile.metadata,
              ...result.metadata
            }
          };
          onSave(finalUpdatedFile);
        }
      },
      onError: (error) => {
        console.error('❌ [EditFileModal] Failed to update metadata:', error);
        setError(error.message || 'Failed to update file');
        // Rollback optimistic update - would need to re-open modal or show undo toast
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-neutral-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <h2 className="text-white text-xl font-bold">Edit File</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Visibility */}
          <div>
            <label className="block text-white font-medium mb-3">Visibility</label>
            <div className="space-y-2">
              <button
                onClick={() => setVisibility('public')}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                  visibility === 'public'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750'
                }`}
              >
                <Globe className={`h-5 w-5 ${visibility === 'public' ? 'text-blue-400' : 'text-neutral-400'}`} />
                <div className="flex-1 text-left">
                  <div className="text-white font-medium">Public</div>
                  <div className="text-xs text-neutral-400">Visible to everyone</div>
                </div>
              </button>
              <button
                onClick={() => setVisibility('friends')}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                  visibility === 'friends'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750'
                }`}
              >
                <Users className={`h-5 w-5 ${visibility === 'friends' ? 'text-blue-400' : 'text-neutral-400'}`} />
                <div className="flex-1 text-left">
                  <div className="text-white font-medium">Friends</div>
                  <div className="text-xs text-neutral-400">Visible to connections</div>
                </div>
              </button>
              <button
                onClick={() => setVisibility('private')}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                  visibility === 'private'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750'
                }`}
              >
                <Lock className={`h-5 w-5 ${visibility === 'private' ? 'text-blue-400' : 'text-neutral-400'}`} />
                <div className="flex-1 text-left">
                  <div className="text-white font-medium">Private</div>
                  <div className="text-xs text-neutral-400">Only visible to you</div>
                </div>
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-white font-medium mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="File name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-white font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Add a description..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-white font-medium mb-2">Tags</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-neutral-400 mt-1">Separate tags with commas</p>
          </div>

          {/* Top Post */}
          <div>
            <label className="block text-white font-medium mb-3">Top Post</label>
            <button
              onClick={() => setIsTopPost(!isTopPost)}
              className={`w-full flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                isTopPost
                  ? 'border-yellow-500 bg-yellow-500/20'
                  : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750'
              }`}
            >
              <Star className={`h-5 w-5 ${isTopPost ? 'text-yellow-400 fill-yellow-400' : 'text-neutral-400'}`} />
              <div className="flex-1 text-left">
                <div className="text-white font-medium">Set as Top Post</div>
                <div className="text-xs text-neutral-400">
                  {isTopPost 
                    ? 'This post will appear at the top of your profile and be used as your profile icon'
                    : 'Pin this post to the top of your profile feeds'}
                </div>
              </div>
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

