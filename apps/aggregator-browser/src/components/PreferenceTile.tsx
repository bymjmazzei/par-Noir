/**
 * Preference Tile Component
 * Appears in feed to learn user preferences via swipe gestures
 */

import React from 'react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { FEED_CATEGORIES } from '../constants/feedCategories';

export type PreferenceType = 
  | 'contentType' // "Do you like sports videos?"
  | 'category'    // "Do you like entertainment content?"
  | 'subject'     // "Do you like cowboy content?"
  | 'creator';    // "Do you like content from @creator?"

export interface PreferenceQuestion {
  id: string;
  type: PreferenceType;
  question: string;
  value: string; // The value being asked about (e.g., "sports", "entertainment", "cowboy")
  metadata?: {
    fileType?: string;
    category?: string;
    subject?: string;
    creatorId?: string;
    creatorName?: string;
  };
}

interface PreferenceTileProps {
  question: PreferenceQuestion;
  onSwipeRight: (question: PreferenceQuestion) => void; // Like/prefer
  onSwipeLeft: (question: PreferenceQuestion) => void;  // Dislike/block
  onDismiss?: (question: PreferenceQuestion) => void;   // Skip (swipe up)
}

export function PreferenceTile({
  question,
  onSwipeRight,
  onSwipeLeft,
  onDismiss
}: PreferenceTileProps) {
  const getIcon = () => {
    switch (question.type) {
      case 'contentType':
        return '🎬';
      case 'category':
        return '📁';
      case 'subject':
        return '🏷️';
      case 'creator':
        return '👤';
      default:
        return '❓';
    }
  };

  const getCategoryName = (categoryId: string) => {
    return FEED_CATEGORIES[categoryId as keyof typeof FEED_CATEGORIES]?.name || categoryId;
  };

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 relative overflow-hidden"
      style={{ minHeight: '100vh' }}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)'
        }} />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-8 max-w-md">
        {/* Icon */}
        <div className="text-6xl mb-6 animate-pulse">
          {getIcon()}
        </div>

        {/* Question */}
        <h2 className="text-3xl font-bold text-white mb-8 leading-tight">
          {question.question}
        </h2>

        {/* Value Display */}
        <div className="mb-12">
          <div className="inline-block px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
            <span className="text-xl font-semibold text-white capitalize">
              {question.type === 'category' 
                ? getCategoryName(question.value)
                : question.value}
            </span>
          </div>
        </div>

        {/* Instructions */}
        <div className="flex items-center justify-center gap-8 mb-8">
          {/* Swipe Left = No */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
              <ThumbsDown className="w-6 h-6 text-red-500" />
            </div>
            <span className="text-sm text-neutral-400">Swipe Left</span>
            <span className="text-xs text-neutral-500">No</span>
          </div>

          {/* Swipe Right = Yes */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
              <ThumbsUp className="w-6 h-6 text-green-500" />
            </div>
            <span className="text-sm text-neutral-400">Swipe Right</span>
            <span className="text-xs text-neutral-500">Yes</span>
          </div>
        </div>

        {/* Dismiss Hint */}
        {onDismiss && (
          <div className="text-xs text-neutral-500 flex items-center justify-center gap-2">
            <X className="w-3 h-3" />
            <span>Swipe up to skip</span>
          </div>
        )}
      </div>

      {/* Swipe Indicators */}
      <div className="absolute top-1/2 left-4 transform -translate-y-1/2 opacity-30">
        <ThumbsDown className="w-16 h-16 text-red-500" />
      </div>
      <div className="absolute top-1/2 right-4 transform -translate-y-1/2 opacity-30">
        <ThumbsUp className="w-16 h-16 text-green-500" />
      </div>
    </div>
  );
}

