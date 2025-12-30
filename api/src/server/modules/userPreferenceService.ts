/**
 * User Preference Service
 * Stores user tag preferences with full provenance tracking
 * Maps user actions (likes, dislikes, preference tiles) to normalized tags
 */

import { getDatabasePool } from '../utils/database';

export interface UserTagPreference {
  userDid: string;
  tagId: string; // Normalized tag ID
  preference: 'like' | 'dislike' | 'block' | 'subscribe';
  sourceFileId?: string; // Which file triggered this preference
  action: 'swipe_like' | 'swipe_dislike' | 'preference_tile_yes' | 'preference_tile_no' | 'explicit_setting';
  confidence: number; // How confident we are in this preference (0-1)
  metadata?: {
    questionId?: string; // If from preference tile
    fileType?: string;
    category?: string;
    subject?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export class UserPreferenceService {
  /**
   * Store or update a user tag preference
   */
  static async setTagPreference(
    userDid: string,
    tagId: string,
    preference: 'like' | 'dislike' | 'block' | 'subscribe',
    action: UserTagPreference['action'],
    options?: {
      sourceFileId?: string;
      confidence?: number;
      metadata?: UserTagPreference['metadata'];
    }
  ): Promise<void> {
    const db = getDatabasePool();
    
    try {
      const confidence = options?.confidence ?? this.getDefaultConfidence(action);
      const now = new Date().toISOString();
      
      // Check if preference already exists
      const existing = await db.query(`
        SELECT preference_id FROM user_tag_preferences 
        WHERE user_did = $1 AND tag_id = $2
        LIMIT 1
      `, [userDid, tagId]);

      if (existing.rows.length > 0) {
        // Update existing preference
        await db.query(`
          UPDATE user_tag_preferences 
          SET preference = $1, 
              action = $2,
              confidence = $3,
              source_file_id = $4,
              metadata = $5,
              updated_at = $6
          WHERE user_did = $7 AND tag_id = $8
        `, [
          preference,
          action,
          confidence,
          options?.sourceFileId || null,
          options?.metadata ? JSON.stringify(options.metadata) : null,
          now,
          userDid,
          tagId
        ]);
      } else {
        // Insert new preference
        await db.query(`
          INSERT INTO user_tag_preferences (
            user_did, tag_id, preference, action, confidence, 
            source_file_id, metadata, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          userDid,
          tagId,
          preference,
          action,
          confidence,
          options?.sourceFileId || null,
          options?.metadata ? JSON.stringify(options.metadata) : null,
          now,
          now
        ]);
      }
    } catch (error) {
      console.error('Failed to set tag preference:', error);
      throw error;
    }
  }

  /**
   * Get user's preference for a tag
   */
  static async getTagPreference(
    userDid: string,
    tagId: string
  ): Promise<UserTagPreference | null> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(`
        SELECT * FROM user_tag_preferences 
        WHERE user_did = $1 AND tag_id = $2
        LIMIT 1
      `, [userDid, tagId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userDid: row.user_did,
        tagId: row.tag_id,
        preference: row.preference,
        sourceFileId: row.source_file_id,
        action: row.action,
        confidence: parseFloat(row.confidence),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      };
    } catch (error) {
      console.error('Failed to get tag preference:', error);
      throw error;
    }
  }

  /**
   * Get all user tag preferences
   */
  static async getUserTagPreferences(
    userDid: string
  ): Promise<Map<string, UserTagPreference>> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(`
        SELECT * FROM user_tag_preferences 
        WHERE user_did = $1
        ORDER BY updated_at DESC
      `, [userDid]);

      const preferences = new Map<string, UserTagPreference>();
      
      result.rows.forEach(row => {
        preferences.set(row.tag_id, {
          userDid: row.user_did,
          tagId: row.tag_id,
          preference: row.preference,
          sourceFileId: row.source_file_id,
          action: row.action,
          confidence: parseFloat(row.confidence),
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString()
        });
      });

      return preferences;
    } catch (error) {
      console.error('Failed to get user tag preferences:', error);
      throw error;
    }
  }

  /**
   * Remove a tag preference
   */
  static async removeTagPreference(
    userDid: string,
    tagId: string
  ): Promise<void> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        DELETE FROM user_tag_preferences 
        WHERE user_did = $1 AND tag_id = $2
      `, [userDid, tagId]);
    } catch (error) {
      console.error('Failed to remove tag preference:', error);
      throw error;
    }
  }

  /**
   * Get default confidence based on action type
   */
  private static getDefaultConfidence(action: UserTagPreference['action']): number {
    // Higher confidence for explicit actions
    switch (action) {
      case 'preference_tile_yes':
      case 'preference_tile_no':
        return 0.9; // Very high - user explicitly answered
      case 'swipe_like':
      case 'swipe_dislike':
        return 0.7; // High - user actively swiped
      case 'explicit_setting':
        return 0.95; // Highest - user manually set
      default:
        return 0.5;
    }
  }
}

