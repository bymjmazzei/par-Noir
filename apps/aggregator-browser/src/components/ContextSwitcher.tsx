/**
 * Context Switcher Component
 * Allows users to switch between their pN identity and feeds
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Rss, X } from 'lucide-react';
import { AppContext } from '../hooks/useAppContext';

interface ContextSwitcherProps {
  currentContext: AppContext | null;
  availableContexts: AppContext[];
  onContextChange: (context: AppContext) => void;
  isLoading?: boolean;
}

export const ContextSwitcher: React.FC<ContextSwitcherProps> = ({
  currentContext,
  availableContexts,
  onContextChange,
  isLoading = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleContextSelect = (context: AppContext) => {
    onContextChange(context);
    setIsOpen(false);
  };

  if (!currentContext) {
    return null;
  }

  const ownedFeeds = availableContexts.filter(c => c.type === 'feed' && c.isOwned);
  const delegatedFeeds = availableContexts.filter(c => c.type === 'feed' && !c.isOwned);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center space-x-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
      >
        {currentContext.type === 'pn' ? (
          <User className="h-4 w-4 text-blue-400" />
        ) : (
          <Rss className="h-4 w-4 text-purple-400" />
        )}
        <span className="text-sm font-medium text-white max-w-[150px] truncate">
          {currentContext.name}
        </span>
        <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          {/* pN Identity */}
          {availableContexts.find(c => c.type === 'pn') && (
            <div className="p-2">
              <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
                Identity
              </div>
              {availableContexts
                .filter(c => c.type === 'pn')
                .map(context => (
                  <button
                    key={context.id}
                    onClick={() => handleContextSelect(context)}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      currentContext.id === context.id && currentContext.type === context.type
                        ? 'bg-blue-900/30 text-blue-300'
                        : 'hover:bg-neutral-800 text-white'
                    }`}
                  >
                    <User className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <span className="text-sm truncate">{context.name}</span>
                  </button>
                ))}
            </div>
          )}

          {/* Owned Feeds */}
          {ownedFeeds.length > 0 && (
            <div className="p-2 border-t border-neutral-700">
              <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
                My Feeds
              </div>
              {ownedFeeds.map(context => (
                <button
                  key={context.id}
                  onClick={() => handleContextSelect(context)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors text-left ${
                    currentContext.id === context.id && currentContext.type === context.type
                      ? 'bg-purple-900/30 text-purple-300'
                      : 'hover:bg-neutral-800 text-white'
                  }`}
                >
                  <Rss className="h-4 w-4 text-purple-400 flex-shrink-0" />
                  <span className="text-sm truncate">{context.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Delegated Feeds */}
          {delegatedFeeds.length > 0 && (
            <div className="p-2 border-t border-neutral-700">
              <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
                Delegated Feeds
              </div>
              {delegatedFeeds.map(context => (
                <button
                  key={context.id}
                  onClick={() => handleContextSelect(context)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors text-left ${
                    currentContext.id === context.id && currentContext.type === context.type
                      ? 'bg-purple-900/30 text-purple-300'
                      : 'hover:bg-neutral-800 text-white'
                  }`}
                >
                  <Rss className="h-4 w-4 text-purple-400 flex-shrink-0" />
                  <span className="text-sm truncate">{context.name}</span>
                  <span className="text-xs text-neutral-500 ml-auto">Delegated</span>
                </button>
              ))}
            </div>
          )}

          {/* Empty State */}
          {ownedFeeds.length === 0 && delegatedFeeds.length === 0 && (
            <div className="p-4 text-center text-neutral-400 text-sm">
              No feeds available
            </div>
          )}
        </div>
      )}
    </div>
  );
};

