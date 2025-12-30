/**
 * Recommendation Service
 * Personalizes feed content based on user engagement and preferences
 */

import { getDatabasePool } from '../utils/database';
import { CentralIndexEntry } from './aggregatorMetadataService';
import { UserPreferenceService } from './userPreferenceService';

export interface RecommendationScore {
  fileId: string;
  score: number;
  reasons: string[]; // For debugging/transparency
}

export interface RecommendationOptions {
  userDid?: string;
  feedId?: string; // 'public', 'curated', 'me', or specific feed ID
  limit?: number;
  offset?: number;
  recencyWeight?: number; // 0-1, how much to weight recent content (default: 0.3)
  engagementWeight?: number; // 0-1, how much to weight engagement (default: 0.7)
}

export class RecommendationService {
  /**
   * Calculate recommendation score for content
   */
  static async calculateContentScore(
    file: CentralIndexEntry,
    userDid: string | undefined,
    options: RecommendationOptions
  ): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    // Base score from engagement metrics
    const engagement = (file.metadata as any).engagement || {};
    const likes = engagement.likes || 0;
    const views = engagement.views || 0;
    const comments = engagement.comments || 0;
    const shares = engagement.shares || 0;
    
    // Calculate engagement score (normalized)
    // Weight: likes (3x), shares (2x), comments (1.5x), views (0.1x)
    const engagementScore = 
      (likes * 3) + 
      (shares * 2) + 
      (comments * 1.5) + 
      (views * 0.1);
    
    // Normalize engagement score (log scale to prevent outliers from dominating)
    const normalizedEngagement = Math.log10(engagementScore + 1) * 10;
    
    // Recency score (0-100, based on upload date)
    const uploadDate = file.metadata.uploadDate 
      ? new Date(file.metadata.uploadDate).getTime()
      : file.submittedAt 
        ? new Date(file.submittedAt).getTime()
        : Date.now();
    
    const daysSinceUpload = (Date.now() - uploadDate) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 100 - (daysSinceUpload * 2)); // Decay by 2 points per day
    
    // Combine engagement and recency
    const engagementWeight = options.engagementWeight ?? 0.7;
    const recencyWeight = options.recencyWeight ?? 0.3;
    
    score = (normalizedEngagement * engagementWeight) + (recencyScore * recencyWeight);
    reasons.push(`Engagement: ${normalizedEngagement.toFixed(1)}, Recency: ${recencyScore.toFixed(1)}`);

    // User-specific adjustments
    if (userDid) {
      const db = getDatabasePool();
      
      // Check if user has liked this content (+20 points)
      const likeResult = await db.query(`
        SELECT 1 FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'like'
        LIMIT 1
      `, [file.fileId, userDid]);
      
      if (likeResult.rows.length > 0) {
        score += 20;
        reasons.push('User liked this');
      }
      
      // Check if user has disliked this content (-50 points, strong negative signal)
      const dislikeResult = await db.query(`
        SELECT 1 FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'dislike'
        LIMIT 1
      `, [file.fileId, userDid]);
      
      if (dislikeResult.rows.length > 0) {
        score -= 50;
        reasons.push('User disliked this');
      }
      
      // Get user tag preferences
      const userPreferences = await UserPreferenceService.getUserTagPreferences(userDid);
      
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
      `, [userDid]);
      
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
        `, [userDid, creatorId]);
        
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
      `, [userDid]);
      
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
    }

    return { score: Math.max(0, score), reasons }; // Ensure non-negative
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
        const { score, reasons } = await this.calculateContentScore(file, options.userDid, options);
        
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

