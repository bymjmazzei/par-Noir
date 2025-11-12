/**
 * Keyboard Shortcuts Help Component
 * Shows available keyboard shortcuts
 */

import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  const shortcuts = [
    {
      category: 'Navigation',
      items: [
        { key: '↓ / .', description: 'Next post' },
        { key: '↑ / ,', description: 'Previous post' },
        { key: 'Shift + →', description: 'Next feed' },
        { key: 'Shift + ←', description: 'Previous feed' },
      ]
    },
    {
      category: 'Media',
      items: [
        { key: 'Space', description: 'Play/Pause video' },
      ]
    },
    {
      category: 'Actions',
      items: [
        { key: 'S', description: 'Open Settings' },
        { key: 'B', description: 'Browse Feeds' },
        { key: 'Esc', description: 'Close modals' },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <div className="flex items-center space-x-2">
            <Keyboard className="h-5 w-5 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {shortcuts.map((category) => (
              <div key={category.category}>
                <h3 className="text-lg font-semibold text-white mb-3">
                  {category.category}
                </h3>
                <div className="space-y-2">
                  {category.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg"
                    >
                      <span className="text-text-secondary text-sm">
                        {item.description}
                      </span>
                      <kbd className="px-3 py-1 bg-neutral-700 text-white text-xs font-mono rounded border border-neutral-600">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-700">
          <p className="text-text-secondary text-xs text-center">
            Press <kbd className="px-2 py-0.5 bg-neutral-700 text-white text-xs font-mono rounded">?</kbd> anytime to show this help
          </p>
        </div>
      </div>
    </div>
  );
}

