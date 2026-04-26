/**
 * Recommendation Service
 * Personalizes feed content based on user engagement and preferences
 */

import { getDatabasePool } from '../utils/database';
import { CentralIndexEntry } from './aggregatorMetadataService';
import { UserPreferenceService } from './userPreferenceService';
import { EngagementService } from './engagementService';
import { computePublicRankFromMetrics } from './discoveryRank';

export interface RecommendationScore {
  fileId: string;
  score: number;
  reasons: string[]; // For debugging/transparency
  verifiedEngagement?: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  unverifiedEngagement?: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
}

export interface RecommendationOptions {
  userPnIdentifier?: string;
  feedId?: string; // 'public', 'curated', 'me', or specific feed ID
  limit?: number;
  offset?: number;
  recencyWeight?: number; // 0-1, how much to weight recent content (default: 0.3)
  engagementWeight?: number; // 0-1, how much to weight engagement (default: 0.7)
}

export class RecommendationService {
  /**
   * Calculate public recommendation score (base score everyone gets)
   * This is the foundation - engagement + recency, no user-specific logic
   */
  static async calculatePublicScore(
    file: CentralIndexEntry,
    options: RecommendationOptions
  ): Promise<{ score: number; reasons: string[] }> {
    const reasons: string[] = [];

    const engagementMetrics = await EngagementService.getEngagementMetrics(file.fileId);

    const uploadMs = file.metadata.uploadDate
      ? new Date(file.metadata.uploadDate).getTime()
      : file.submittedAt
        ? new Date(file.submittedAt).getTime()
        : Date.now();

    const { score, reasonLine } = computePublicRankFromMetrics(engagementMetrics, uploadMs, {
      engagementWeight: options.engagementWeight,
      recencyWeight: options.recencyWeight
    });
    reasons.push(reasonLine);

    return { score, reasons };
  }

  /**
   * Calculate user-specific personalization adjustments
   * Extends the public score with user preferences
   */
  static async calculateUserScore(
    file: CentralIndexEntry,
    userPnIdentifier: string,
    publicScore: number,
    publicReasons: string[],
    options: RecommendationOptions
  ): Promise<{ score: number; reasons: string[] }> {
    let score = publicScore;
    const reasons = [...publicReasons];

    // User-specific adjustments
    const db = getDatabasePool();
    
    // Check if user has liked this content (+20 points)
      const likeResult = await db.query(`
        SELECT 1 FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'like'
        LIMIT 1
      `, [file.fileId, userPnIdentifier]);
      
      if (likeResult.rows.length > 0) {
        score += 20;
        reasons.push('User liked this');
      }
      
      // Check if user has disliked this content (-50 points, strong negative signal)
      const dislikeResult = await db.query(`
        SELECT 1 FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'dislike'
        LIMIT 1
      `, [file.fileId, userPnIdentifier]);
      
      if (dislikeResult.rows.length > 0) {
        score -= 50;
        reasons.push('User disliked this');
      }
      
      // Get user tag preferences
      const userPreferences = await UserPreferenceService.getUserTagPreferences(userPnIdentifier);
      
      // Check if content matches user preferences
      // This would require tag normalization - for now, we'll use a simplified approach
      // In production, you'd normalize tags from file.metadata and match against user preferences
      const fileTags = [
        ...(file.metadata.tags || []),
        ...(file.metadata.keywords || []),
        ...(file.metadata.subjects || []),
        ...(file.metadata.feedCategories || [])
      ].map(t => t.toLowerCase());
      
      let preferenceBoost = 0;
      userPreferences.forEach((pref, tagId) => {
        if (fileTags.some(tag => tag.includes(tagId) || tagId.includes(tag))) {
          if (pref.preference === 'like' || pref.preference === 'subscribe') {
            preferenceBoost += 15 * pref.confidence;
            reasons.push(`Matches preferred tag: ${tagId}`);
          } else if (pref.preference === 'dislike' || pref.preference === 'block') {
            preferenceBoost -= 30 * pref.confidence;
            reasons.push(`Matches blocked tag: ${tagId}`);
          }
        }
      });
      
      score += preferenceBoost;
      
      // Boost content from subscribed feeds (+15 points)
      const subscribedFeedsResult = await db.query(`
        SELECT feed_id FROM feed_subscriptions 
        WHERE user_did = $1
      `, [userPnIdentifier]);
      
      const subscribedFeedIds = subscribedFeedsResult.rows.map(r => r.feed_id);
      const fileFeedIds = (file.metadata as any).feedIds || [];
      
      if (fileFeedIds.some((feedId: string) => subscribedFeedIds.includes(feedId))) {
        score += 15;
        reasons.push('From subscribed feed');
      }
      
      // Boost content from creators user follows (+10 points)
      const creatorId = file.pnIdentifier || 
                       file.metadata.creator?.identifier?.value ||
                       file.metadata.author?.did;
      
      if (creatorId) {
        const connectionResult = await db.query(`
          SELECT 1 FROM connections 
          WHERE (user_did_1 = $1 AND user_did_2 = $2) 
             OR (user_did_1 = $2 AND user_did_2 = $1)
          LIMIT 1
        `, [userPnIdentifier, creatorId]);
        
        if (connectionResult.rows.length > 0) {
          score += 10;
          reasons.push('From followed creator');
        }
      }
      
      // Check user's content type preferences
      const userLikesResult = await db.query(`
        SELECT COUNT(*) as count, 
               (SELECT metadata->>'fileType' FROM aggregator_metadata 
                WHERE file_id = e.file_id LIMIT 1) as file_type
        FROM engagement e
        WHERE e.user_did = $1 AND e.type = 'like'
        GROUP BY e.file_id
        LIMIT 100
      `, [userPnIdentifier]);
      
      // Boost content types user frequently likes
      const fileType = file.metadata.fileType;
      const userFileTypeCounts = new Map<string, number>();
      userLikesResult.rows.forEach((row: any) => {
        const type = row.file_type;
        if (type) {
          userFileTypeCounts.set(type, (userFileTypeCounts.get(type) || 0) + 1);
        }
      });
      
      const totalLikes = Array.from(userFileTypeCounts.values()).reduce((a, b) => a + b, 0);
      if (totalLikes > 0 && fileType) {
        const typePreference = (userFileTypeCounts.get(fileType) || 0) / totalLikes;
        if (typePreference > 0.3) { // User likes this type >30% of the time
          score += 5;
          reasons.push(`Preferred content type: ${fileType}`);
        }
      }

    return { 
      score: Math.max(0, score), 
      reasons
    }; // Ensure non-negative
  }

  /**
   * Calculate recommendation score for content
   * Uses two-part architecture: public algorithm + optional user personalization
   */
  static async calculateContentScore(
    file: CentralIndexEntry,
    userPnIdentifier: string | undefined,
    options: RecommendationOptions
  ): Promise<{ score: number; reasons: string[] }> {
    // First, calculate public score (base score everyone gets)
    const { score: publicScore, reasons: publicReasons } = await this.calculatePublicScore(file, options);

    // If no user, return public score
    if (!userPnIdentifier) {
      return { score: Math.max(0, publicScore), reasons: publicReasons };
    }

    // Otherwise, extend with user personalization
    return await this.calculateUserScore(file, userPnIdentifier, publicScore, publicReasons, options);
  }

  /**
   * Get monetization metrics (verified-only engagement)
   */
  static async getMonetizationMetrics(fileId: string): Promise<{
    verifiedLikes: number;
    verifiedComments: number;
    verifiedShares: number;
    verifiedSaves: number;
    estimatedValue: number;
  }> {
    const metrics = await EngagementService.getEngagementMetrics(fileId);

    // Monetization rates (per verified engagement)
    const RATES = {
      like: 0.01,      // $0.01 per verified like
      comment: 0.05,  // $0.05 per verified comment
      share: 0.02,    // $0.02 per verified share
      save: 0.01      // $0.01 per verified save
    };

    const estimatedValue = 
      metrics.verified.likes * RATES.like +
      metrics.verified.comments * RATES.comment +
      metrics.verified.shares * RATES.share +
      metrics.verified.saves * RATES.save;

    return {
      verifiedLikes: metrics.verified.likes,
      verifiedComments: metrics.verified.comments,
      verifiedShares: metrics.verified.shares,
      verifiedSaves: metrics.verified.saves,
      estimatedValue
    };
  }

  /**
   * Get recommended content for a feed
   */
  static async getRecommendedContent(
    files: CentralIndexEntry[],
    options: RecommendationOptions
  ): Promise<{ files: CentralIndexEntry[]; scores: Map<string, RecommendationScore> }> {
    const scores = new Map<string, RecommendationScore>();
    
    // Calculate scores for all files
    const scoredFiles = await Promise.all(
      files.map(async (file) => {
        const { score, reasons } = await this.calculateContentScore(file, options.userPnIdentifier, options);
        
        scores.set(file.fileId, {
          fileId: file.fileId,
          score,
          reasons
        });
        
        return { file, score };
      })
    );
    
    // Sort by score (highest first)
    scoredFiles.sort((a, b) => b.score - a.score);
    
    // Apply pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const paginated = scoredFiles.slice(offset, offset + limit);
    
    return {
      files: paginated.map(sf => sf.file),
      scores
    };
  }
}

