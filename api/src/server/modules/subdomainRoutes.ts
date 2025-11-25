/**
 * Subdomain Routes
 * Handles subdomain-based feed routing
 */

import { Request, Response } from 'express';
import { FeedService } from './feedService';

/**
 * Setup subdomain routes
 */
export function setupSubdomainRoutes(app: any) {
  /**
   * GET /api/feeds/by-subdomain/:subdomain
   * Get feed by subdomain
   */
  app.get('/api/feeds/by-subdomain/:subdomain', async (req: Request, res: Response) => {
    try {
      const { subdomain } = req.params;
      const db = (await import('../utils/database')).getDatabasePool();

      const result = await db.query(`
        SELECT * FROM feeds 
        WHERE subdomain = $1
        LIMIT 1
      `, [subdomain]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Feed not found for this subdomain' });
      }

      const feed = FeedService.rowToFeed(result.rows[0]);
      return res.json(feed);
    } catch (error) {
      console.error('Subdomain lookup error:', error);
      return res.status(500).json({ error: 'Failed to lookup feed by subdomain' });
    }
  });
}

