/**
 * Upload Status Circle Component
 * Circular progress indicator in top left corner showing overall queue progress
 */

import React, { useState, useEffect } from 'react';
import { uploadQueueService, QueueProgress } from '../services/uploadQueueService';

interface UploadStatusCircleProps {
  onClick?: () => void;
}

export const UploadStatusCircle: React.FC<UploadStatusCircleProps> = ({ onClick }) => {
  const [progress, setProgress] = useState<QueueProgress>(uploadQueueService.getQueueProgress());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check initial visibility
    const initialProgress = uploadQueueService.getQueueProgress();
    setIsVisible(initialProgress.total > 0 && (initialProgress.pending > 0 || initialProgress.processing > 0 || initialProgress.uploading > 0));

    // Listen for queue changes
    const handleQueueChange = (queueProgress: QueueProgress) => {
      setProgress(queueProgress);
      setIsVisible(queueProgress.total > 0 && (queueProgress.pending > 0 || queueProgress.processing > 0 || queueProgress.uploading > 0));
    };

    uploadQueueService.on('queueChanged', handleQueueChange);

    return () => {
      uploadQueueService.off('queueChanged', handleQueueChange);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  const circumference = 2 * Math.PI * 20; // radius = 20
  const offset = circumference - (progress.overallProgress / 100) * circumference;

  return (
    <button
      onClick={onClick}
      className="fixed top-4 left-4 z-[200] w-12 h-12 rounded-full bg-neutral-900 border-2 border-neutral-700 hover:border-neutral-500 transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900"
      aria-label={`Upload progress: ${progress.overallProgress}%`}
      title={`Upload progress: ${progress.overallProgress}%`}
    >
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 44 44">
        {/* Background circle */}
        <circle
          cx="22"
          cy="22"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-neutral-700"
        />
        {/* Progress circle */}
        <circle
          cx="22"
          cy="22"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
          style={{
            transition: 'stroke-dashoffset 0.3s ease-in-out'
          }}
        />
      </svg>
      {/* Percentage text */}
      <span className="absolute text-xs font-medium text-white">
        {progress.overallProgress}%
      </span>
    </button>
  );
};

