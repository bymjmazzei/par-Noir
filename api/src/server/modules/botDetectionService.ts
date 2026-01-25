/**
 * Bot Detection Service
 * Analyzes user behavior patterns to detect bot-like activity
 */

import { getDatabasePool } from '../utils/database';

export interface BotScoreResult {
  botScore: number; // 0.0 = human, 1.0 = bot
  signals: {
    spam: number;
    lowDiversity: number;
    automatedTiming: number;
    singleActionType: number;
    noViewingTime: number;
    burstPattern: number;
  };
  lastCalculated: string;
}

export class BotDetectionService {
  /**
   * Calculate bot score for a user based on engagement patterns
   */
  static async calculateBotScore(userPnIdentifier: string): Promise<BotScoreResult> {
    const db = getDatabasePool();
    
    // Get engagement patterns from last 7 days
    const engagementPattern = await db.query(`
      SELECT 
        COUNT(*) as total_actions,
        COUNT(DISTINCT file_id) as unique_files,
        COUNT(DISTINCT DATE(created_at)) as active_days,
        AVG(EXTRACT(EPOCH FROM (
          created_at - LAG(created_at) OVER (ORDER BY created_at)
        ))) as avg_time_between,
        MIN(created_at) as first_action,
        MAX(created_at) as last_action,
        COUNT(DISTINCT type) as action_types
      FROM engagement
      WHERE user_did = $1
      AND created_at > NOW() - INTERVAL '7 days'
    `, [userPnIdentifier]);

    if (engagementPattern.rows.length === 0) {
      return {
        botScore: 0.0,
        signals: { spam: 0, lowDiversity: 0, automatedTiming: 0, singleActionType: 0, noViewingTime: 0, burstPattern: 0 },
        lastCalculated: new Date().toISOString()
      };
    }

    const pattern = engagementPattern.rows[0];
    const totalActions = parseInt(pattern.total_actions, 10);
    const uniqueFiles = parseInt(pattern.unique_files, 10);
    const activeDays = parseInt(pattern.active_days, 10);
    const avgTimeBetween = parseFloat(pattern.avg_time_between) || 0;
    const timeSpan = new Date(pattern.last_action).getTime() - 
                     new Date(pattern.first_action).getTime();
    const hoursActive = timeSpan / (1000 * 60 * 60);
    const actionTypes = parseInt(pattern.action_types, 10);

    const signals = {
      spam: 0,
      lowDiversity: 0,
      automatedTiming: 0,
      singleActionType: 0,
      noViewingTime: 0,
      burstPattern: 0
    };

    let botScore = 0.0;

    // Signal 1: Spam detection (100+ actions in < 1 hour)
    if (totalActions > 100 && hoursActive < 1) {
      signals.spam = 0.4;
      botScore += 0.4;
    }

    // Signal 2: Low diversity (< 10% unique files with 50+ actions)
    const diversityRatio = uniqueFiles / totalActions;
    if (diversityRatio < 0.1 && totalActions > 50) {
      signals.lowDiversity = 0.3;
      botScore += 0.3;
    }

    // Signal 3: Automated timing (actions every 1-2 seconds with 20+ actions)
    if (avgTimeBetween > 0 && avgTimeBetween < 2 && totalActions > 20) {
      signals.automatedTiming = 0.2;
      botScore += 0.2;
    }

    // Signal 4: Single action type (only one type of action with 30+ actions)
    if (actionTypes === 1 && totalActions > 30) {
      signals.singleActionType = 0.2;
      botScore += 0.2;
    }

    // Signal 5: No viewing time
    const viewingScore = await this.analyzeViewingBehavior(userPnIdentifier);
    if (viewingScore.noViewingTime) {
      signals.noViewingTime = 0.3;
      botScore += 0.3;
    }

    // Signal 6: Burst patterns
    const burstScore = await this.detectBurstPatterns(userPnIdentifier);
    signals.burstPattern = burstScore;
    botScore += burstScore * 0.2;

    return {
      botScore: Math.min(botScore, 1.0), // Cap at 1.0
      signals,
      lastCalculated: new Date().toISOString()
    };
  }

  /**
   * Analyze viewing behavior to detect if user actually views content
   */
  private static async analyzeViewingBehavior(userPnIdentifier: string): Promise<{ noViewingTime: boolean }> {
    const db = getDatabasePool();
    
    const views = await db.query(`
      SELECT AVG(view_duration) as avg_view_time
      FROM file_views
      WHERE user_did = $1
      AND viewed_at > NOW() - INTERVAL '7 days'
    `, [userPnIdentifier]);

    if (views.rows.length === 0 || !views.rows[0].avg_view_time) {
      return { noViewingTime: false }; // No data = neutral
    }

    const avgViewTime = parseFloat(views.rows[0].avg_view_time) || 0;
    return { noViewingTime: avgViewTime < 1 && avgViewTime > 0 };
  }

  /**
   * Detect burst patterns (rapid-fire actions followed by silence)
   */
  private static async detectBurstPatterns(userPnIdentifier: string): Promise<number> {
    const db = getDatabasePool();
    
    // Check for bursts: many actions in short time, then silence
    const bursts = await db.query(`
      WITH action_times AS (
        SELECT 
          created_at,
          EXTRACT(EPOCH FROM (
            created_at - LAG(created_at) OVER (ORDER BY created_at)
          )) as time_since_last
        FROM engagement
        WHERE user_did = $1
        AND created_at > NOW() - INTERVAL '7 days'
      )
      SELECT 
        COUNT(*) FILTER (WHERE time_since_last < 5) as rapid_actions,
        COUNT(*) as total_actions
      FROM action_times
    `, [userPnIdentifier]);

    if (bursts.rows.length === 0 || !bursts.rows[0].total_actions) {
      return 0;
    }

    const rapidActions = parseInt(bursts.rows[0].rapid_actions, 10) || 0;
    const totalActions = parseInt(bursts.rows[0].total_actions, 10);
    
    if (totalActions === 0) return 0;
    
    const burstRatio = rapidActions / totalActions;
    return burstRatio > 0.8 ? 1.0 : 0; // 80%+ rapid actions = burst pattern
  }

  /**
   * Get rate limit based on bot score
   * Returns graduated rate limits that allow recovery
   */
  static getRateLimitForBotScore(botScore: number): { maxActions: number; window: string } {
    if (botScore < 0.3) {
      // Very low bot score: normal user limits
      return { maxActions: 500, window: '1 hour' };
    } else if (botScore < 0.5) {
      // Low bot score: slightly reduced
      return { maxActions: 200, window: '1 hour' };
    } else if (botScore < 0.7) {
      // Moderate bot score: significantly reduced
      return { maxActions: 50, window: '1 hour' };
    } else if (botScore < 0.85) {
      // High bot score: very strict (but not zero)
      return { maxActions: 10, window: '1 hour' };
    } else {
      // Very high bot score: minimal (but allows recovery)
      return { maxActions: 3, window: '1 hour' };
    }
  }
}

