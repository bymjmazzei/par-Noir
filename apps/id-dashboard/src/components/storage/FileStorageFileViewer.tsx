import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import type { AggregatedFile, PublicMetadata } from '../../types/aggregator';
import { isImageFile, isVideoFile, isAudioFile } from './FileStorageAggregatorHelpers';

export const FileStorageFileViewer: React.FC<{
  file: AggregatedFile;
  previewUrl: string | null;
  fileMetadata?: PublicMetadata;
  onClose: () => void;
}> = ({ file, previewUrl, fileMetadata, onClose }) => {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(previewUrl);
  const [loading, setLoading] = useState(!previewUrl);
  const [error, setError] = useState<string | null>(null);
  const mimeType = file.mimeType || '';
  const fileName = file.originalName || file.name || '';
  const isImage = isImageFile(mimeType, fileName);
  const isVideo = isVideoFile(mimeType, fileName);
  const isAudio = isAudioFile(mimeType, fileName);

  useEffect(() => {
    if (previewUrl) {
      setDecryptedUrl(previewUrl);
      setLoading(false);
      return;
    }

    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!fileMetadata?.publicToken) {
          throw new Error('File token not found. Please reload the page.');
        }

        const shareToken = typeof fileMetadata.publicToken === 'string'
          ? JSON.parse(fileMetadata.publicToken)
          : fileMetadata.publicToken;

        const { decryptWithToken } = await import('../../utils/tokenDecryption');
        const decryptedBlob = await decryptWithToken(shareToken);
        const url = URL.createObjectURL(decryptedBlob);
        setDecryptedUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
        console.error('Error loading file:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFile();

    return () => {
      if (decryptedUrl && decryptedUrl !== previewUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, previewUrl, fileMetadata]);

  if (loading) {
    return (
      <div className="text-center">
        <RefreshCw className="h-12 w-12 text-white animate-spin mx-auto mb-4" />
        <p className="text-white">Loading file...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400">{error}</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Close
        </button>
      </div>
    );
  }

  console.log('🔍 [FileViewer] Render check:', {
    hasDecryptedUrl: !!decryptedUrl,
    mimeType,
    fileName,
    isImage,
    isVideo,
    isAudio,
    hasFileMetadata: !!fileMetadata,
    hasPublicToken: !!fileMetadata?.publicToken
  });

  if (!decryptedUrl) {
    return null;
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      {isImage && (
        <img
          src={decryptedUrl}
          alt={file.encrypted ? file.originalName : file.name}
          className="max-w-full max-h-full object-contain"
        />
      )}
      {isVideo && (
        <video
          src={decryptedUrl}
          controls
          autoPlay
          className="max-w-full max-h-full"
        />
      )}
      {isAudio && (
        <div className="bg-neutral-800 rounded-lg p-8">
          <audio src={decryptedUrl} controls className="w-full" />
          <p className="text-white mt-4 text-center">{file.encrypted ? file.originalName : file.name}</p>
        </div>
      )}
      {!isImage && !isVideo && !isAudio && (
        <div className="bg-neutral-800 rounded-lg p-8 max-w-2xl">
          <p className="text-white text-center mb-4">{file.encrypted ? file.originalName : file.name}</p>
          <p className="text-text-secondary text-center">
            Preview not available for this file type. Please download to view.
          </p>
          <p className="text-text-secondary text-center text-xs mt-2">
            Debug: mimeType={mimeType || 'none'}, fileName={fileName}
          </p>
          <button
            onClick={onClose}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto block"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
