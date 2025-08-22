import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import SimpleStorage, { SimpleIdentity } from '../utils/simpleStorage';

interface NicknameEditorProps {
  identity: SimpleIdentity;
  onSave: (updatedIdentity: SimpleIdentity) => void;
  onCancel: () => void;
}

export const NicknameEditor: React.FC<NicknameEditorProps> = ({
  identity,
  onSave,
  onCancel
}) => {
  const [nickname, setNickname] = useState(identity.nickname);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNickname(identity.nickname);
  }, [identity.nickname]);

  const handleSave = async () => {
    if (!nickname.trim()) {
      setError('Nickname cannot be empty');
      return;
    }

    if (nickname.trim() === identity.nickname) {
      onCancel();
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const storage = SimpleStorage.getInstance();
      const updatedIdentity = {
        ...identity,
        nickname: nickname.trim()
      };

      await storage.updateIdentity(updatedIdentity);
      onSave(updatedIdentity);
    } catch (err) {
      setError('Failed to update nickname');
      console.error('Error updating nickname:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        onKeyDown={handleKeyPress}
        className="flex-1 px-2 py-1 text-sm border border-input-border bg-input-bg rounded focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Enter nickname"
        autoFocus
        disabled={loading}
      />
      
      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}
      
      <div className="flex items-center space-x-1">
        <button
          onClick={handleSave}
          disabled={loading}
          className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
          title="Save"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="p-1 text-gray-600 hover:text-gray-700 disabled:opacity-50"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NicknameEditor;
