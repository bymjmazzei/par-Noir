import React from 'react';
import { CheckCircle } from 'lucide-react';

interface PicturePreviewProps {
  previewUrl: string;
  onImageError: () => void;
}

export const PicturePreview: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  previewUrl,
  onImageError
}) => {
  if (!previewUrl) return null;

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
        Preview
      </label>
      <div className="flex justify-center">
        <div className="relative">
          <img
            src={previewUrl}
            alt="Profile preview"
            className="w-24 h-24 rounded-full object-cover border-2 border-gray-300 dark:border-border"
            onError={onImageError}
          />
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
};
