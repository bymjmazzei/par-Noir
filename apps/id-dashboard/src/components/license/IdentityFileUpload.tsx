import React from 'react';

interface IdentityFileUploadProps {
  identityFile: File | null;
  onFileUpload: (file: File | null) => void;
  borderColor: string;
  inputBgColor: string;
  textColor: string;
  secondaryTextColor: string;
}

export const IdentityFileUpload: React.FC<IdentityFileUploadProps> = React.memo(({ 
  identityFile, 
  onFileUpload, 
  borderColor, 
  inputBgColor, 
  textColor, 
  secondaryTextColor 
}) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onFileUpload(file);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2" style={{ color: secondaryTextColor }}>
        Identity File
      </label>
      <div className="relative">
        <input
          type="file"
          accept=".pn,.id,.json,.identity"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          id="license-file-upload"
        />
        <label
          htmlFor="license-file-upload"
          className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
          style={{ 
            borderColor: borderColor,
            backgroundColor: inputBgColor
          }}
        >
          <div className="text-center">
            <div className="text-2xl mb-2">↑</div>
            <div className="text-sm font-medium" style={{ color: textColor }}>
              {identityFile ? identityFile.name : 'Tap to upload identity file'}
            </div>
            <div className="text-xs mt-1" style={{ color: secondaryTextColor }}>
              (.pn, .id, .json, .identity files)
            </div>
          </div>
        </label>
      </div>
      <p className="text-xs mt-2" style={{ color: secondaryTextColor }}>
        Your license will be bound to this specific identity file for security.
      </p>
    </div>
  );
});

IdentityFileUpload.displayName = 'IdentityFileUpload';
