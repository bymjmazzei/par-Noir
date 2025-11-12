/**
 * Content Rating Badge Component
 * Displays content rating with appropriate styling
 */

import React from 'react';
import { Shield, Lock } from 'lucide-react';
import { ContentRating } from '../types/aggregator';
import { CONTENT_RATINGS } from '../constants/contentRatings';

interface ContentRatingBadgeProps {
  rating: ContentRating;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function ContentRatingBadge({ 
  rating, 
  size = 'md', 
  showIcon = false,
  className = '' 
}: ContentRatingBadgeProps) {
  const ratingInfo = CONTENT_RATINGS[rating];
  const requiresVerification = ratingInfo.requiresVerification;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  const getRatingColor = (rating: ContentRating): string => {
    switch (rating) {
      case 'GA':
      case 'FF':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'T13+':
      case 'YA16+':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'M18+':
      case 'NSFW':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'X18+':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <span
      className={`
        inline-flex items-center space-x-1 rounded-full border font-medium
        ${sizeClasses[size]}
        ${getRatingColor(rating)}
        ${className}
      `}
      title={ratingInfo.description}
    >
      {showIcon && requiresVerification && (
        <Lock className={`${size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-4 w-4'}`} />
      )}
      {showIcon && !requiresVerification && (
        <Shield className={`${size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-4 w-4'}`} />
      )}
      <span>{rating}</span>
    </span>
  );
}

