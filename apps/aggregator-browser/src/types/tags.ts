/**
 * Tag Type Definitions
 * Unified tag system with provenance tracking
 */

export type TagSource = 'gemini' | 'user' | 'extracted' | 'preference';

export interface TagProvenance {
  source: TagSource;
  timestamp: string; // ISO 8601
  action?: 'upload' | 'edit' | 'ai_generate' | 'extract' | 'swipe_like' | 'swipe_dislike' | 'preference_tile';
  actor?: string; // User DID or system identifier
  confidence?: number; // For AI-generated tags (0-1)
  version?: number; // For tracking changes
  previousValue?: string; // If tag was changed
  metadata?: {
    fileId?: string; // Which file this tag came from
    model?: string; // For Gemini: which model version
    extractionMethod?: string; // For extracted: which method used
  };
}

export interface NormalizedTag {
  id: string; // Normalized ID (lowercase, singular)
  displayName: string; // Display name (capitalized, may be plural)
  sources: TagSource[]; // Where this tag came from
  aliases: string[]; // Alternative names/variations
  category?: string; // feedCategory if applicable
  type: 'subject' | 'category' | 'contentType' | 'keyword';
  
  // Enhanced provenance tracking
  provenance: TagProvenance[]; // Full history of where this tag came from
  createdAt: string; // First appearance
  lastUpdated: string; // Last modification
  createdBy: TagSource; // Original source
  confidence?: number; // Overall confidence (weighted average)
}

