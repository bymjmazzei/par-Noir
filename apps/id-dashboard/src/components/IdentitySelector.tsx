import React, { useState, useEffect } from 'react';
import { ChevronDown, FileText, Plus, Upload, Trash2 } from 'lucide-react';
import SimpleStorage, { SimpleIdentity } from '../utils/simpleStorage';

interface IdentitySelectorProps {
  selectedIdentity: SimpleIdentity | null;
  onIdentitySelect: (identity: SimpleIdentity | null) => void;
  onUploadNew: () => void;
  onCreateNew: () => void;
  onDeleteIdentity: (identity: SimpleIdentity) => void;
  disabled?: boolean;
}

export const IdentitySelector: React.FC<IdentitySelectorProps> = ({
  selectedIdentity,
  onIdentitySelect,
  onUploadNew,
  onCreateNew,
  onDeleteIdentity,
  disabled = false
}) => {
  const [identities, setIdentities] = useState<SimpleIdentity[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIdentities = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const storage = SimpleStorage.getInstance();
      const storedIdentities = await storage.getIdentities();
      setIdentities(storedIdentities);
      
      console.log('Loaded identities for selector:', storedIdentities.length);
    } catch (err) {
      setError('Failed to load identities');
      console.error('Error loading identities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIdentities();
  }, []);

  const handleIdentitySelect = (identity: SimpleIdentity) => {
    onIdentitySelect(identity);
    setIsOpen(false);
  };

  const handleClearSelection = () => {
    onIdentitySelect(null);
    setIsOpen(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium text-text-primary mb-1">
          Select Identity
        </label>
        <div className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-sm text-text-secondary">Loading identities...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium text-text-primary mb-1">
          Select Identity
        </label>
        <div className="w-full px-3 py-2 border border-red-300 bg-red-50 rounded-md">
          <div className="text-red-600 text-sm">{error}</div>
          <button
            onClick={loadIdentities}
            className="mt-1 text-xs text-red-700 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <label className="block text-sm font-medium text-text-primary mb-1">
        Select Identity
      </label>
      
      {/* Show message when no identities are stored */}
      {identities.length === 0 ? (
        <div className="p-4 border-2 border-dashed border-input-border bg-input-bg rounded-lg text-center">
          <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-2">No stored identities found</p>
          <p className="text-xs text-text-secondary">
            Upload a PN file to store it for quick access
          </p>
        </div>
      ) : (
        /* Main Selector Button */
        <div className="relative">
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className={`w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-between ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary'
            }`}
          >
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-text-secondary" />
              <span className="text-text-primary">
                {selectedIdentity ? (
                  <span className="font-medium">{selectedIdentity.nickname}</span>
                ) : (
                  <span className="text-text-secondary">Choose an identity...</span>
                )}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isOpen && !disabled && (
            <div className="absolute z-50 w-full mt-1 bg-modal-bg border border-input-border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {/* Header Actions */}
              <div className="p-2 border-b border-input-border">
                <div className="flex space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      onCreateNew();
                    }}
                    className="flex-1 flex items-center justify-center px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    New
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      onUploadNew();
                    }}
                    className="flex-1 flex items-center justify-center px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload
                  </button>
                </div>
              </div>

              {/* Identity List */}
              <div className="py-1">
                {/* Clear Selection Option */}
                <button
                  onClick={handleClearSelection}
                  className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-hover flex items-center space-x-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>Clear selection</span>
                </button>
                
                {/* Identity Options */}
                {identities.map((identity) => (
                  <div
                    key={identity.id}
                    className={`px-3 py-2 hover:bg-hover cursor-pointer ${
                      selectedIdentity?.id === identity.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => handleIdentitySelect(identity)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-text-secondary" />
                          <div>
                            <div className="font-medium text-text-primary">
                              {identity.nickname}
                            </div>
                            <div className="text-xs text-text-secondary">
                              @{identity.username} • {formatDate(identity.createdAt)}
                            </div>
                          </div>
                        </div>
                      </button>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center space-x-1 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Are you sure you want to delete "${identity.nickname}"?`)) {
                              onDeleteIdentity(identity);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Delete identity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected Identity Info */}
      {selectedIdentity && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <div>
                <div className="text-sm font-medium text-blue-900">
                  {selectedIdentity.nickname}
                </div>
                <div className="text-xs text-blue-700">
                  @{selectedIdentity.username} • Created {formatDate(selectedIdentity.createdAt)}
                </div>
              </div>
            </div>
            <button
              onClick={handleClearSelection}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdentitySelector;
