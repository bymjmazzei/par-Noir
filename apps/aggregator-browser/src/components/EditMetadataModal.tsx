/**
 * Edit Metadata Modal
 * Reusable metadata editor matching the FileStorageAggregator edit metadata modal
 * Used for thoughts, collections, and file editing
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { LICENSE_TYPES } from '../constants/licenses';
import { FeedCategory } from '../types/aggregator';

export interface MetadataFormData {
  name: string;
  description: string;
  tags: string;
  genre: string;
  category: FeedCategory | '';
  locationName: string;
  locationAddress: string;
  license: string;
}

interface EditMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MetadataFormData) => void;
  initialData?: Partial<MetadataFormData>;
  title?: string;
  submitButtonText?: string;
  isLoading?: boolean;
}

export function EditMetadataModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title = 'Edit Metadata',
  submitButtonText = 'Save Changes',
  isLoading = false
}: EditMetadataModalProps) {
  const [editForm, setEditForm] = useState<MetadataFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    tags: initialData?.tags || '',
    genre: initialData?.genre || '',
    category: initialData?.category || '',
    locationName: initialData?.locationName || '',
    locationAddress: initialData?.locationAddress || '',
    license: initialData?.license || 'all-rights-reserved'
  });

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setEditForm(prev => ({
        ...prev,
        ...initialData
      }));
    }
  }, [initialData]);

  const handleSave = () => {
    onSave(editForm);
  };

  const handleClose = () => {
    setEditForm({
      name: '',
      description: '',
      tags: '',
      genre: '',
      category: '',
      locationName: '',
      locationAddress: '',
      license: 'all-rights-reserved'
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div 
        className="bg-neutral-800 rounded-lg p-6 max-w-md w-full text-text-primary border border-neutral-700 shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={handleClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="space-y-4 overflow-y-auto pr-2 -mr-2 flex-1">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Name / Title
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Description"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={editForm.tags}
              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tag1, tag2, tag3"
            />
          </div>

          <div className="border-t border-neutral-700 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-text-primary mb-3">Content Classification</h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Category <span className="text-red-400">*</span>
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value as FeedCategory | '' })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a category</option>
                  {FEED_CATEGORY_LIST
                    .map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-text-secondary mt-1">Required: Select the niche category for this content</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Genre (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.genre}
                  onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="photography, art, documentation"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-700 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-text-primary mb-3">Location</h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Place Name
                </label>
                <input
                  type="text"
                  value={editForm.locationName}
                  onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Central Park, New York"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Address (City, State, Country)
                </label>
                <input
                  type="text"
                  value={editForm.locationAddress}
                  onChange={(e) => setEditForm({ ...editForm, locationAddress: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New York, NY, USA"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-700 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-text-primary mb-3">Rights & Licensing</h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  License
                </label>
                <select
                  value={editForm.license}
                  onChange={(e) => setEditForm({ ...editForm, license: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a license</option>
                  {LICENSE_TYPES.map(license => (
                    <option key={license.value} value={license.value}>
                      {license.label} - {license.description}
                    </option>
                  ))}
                </select>
                {editForm.license && (
                  <p className="text-xs text-text-secondary mt-1">
                    {LICENSE_TYPES.find(l => l.value === editForm.license)?.description}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 flex-shrink-0 border-t border-neutral-700 mt-4">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || !editForm.category}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : submitButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

