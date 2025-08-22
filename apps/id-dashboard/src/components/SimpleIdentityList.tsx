import React, { useState, useEffect } from 'react';
import { FileText, Plus, Upload, Trash2 } from 'lucide-react';
import SimpleStorage, { SimpleIdentity } from '../utils/simpleStorage';

interface SimpleIdentityListProps {
  onIdentitySelect: (identity: SimpleIdentity) => void;
  onCreateNew: () => void;
  onImportFile: () => void;
  selectedIdentity?: SimpleIdentity | null;
}

export const SimpleIdentityList: React.FC<SimpleIdentityListProps> = ({
  onIdentitySelect,
  onCreateNew,
  onImportFile,
  selectedIdentity
}) => {
  const [identities, setIdentities] = useState<SimpleIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIdentities = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const storage = SimpleStorage.getInstance();
      const storedIdentities = await storage.getIdentities();
      setIdentities(storedIdentities);
      
      console.log('Loaded identities:', storedIdentities.length);
    } catch (err) {
      setError('Failed to load identities');
      console.error('Error loading identities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIdentity = async (identity: SimpleIdentity) => {
    if (!confirm(`Are you sure you want to delete "${identity.nickname}"?`)) {
      return;
    }

    try {
      const storage = SimpleStorage.getInstance();
      await storage.deleteIdentity(identity.id);
      await loadIdentities(); // Reload the list
    } catch (err) {
      setError('Failed to delete identity');
      console.error('Error deleting identity:', err);
    }
  };

  useEffect(() => {
    loadIdentities();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading identities...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <div className="text-red-500 mb-4">{error}</div>
        <button
          onClick={loadIdentities}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your Identities</h2>
        <div className="flex space-x-2">
          <button
            onClick={onCreateNew}
            className="flex items-center px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Plus className="w-4 h-4 mr-1" />
            New ID
          </button>
          <button
            onClick={onImportFile}
            className="flex items-center px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            <Upload className="w-4 h-4 mr-1" />
            Import
          </button>
        </div>
      </div>

      {/* Identity List */}
      {identities.length === 0 ? (
        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No identities found</h3>
          <p className="text-gray-500 mb-4">
            Create your first identity or import an existing one to get started.
          </p>
          <div className="flex justify-center space-x-2">
            <button
              onClick={onCreateNew}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Create New ID
            </button>
            <button
              onClick={onImportFile}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Import ID
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {identities.map((identity) => (
            <div
              key={identity.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedIdentity?.id === identity.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => onIdentitySelect(identity)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <div>
                    <h3 className="font-medium text-gray-900">{identity.nickname}</h3>
                    <p className="text-sm text-gray-500">@{identity.username}</p>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(identity.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteIdentity(identity);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SimpleIdentityList;
