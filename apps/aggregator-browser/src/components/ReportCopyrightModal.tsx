/**
 * Report content modal (copyright, prohibited, or unsafe link) → Prism queue
 */

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export type ContentReportType = 'copyright' | 'prohibited' | 'unsafe_link';

interface ReportCopyrightModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  /** Link the viewer chose to report from a Pen button. Preselects the unsafe link reason. */
  link?: string;
  onSubmit: (reportType: ContentReportType) => Promise<void>;
}

export function ReportCopyrightModal({
  isOpen,
  onClose,
  fileName,
  link,
  onSubmit,
}: ReportCopyrightModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ContentReportType>(link ? 'unsafe_link' : 'copyright');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(reportType);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />
          <h3 className="text-lg font-semibold text-white">Report content</h3>
        </div>
        <p className="text-neutral-400 text-sm mb-3">
          Reports are reviewed by Prism Rays.
          {fileName && (
            <span className="block mt-2 text-neutral-500 truncate">File: {fileName}</span>
          )}
          {link && (
            <span className="block mt-1 text-neutral-500 break-all">Link: {link}</span>
          )}
        </p>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Reason
        </label>
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as ContentReportType)}
          disabled={submitting}
          className="w-full mb-4 p-2 bg-neutral-800 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        >
          <option value="copyright">Copyright violation</option>
          <option value="prohibited">Prohibited / illegal</option>
          <option value="unsafe_link">Phishing / unsafe link</option>
        </select>
        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2 px-4 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 px-4 rounded-lg bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
