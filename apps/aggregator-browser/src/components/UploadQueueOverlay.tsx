/**
 * Upload Queue Overlay Component
 * Shows detailed queue status with all upload tasks
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, Loader2, Clock, Upload as UploadIcon } from 'lucide-react';
import { uploadQueueService, UploadTask, QueueProgress } from '../services/uploadQueueService';

interface UploadQueueOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UploadQueueOverlay: React.FC<UploadQueueOverlayProps> = ({ isOpen, onClose }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [progress, setProgress] = useState<QueueProgress>(uploadQueueService.getQueueProgress());

  useEffect(() => {
    if (!isOpen) return;

    const updateTasks = () => {
      setTasks(uploadQueueService.getAllTasks());
      setProgress(uploadQueueService.getQueueProgress());
    };

    // Initial load
    updateTasks();

    // Listen for changes
    const handleQueueChange = (queueProgress: QueueProgress) => {
      setProgress(queueProgress);
      setTasks(uploadQueueService.getAllTasks());
    };

    const handleTaskUpdate = () => {
      updateTasks();
    };

    uploadQueueService.on('queueChanged', handleQueueChange);
    uploadQueueService.on('taskUpdated', handleTaskUpdate);
    uploadQueueService.on('taskProgress', handleTaskUpdate);

    return () => {
      uploadQueueService.off('queueChanged', handleQueueChange);
      uploadQueueService.off('taskUpdated', handleTaskUpdate);
      uploadQueueService.off('taskProgress', handleTaskUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getStatusIcon = (status: UploadTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'processing':
      case 'uploading':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-gray-500" />;
      default:
        return <UploadIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: UploadTask['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'processing':
      case 'uploading':
        return 'text-blue-500';
      case 'pending':
        return 'text-gray-400';
      case 'cancelled':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  const getTaskName = (task: UploadTask): string => {
    if (task.file) {
      return task.file.name;
    }
    if (task.textPost) {
      const content = task.textPost.content || '';
      return content.replace(/<[^>]*>/g, '').substring(0, 50) || 'Thought';
    }
    if (task.pages && task.pages.length > 0) {
      return `Multi-page thought (${task.pages.length} pages)`;
    }
    return `Upload ${task.id.substring(0, 8)}`;
  };

  const handleCancel = (taskId: string) => {
    uploadQueueService.cancelTask(taskId);
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[250]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[251] flex items-center justify-center p-4">
        <div
          className="bg-neutral-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-neutral-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-neutral-800">
            <div>
              <h2 className="text-xl font-semibold text-white">Upload Queue</h2>
              <p className="text-sm text-text-secondary mt-1">
                {progress.total} total • {progress.completed} completed • {progress.failed} failed
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-white transition-colors rounded-lg hover:bg-neutral-800"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Summary */}
          <div className="px-6 py-4 bg-neutral-800/50 border-b border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">Overall Progress</span>
              <span className="text-sm font-semibold text-white">{progress.overallProgress}%</span>
            </div>
            <div className="w-full bg-neutral-700 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-6">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-text-secondary">
                <UploadIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No uploads in queue</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-neutral-800 rounded-lg p-4 border border-neutral-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {getStatusIcon(task.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-white truncate">
                              {getTaskName(task)}
                            </p>
                            <span className={`text-xs font-medium ${getStatusColor(task.status)}`}>
                              {task.status}
                            </span>
                          </div>
                          {task.status === 'processing' || task.status === 'uploading' ? (
                            <div className="mt-2">
                              <div className="w-full bg-neutral-700 rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <p className="text-xs text-text-secondary mt-1">{task.progress}%</p>
                            </div>
                          ) : null}
                          {task.error && (
                            <p className="text-xs text-red-400 mt-1">{task.error}</p>
                          )}
                        </div>
                      </div>
                      {(task.status === 'pending' || task.status === 'processing' || task.status === 'uploading') && (
                        <button
                          onClick={() => handleCancel(task.id)}
                          className="ml-4 p-1.5 text-text-secondary hover:text-red-400 transition-colors rounded"
                          aria-label="Cancel upload"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

