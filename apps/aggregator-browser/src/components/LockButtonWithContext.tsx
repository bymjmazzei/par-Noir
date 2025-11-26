/**
 * Lock Button with Context Switcher
 * Lock/unlock button with arrow underneath that expands context menu
 * Available on all screens
 */

import React, { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, ChevronDown, User, Rss } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { AppContext } from '../hooks/useAppContext';

interface LockButtonWithContextProps {
  onLockUnlock: () => void;
  currentContext?: AppContext | null;
  availableContexts?: AppContext[];
  onContextChange?: (context: AppContext) => void;
}

export const LockButtonWithContext: React.FC<LockButtonWithContextProps> = ({
  onLockUnlock,
  currentContext,
  availableContexts = [],
  onContextChange
}) => {
  const { userState } = useUserState();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current && 
        !contextMenuRef.current.contains(event.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  const handleContextSelect = (context: AppContext) => {
    onContextChange?.(context);
    setShowContextMenu(false);
  };

  const ownedFeeds = availableContexts.filter(c => c.type === 'feed' && c.isOwned);
  const delegatedFeeds = availableContexts.filter(c => c.type === 'feed' && !c.isOwned);
  const hasFeeds = ownedFeeds.length > 0 || delegatedFeeds.length > 0;

  return (
    <div ref={containerRef} className="fixed top-3 right-3 z-[110] flex flex-col items-end space-y-1">
      {/* Lock/Unlock Button */}
      <button
        onClick={onLockUnlock}
        className="p-2 flex items-center justify-center text-white/85 hover:text-white transition-colors pointer-events-auto"
        title={userState.isUnlocked ? 'Lock pN' : 'Unlock pN'}
      >
        {userState.isUnlocked ? (
          <Unlock className="h-5 w-5" />
        ) : (
          <Lock className="h-5 w-5" />
        )}
      </button>

      {/* Context Switcher Arrow - Only show when unlocked and has feeds (not just pN identity) */}
      {userState.isUnlocked && hasFeeds && (
        <button
          onClick={() => setShowContextMenu(!showContextMenu)}
          className="p-1 flex items-center justify-center text-white/60 hover:text-white/85 transition-colors pointer-events-auto"
          title="Switch context"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showContextMenu ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Context Menu */}
      {showContextMenu && userState.isUnlocked && currentContext && availableContexts.length > 0 && (
        <div
          ref={contextMenuRef}
          className="absolute top-full right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[200] max-h-[400px] overflow-y-auto min-w-[240px] max-w-[280px]"
        >
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

