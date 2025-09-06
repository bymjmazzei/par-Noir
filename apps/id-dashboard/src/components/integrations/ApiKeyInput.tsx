import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface ApiKey {
  label: string;
  value: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  description?: string;
}

interface ApiKeyInputProps {
  apiKey: ApiKey;
  value: string;
  showPassword: boolean;
  onChange: (value: string) => void;
  onTogglePassword: () => void;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = React.memo(({ 
  apiKey, 
  value, 
  showPassword, 
  onChange, 
  onTogglePassword 
}) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {apiKey.label}
        {apiKey.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <input
          type={apiKey.type === 'password' && !showPassword ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder={`Enter ${apiKey.label.toLowerCase()}`}
        />
        {apiKey.type === 'password' && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {apiKey.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {apiKey.description}
        </p>
      )}
    </div>
  );
});

ApiKeyInput.displayName = 'ApiKeyInput';
