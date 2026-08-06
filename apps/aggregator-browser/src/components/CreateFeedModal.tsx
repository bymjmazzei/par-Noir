/**
 * Create Feed Modal — registration happens in dashboard Sub-pN (paid Buy Feed flow).
 */

import { X, AlertCircle, ExternalLink } from 'lucide-react';

const DASHBOARD_SUBPN_URL = 'https://pn.parnoir.com';

interface CreateFeedModalProps {
  onClose: () => void;
  onFeedCreated?: (feed: unknown) => void;
}

export function CreateFeedModal({ onClose }: CreateFeedModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Create Feed</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="text-center py-6">
          <AlertCircle className="h-12 w-12 text-blue-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Register in the dashboard</h3>
          <p className="text-text-secondary mb-4 text-sm">
            New feeds are registered as a Sub-pN in the dashboard (Buy Feed — one-time payment and
            verification). After that, use this browser to post and switch between your feeds.
          </p>
        </div>
        <a
          href={DASHBOARD_SUBPN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full mb-2 px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors items-center justify-center gap-2"
        >
          Open dashboard Sub-pN
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2 border border-neutral-600 text-text-secondary rounded-lg hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
