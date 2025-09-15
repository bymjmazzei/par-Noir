import React from 'react';

interface UrlInputProps {
  pictureUrl: string;
  onUrlChange: (url: string) => void;
}

export const UrlInput: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  pictureUrl,
  onUrlChange
}) => {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-2">
        Image URL
      </label>
      <input
        type="url"
        value={pictureUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg bg-white dark:bg-modal-bg text-gray-900 dark:text-text-primary focus:ring-2 focus:ring-blue-500 dark:focus:ring-primary focus:border-transparent transition-colors"
        placeholder="https://example.com/image.jpg"
      />
    </div>
  );
};
