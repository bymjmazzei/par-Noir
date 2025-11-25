/**
 * Report Content Modal
 * Allows users to report content as NSFW, spam, copyright violation, etc.
 */

import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { reportService } from '../../services/reporting/ReportService';
import type { AggregatedFile } from '../../types/aggregator';

interface ReportContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: AggregatedFile;
  authenticatedUser: { id: string } | null;
  onReportSubmitted?: () => void;
}

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  isOpen,
  onClose,
  file,
  authenticatedUser,
  onReportSubmitted
}) => {
  const [reportType, setReportType] = useState<'nsfw' | 'spam' | 'copyright' | 'other'>('nsfw');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  // Only show NSFW option if content is not already NSFW/X-rated
  const currentRating = (file as any).metadata?.contentRating;
  const canReportNSFW = currentRating !== 'nsfw' && currentRating !== 'x-rated';

  const handleSubmit = async () => {
    if (!authenticatedUser) {
      setError('You must be logged in to submit a report');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await reportService.submitReport(
        file.id,
        authenticatedUser.id,
        reportType,
        reason.trim() || undefined
      );

      if (result.success) {
        setSuccess(true);
        
        // Show escalation message if content was auto-escalated
        if (result.escalated && result.newRating) {
          setTimeout(() => {
            alert(`Content has been automatically flagged as ${result.newRating.toUpperCase()} due to multiple reports. The owner has been notified.`);
          }, 100);
        }

        // Callback
        onReportSubmitted?.();

        // Close modal after 2 seconds
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setReason('');
          setReportType('nsfw');
        }, 2000);
      } else {
        setError(result.error || 'Failed to submit report');
      }
    } catch (err) {
      console.error('Report submission error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      setReason('');
      setError(null);
      setSuccess(false);
      setReportType('nsfw');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-xl font-semibold text-white">Report Content</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* File Info */}
          <div className="bg-neutral-800 rounded-lg p-3">
            <p className="text-sm text-neutral-400 mb-1">File:</p>
            <p className="text-white text-sm truncate">
              {file.encrypted ? file.originalName : file.name}
            </p>
          </div>

          {/* Report Type Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              disabled={isSubmitting}
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {canReportNSFW && (
                <option value="nsfw">Report as NSFW</option>
              )}
              <option value="spam">Spam</option>
              <option value="copyright">Copyright Violation</option>
              <option value="other">Other</option>
            </select>
            {!canReportNSFW && reportType === 'nsfw' && (
              <p className="text-xs text-yellow-400 mt-1">
                This content is already flagged as {currentRating?.toUpperCase()}
              </p>
            )}
          </div>

          {/* Reason (Optional) */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Reason (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              placeholder="Provide additional details about why you're reporting this content..."
              rows={3}
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
            />
          </div>

          {/* Info Message */}
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-1">How reporting works:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Reports are reviewed automatically</li>
                <li>5 NSFW reports will automatically flag content</li>
                <li>The content owner will be notified</li>
              </ul>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-3 flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-300">
                Report submitted successfully. Thank you for helping keep the platform safe.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-2">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (!canReportNSFW && reportType === 'nsfw')}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

