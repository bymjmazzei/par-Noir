/**
 * pN Connect Component
 * Prompts visitors to connect their pN to unlock engagement features
 */

import React from 'react';
import { Lock, Heart, MessageCircle, Share2 } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';

interface PNConnectProps {
  onConnect?: () => void;
  compact?: boolean;
}

export function PNConnect({ onConnect, compact = false }: PNConnectProps) {
  const { setUnlocked } = useUserState();

  const handleConnect = () => {
    // In production, this would open pN connection flow
    // For now, simulate unlock (you'll implement actual pN connection later)
    const pnIdentifier = prompt('Enter your pN identifier (for testing):');
    if (pnIdentifier) {
      setUnlocked(pnIdentifier);
      onConnect?.();
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleConnect}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Lock className="h-4 w-4" />
        <span>Connect pN</span>
      </button>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-6 text-center">
      <Lock className="h-12 w-12 text-blue-400 mx-auto mb-4" />
      <h3 className="text-white text-xl font-bold mb-2">Connect Your pN to Engage</h3>
      <p className="text-text-secondary mb-6">
        Unlock likes, comments, and full interaction with the par Noir network
      </p>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
            <Heart className="h-6 w-6 text-blue-400" />
          </div>
          <span className="text-xs text-text-secondary">Like Content</span>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-blue-400" />
          </div>
          <span className="text-xs text-text-secondary">Comment</span>
        </div>
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
            <Share2 className="h-6 w-6 text-blue-400" />
          </div>
          <span className="text-xs text-text-secondary">Share</span>
        </div>
      </div>
      
      <button
        onClick={handleConnect}
        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Connect pN
      </button>
      
      <p className="text-xs text-text-secondary mt-4">
        Your pN gives you full control over your identity and data
      </p>
    </div>
  );
}

