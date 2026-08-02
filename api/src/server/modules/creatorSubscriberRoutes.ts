/**
 * Creator-scoped subscriber index.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

/** GET /api/creators/:creatorDid/subscribers - Get creator's subscriber index */
export function registerCreatorSubscriberRoutes(app: Application): void {
    app.get('/api/creators/:creatorDid/subscribers', async (req: Request, res: Response) => {
      try {
        const { FeedService } = await import('./feedService');
        const { creatorDid } = req.params;

        const subscribers = await FeedService.getCreatorSubscriberIndex(creatorDid);

        return res.json({
          creatorDid,
          subscribers,
          count: subscribers.length
        });
      } catch (error: any) {
        console.error('Error getting creator subscriber index:', error);
        return res.status(500).json({ error: 'Failed to get subscriber index', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });
}
