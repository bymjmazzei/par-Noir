/**
 * Content Rating Badge Component (Simplified)
 * Shows NSFW badge if content is NSFW
 */

import { Shield } from 'lucide-react';

interface ContentRatingBadgeProps {
  isNSFW?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ContentRatingBadge({ 
  isNSFW = false, 
  size = 'sm',
  className = '' 
}: ContentRatingBadgeProps) {
  // Only show badge if content is NSFW
  if (!isNSFW) {
    return null;
  }

  const sizeClasses = {
    sm: 'h-4 w-4 text-xs',
    md: 'h-5 w-5 text-sm',
    lg: 'h-6 w-6 text-base'
  };

  return (
    <span
      className={`inline-flex items-center space-x-1 px-2 py-1 bg-red-500/20 border border-red-500/50 rounded text-red-400 ${sizeClasses[size]} ${className}`}
      title="NSFW - Not Safe For Work"
    >
      <Shield className="h-3 w-3" />
      <span>NSFW</span>
    </span>
  );
}
