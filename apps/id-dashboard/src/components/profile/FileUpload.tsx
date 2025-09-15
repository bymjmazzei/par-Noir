import React, { useRef } from 'react';
import { Upload, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  uploadedFile: File | null;
  onFileUpload: (file: File | null) => void;
}

export const FileUpload: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  uploadedFile,
  onFileUpload
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onFileUpload(file);
  };

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
        Upload Image
      </label>
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="border-2 border-dashed border-gray-300 dark:border-border rounded-lg p-8 text-center hover:border-blue-500 dark:hover:border-primary transition-colors cursor-pointer bg-gray-50 dark:bg-secondary">
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-text-secondary" />
          <div className="text-lg font-medium text-gray-700 dark:text-text-primary mb-2">
            Click to upload or drag and drop
          </div>
          <div className="text-sm text-gray-500 dark:text-text-secondary">
            JPG, PNG, GIF, WebP up to 5MB
          </div>
        </div>
      </div>
      {uploadedFile && (
        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-800 dark:text-green-300">
              File selected: {uploadedFile.name}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
