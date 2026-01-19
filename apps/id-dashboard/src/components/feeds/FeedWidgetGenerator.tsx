/**
 * Feed Widget Generator Component
 * Generates embeddable widget code for feeds
 */

import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Code } from 'lucide-react';
import { FeedService, Feed } from '../../services/feeds/FeedService';
import { API_ENDPOINT } from '../../config/api';

interface FeedWidgetGeneratorProps {
  feed: Feed;
  onClose?: () => void;
}

export const FeedWidgetGenerator: React.FC<FeedWidgetGeneratorProps> = ({
  feed,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const [widgetCode, setWidgetCode] = useState<string>('');

  React.useEffect(() => {
    loadWidgetCode();
  }, [feed.feedId]);

  const loadWidgetCode = async () => {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/widgets/feed/${feed.feedId}`);
      
      if (response.ok) {
        const data = await response.json();
        setWidgetCode(data.widgetHtml);
      }
    } catch (error) {
      console.error('Failed to load widget code:', error);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(widgetCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const widgetUrl = feed.subdomain 
    ? `https://${feed.subdomain}.parnoir.com`
    : `${API_ENDPOINT}/api/widgets/feed/${feed.feedId}/embed`;

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Code className="h-5 w-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Embed Feed Widget</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            ×
          </button>
        )}
      </div>

      <div className="mb-4">
        <p className="text-sm text-neutral-400 mb-4">
          Copy and paste this code into your website to embed your feed. The widget is not customizable
          to maintain consistent branding.
        </p>

        {/* Widget Code */}
        <div className="bg-neutral-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-neutral-300">Widget Code</label>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm text-neutral-300 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-xs text-neutral-300 overflow-x-auto">
            <code>{widgetCode || 'Loading widget code...'}</code>
          </pre>
        </div>

        {/* Subdomain Option */}
        {feed.subdomain && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 mb-4">
            <div className="flex items-start space-x-2">
              <ExternalLink className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-blue-300 mb-1">Subdomain Available</h4>
                <p className="text-sm text-blue-200 mb-2">
                  Your feed is also available at:
                </p>
                <a
                  href={`https://${feed.subdomain}.parnoir.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm font-mono"
                >
                  https://{feed.subdomain}.parnoir.com
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-neutral-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-2">How to Use</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-neutral-400">
            <li>Copy the widget code above</li>
            <li>Paste it into your website's HTML where you want the feed to appear</li>
            <li>The widget will automatically load and display your feed</li>
            <li>The widget is responsive and works on all devices</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

