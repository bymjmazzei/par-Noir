import React from 'react';
import { EMOJI_DATABASE } from './EmojiDatabase';

interface EmojiSelectorProps {
  emojiSearch: string;
  onEmojiSearchChange: (search: string) => void;
  onEmojiSelect: (emoji: string) => void;
}

export const EmojiSelector: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  emojiSearch,
  onEmojiSearchChange,
  onEmojiSelect
}) => {
  const filteredEmojis = EMOJI_DATABASE.filter(item =>
    item.name.toLowerCase().includes(emojiSearch.toLowerCase()) ||
    item.emoji.includes(emojiSearch)
  );

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
        Search and Select an Emoji
      </label>
      
      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          value={emojiSearch}
          onChange={(e) => onEmojiSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onEmojiSearchChange('');
            }
          }}
          placeholder="Search by name (e.g., 'smile', 'heart', 'house') or emoji..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg bg-white dark:bg-modal-bg text-gray-900 dark:text-text-primary focus:ring-2 focus:ring-blue-500 dark:focus:ring-primary focus:border-transparent transition-colors text-sm"
          autoFocus
        />
        {!emojiSearch && (
          <div className="mt-2 text-xs text-gray-500 dark:text-text-secondary">
            Try: "smile", "heart", "house", "car", "music", "food", "animal"
          </div>
        )}
      </div>
      
      {/* Emoji Grid */}
      <div className="p-4 border border-gray-300 dark:border-border rounded-lg bg-gray-50 dark:bg-secondary max-h-60 overflow-y-auto">
        <div className="grid grid-cols-8 gap-2">
          {filteredEmojis.length > 0 ? (
            filteredEmojis.map((item, index) => (
              <button
                key={index}
                onClick={() => onEmojiSelect(item.emoji)}
                className="w-8 h-8 text-xl hover:bg-gray-200 dark:hover:bg-border rounded transition-colors flex items-center justify-center"
                title={item.name}
              >
                {item.emoji}
              </button>
            ))
          ) : (
            <div className="col-span-8 text-center py-4 text-gray-500 dark:text-text-secondary text-sm">
              No emojis found for "{emojiSearch}"
            </div>
          )}
        </div>
        
        {/* Search Results Info */}
        {emojiSearch && (
          <div className="mt-3 text-xs text-gray-500 dark:text-text-secondary text-center">
            Showing {filteredEmojis.length} of {EMOJI_DATABASE.length} emojis
          </div>
        )}
      </div>
    </div>
  );
};
