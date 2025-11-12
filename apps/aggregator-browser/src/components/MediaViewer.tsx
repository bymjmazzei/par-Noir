/**
 * Media Viewer Component
 * Full-screen media viewer for images and videos
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2 } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { EngagementActions } from './EngagementActions';
import { useEngagement } from '../hooks/useEngagement';

interface MediaViewerProps {
  file: IndexedFile;
  blob: Blob;
  url: string;
  onClose: () => void;
}

export function MediaViewer({ file, blob, url, onClose }: MediaViewerProps) {
  const { getLikeCount, isLiked, getComments, getShareCount } = useEngagement();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isVideo = file.metadata.fileType === 'video' || 
                 (file.metadata.name || file.metadata.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
  const isImage = file.metadata.fileType === 'image' || 
                 (file.metadata.name || file.metadata.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+') {
        setZoom(prev => Math.min(prev + 0.1, 3));
      } else if (e.key === '-') {
        setZoom(prev => Math.max(prev - 0.1, 0.5));
      } else if (e.key === 'r' || e.key === 'R') {
        setRotation(prev => (prev + 90) % 360);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.metadata.name || file.metadata.title || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">
            {file.metadata.name || file.metadata.title || 'Media'}
          </h3>
          {file.metadata.description && (
            <p className="text-text-secondary text-sm truncate">{file.metadata.description}</p>
          )}
        </div>
        <div className="flex items-center space-x-2 ml-4">
          {isImage && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                title="Zoom Out (-)"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                onClick={handleZoomIn}
                className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                title="Zoom In (+)"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                title="Rotate (R)"
              >
                <RotateCw className="h-5 w-5" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors text-xs"
                title="Reset"
              >
                Reset
              </button>
            </>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Media Container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-4"
      >
        {isVideo ? (
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-full object-contain"
          />
        ) : isImage ? (
          <img
            ref={imageRef}
            src={url}
            alt={file.metadata.name || file.metadata.title || 'Media'}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              cursor: zoom > 1 ? 'grab' : 'default'
            }}
            draggable={false}
          />
        ) : (
          <div className="text-center text-white">
            <p>Unsupported media type</p>
            <button
              onClick={handleDownload}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Download File
            </button>
          </div>
        )}
      </div>

      {/* Footer with Engagement */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <EngagementActions
            file={{
              ...file,
              metadata: {
                ...file.metadata,
                engagement: {
                  ...file.metadata.engagement,
                  likes: getLikeCount(file.metadata.fileId, file.metadata.engagement?.likes || 0),
                  comments: getComments(file.metadata.fileId).length + (file.metadata.engagement?.comments || 0),
                  shares: getShareCount(file.metadata.fileId, file.metadata.engagement?.shares || 0)
                }
              }
            }}
            onLike={() => {}}
            onComment={() => {}}
            onShare={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

