/**
 * Unified Tag Normalization Service
 * Normalizes tags from all sources (Gemini, user input, extracted subjects) into a unified taxonomy
 * Tracks full provenance for every tag
 */

import { normalizeSubject, findSimilarSubject } from '../utils/subjectExtractor';
import { FEED_CATEGORIES } from '../constants/feedCategories';
import { NormalizedTag, TagSource, TagProvenance } from '../types/tags';

export class TagNormalizationService {
  private static tagCache = new Map<string, NormalizedTag>();
  
  /**
   * Normalize a tag from any source into unified format with provenance
   */
  static normalizeTagWithProvenance(
    tag: string,
    source: TagSource,
    action: TagProvenance['action'],
    actor?: string,
    metadata?: {
      fileId?: string;
      feedCategory?: string;
      fileType?: string;
      confidence?: number; // For AI tags
      model?: string; // For Gemini
    }
  ): NormalizedTag {
    const normalizedId = normalizeSubject(tag).toLowerCase();
    const timestamp = new Date().toISOString();
    
    // Check if tag already exists
    const existing = this.tagCache.get(normalizedId);
    
    if (existing) {
      // Add new provenance entry
      existing.provenance.push({
        source,
        timestamp,
        action,
        actor,
        confidence: metadata?.confidence,
        version: (existing.provenance.length || 0) + 1,
        metadata: {
          fileId: metadata?.fileId,
          model: metadata?.model
        }
      });
      
      // Update sources if new
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      
      // Update aliases if new variation
      if (!existing.aliases.includes(tag)) {
        existing.aliases.push(tag);
      }
      
      existing.lastUpdated = timestamp;
      
      // Recalculate confidence (weighted average)
      if (metadata?.confidence !== undefined) {
        const confidences = existing.provenance
          .map(p => p.confidence)
          .filter((c): c is number => c !== undefined);
        if (confidences.length > 0) {
          existing.confidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        }
      }
      
      return existing;
    }
    
    // Determine type
    let type: 'subject' | 'category' | 'contentType' | 'keyword' = 'keyword';
    
    // Check if it's a feed category
    if (metadata?.feedCategory && 
        Object.keys(FEED_CATEGORIES).includes(metadata.feedCategory.toLowerCase())) {
      type = 'category';
    } else if (metadata?.fileType && normalizedId.includes(metadata.fileType)) {
      type = 'contentType';
    } else {
      type = 'subject';
    }
    
    // Create normalized tag with provenance
    const normalized: NormalizedTag = {
      id: normalizedId,
      displayName: this.capitalizeDisplayName(tag),
      sources: [source],
      aliases: [tag],
      category: metadata?.feedCategory,
      type,
      provenance: [{
        source,
        timestamp,
        action,
        actor,
        confidence: metadata?.confidence,
        version: 1,
        metadata: {
          fileId: metadata?.fileId,
          model: metadata?.model
        }
      }],
      createdAt: timestamp,
      lastUpdated: timestamp,
      createdBy: source,
      confidence: metadata?.confidence
    };
    
    this.tagCache.set(normalizedId, normalized);
    return normalized;
  }

  /**
   * Normalize multiple tags from content metadata
   */
  static normalizeTagsFromMetadata(
    metadata: {
      tags?: string[];
      keywords?: string[];
      subjects?: string[];
      feedCategories?: string[];
      fileType?: string;
      geminiTags?: string[]; // If Gemini tags are stored separately
    },
    options?: {
      fileId?: string;
      actor?: string;
      action?: TagProvenance['action'];
    }
  ): NormalizedTag[] {
    const normalized = new Map<string, NormalizedTag>();
    
    // Normalize Gemini tags (if marked)
    (metadata.geminiTags || []).forEach(tag => {
      const norm = this.normalizeTagWithProvenance(
        tag,
        'gemini',
        'ai_generate',
        options?.actor,
        {
          fileId: options?.fileId,
          feedCategory: metadata.feedCategories?.[0],
          fileType: metadata.fileType,
          confidence: 0.85 // Default Gemini confidence
        }
      );
      normalized.set(norm.id, norm);
    });
    
    // Normalize tags (user-provided)
    (metadata.tags || []).forEach(tag => {
      const norm = this.normalizeTagWithProvenance(
        tag,
        'user',
        options?.action || 'upload',
        options?.actor,
        {
          fileId: options?.fileId,
          feedCategory: metadata.feedCategories?.[0],
          fileType: metadata.fileType
        }
      );
      // Merge if already exists
      if (normalized.has(norm.id)) {
        const existing = normalized.get(norm.id)!;
        if (!existing.sources.includes('user')) {
          existing.sources.push('user');
        }
        if (!existing.aliases.includes(tag)) {
          existing.aliases.push(tag);
        }
      } else {
        normalized.set(norm.id, norm);
      }
    });
    
    // Normalize keywords (user-provided, same as tags)
    (metadata.keywords || []).forEach(keyword => {
      const norm = this.normalizeTagWithProvenance(
        keyword,
        'user',
        options?.action || 'upload',
        options?.actor,
        {
          fileId: options?.fileId,
          feedCategory: metadata.feedCategories?.[0],
          fileType: metadata.fileType
        }
      );
      // Merge if already exists
      if (normalized.has(norm.id)) {
        const existing = normalized.get(norm.id)!;
        if (!existing.sources.includes('user')) {
          existing.sources.push('user');
        }
        if (!existing.aliases.includes(keyword)) {
          existing.aliases.push(keyword);
        }
      } else {
        normalized.set(norm.id, norm);
      }
    });
    
    // Normalize subjects (extracted)
    (metadata.subjects || []).forEach(subject => {
      const norm = this.normalizeTagWithProvenance(
        subject,
        'extracted',
        'extract',
        options?.actor,
        {
          fileId: options?.fileId,
          feedCategory: metadata.feedCategories?.[0],
          fileType: metadata.fileType,
          extractionMethod: 'subjectExtractor'
        }
      );
      // Merge if already exists
      if (normalized.has(norm.id)) {
        const existing = normalized.get(norm.id)!;
        if (!existing.sources.includes('extracted')) {
          existing.sources.push('extracted');
        }
        if (!existing.aliases.includes(subject)) {
          existing.aliases.push(subject);
        }
      } else {
        normalized.set(norm.id, norm);
      }
    });
    
    // Normalize feed categories
    (metadata.feedCategories || []).forEach(category => {
      const norm = this.normalizeTagWithProvenance(
        category,
        'user',
        options?.action || 'upload',
        options?.actor,
        {
          fileId: options?.fileId,
          feedCategory: category,
          fileType: metadata.fileType
        }
      );
      norm.type = 'category';
      normalized.set(norm.id, norm);
    });
    
    return Array.from(normalized.values());
  }

  /**
   * Find similar tags (for correlation)
   */
  static findSimilarTags(
    tag: string,
    existingTags: NormalizedTag[]
  ): NormalizedTag | null {
    const normalized = normalizeSubject(tag).toLowerCase();
    
    // First check exact match
    const exact = existingTags.find(t => t.id === normalized);
    if (exact) return exact;
    
    // Check aliases
    for (const existing of existingTags) {
      if (existing.aliases.some(alias => 
        findSimilarSubject(normalized, alias) !== null
      )) {
        return existing;
      }
    }
    
    // Check similarity
    for (const existing of existingTags) {
      if (findSimilarSubject(normalized, existing.id) !== null) {
        return existing;
      }
    }
    
    return null;
  }

  /**
   * Merge tags from different sources (correlate Gemini + user + extracted)
   */
  static mergeTags(
    geminiTags: string[],
    userTags: string[],
    extractedSubjects: string[],
    options?: {
      fileId?: string;
      actor?: string;
      feedCategory?: string;
      fileType?: string;
    }
  ): NormalizedTag[] {
    const merged = new Map<string, NormalizedTag>();
    
    // Process all tags
    [...geminiTags, ...userTags, ...extractedSubjects].forEach((tag, index) => {
      const source: TagSource = 
        index < geminiTags.length ? 'gemini' :
        index < geminiTags.length + userTags.length ? 'user' :
        'extracted';
      
      const normalized = this.normalizeTagWithProvenance(
        tag,
        source,
        source === 'gemini' ? 'ai_generate' : source === 'extracted' ? 'extract' : 'upload',
        options?.actor,
        {
          fileId: options?.fileId,
          feedCategory: options?.feedCategory,
          fileType: options?.fileType,
          confidence: source === 'gemini' ? 0.85 : undefined
        }
      );
      
      // Check if similar tag already exists
      const similar = this.findSimilarTags(tag, Array.from(merged.values()));
      
      if (similar) {
        // Merge into existing
        if (!similar.sources.includes(source)) {
          similar.sources.push(source);
        }
        if (!similar.aliases.includes(tag)) {
          similar.aliases.push(tag);
        }
        // Add provenance
        similar.provenance.push(...normalized.provenance);
      } else {
        // Add new
        merged.set(normalized.id, normalized);
      }
    });
    
    return Array.from(merged.values());
  }

  /**
   * Get all tags from a file's metadata (unified)
   */
  static getUnifiedTags(file: {
    metadata: {
      tags?: string[];
      keywords?: string[];
      subjects?: string[];
      feedCategories?: string[];
      fileType?: string;
      geminiTags?: string[];
    };
  }, options?: {
    fileId?: string;
    actor?: string;
    action?: TagProvenance['action'];
  }): NormalizedTag[] {
    return this.normalizeTagsFromMetadata(
      {
        tags: file.metadata.tags,
        keywords: file.metadata.keywords,
        subjects: file.metadata.subjects,
        feedCategories: file.metadata.feedCategories,
        fileType: file.metadata.fileType,
        geminiTags: file.metadata.geminiTags
      },
      options
    );
  }

  /**
   * Capitalize display name properly
   */
  private static capitalizeDisplayName(tag: string): string {
    // Handle special cases
    if (tag.toLowerCase() === 'nsfw') return 'NSFW';
    if (tag.toLowerCase() === 'ai') return 'AI';
    
    // Capitalize first letter, keep rest as-is
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }

  /**
   * Clear cache (useful for testing or memory management)
   */
  static clearCache(): void {
    this.tagCache.clear();
  }

  /**
   * Get cached tag by ID
   */
  static getCachedTag(tagId: string): NormalizedTag | undefined {
    return this.tagCache.get(tagId);
  }
}

