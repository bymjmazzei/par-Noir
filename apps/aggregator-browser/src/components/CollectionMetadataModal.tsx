/**
 * Collection Metadata Modal
 * Allows users to add title, description, tags, and visibility before creating a collection
 */

import React, { useState } from 'react';
import { X, Globe, Lock, Users } from 'lucide-react';

interface CollectionMetadataModalProps {
  onSave: (metadata: { title: string; description: string; tags: string[]; visibility: 'public' | 'private' | 'friends' }) => void;
  onCancel: () => void;
  defaultTitle?: string;
}

export function CollectionMetadataModal({ onSave, onCancel, defaultTitle = '' }: CollectionMetadataModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'friends'>('public');

  const handleSave = () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    
    const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    onSave({
      title: title.trim(),
      description: description.trim(),
      tags: tagsArray,
      visibility
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-neutral-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <h2 className="text-white text-xl font-bold">Collection Metadata</h2>
          <button
            onClick={onCancel}
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

          {/* Name/Title */}
          <div>
            <label className="block text-white font-medium mb-2">Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Collection name"
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-neutral-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Collection
          </button>
        </div>
      </div>
    </div>
  );
}

