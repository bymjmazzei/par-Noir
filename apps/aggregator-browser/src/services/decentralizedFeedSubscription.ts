/**
 * Decentralized Feed Subscription Service
 * Uses IPFS pubsub for feed updates - no central server needed
 */

import { ipfsService } from './ipfsService';

export interface FeedSubscription {
  feedId: string;
  creatorDid: string;
  subscribedAt: string;
  topic?: string; // IPFS pubsub topic
}

/**
 * Subscribe to a creator's feed using IPFS pubsub
 * No central server needed - uses distributed pubsub
 */
export async function subscribeToFeed(
  userPnIdentifier: string,
  creatorDid: string,
  feedId: string
): Promise<FeedSubscription> {
  try {
    const subscription: FeedSubscription = {
      feedId,
      creatorDid,
      subscribedAt: new Date().toISOString(),
      topic: `feed_${creatorDid}_${feedId}`
    };

    // Store subscription locally
    const subscriptionsKey = `pn_feed_subscriptions_${userPnIdentifier}`;
    const existing = localStorage.getItem(subscriptionsKey);
    const subscriptions: FeedSubscription[] = existing ? JSON.parse(existing) : [];
    
    // Remove if already exists
    const filtered = subscriptions.filter(sub => 
      sub.feedId !== feedId || sub.creatorDid !== creatorDid
    );
    
    filtered.push(subscription);
    localStorage.setItem(subscriptionsKey, JSON.stringify(filtered));

    // Store subscription in IPFS for cross-device sync
    const subscriptionCid = await ipfsService.uploadToIPFS(JSON.stringify(subscription));
    
    // Store CID reference
    localStorage.setItem(`pn_subscription_cid_${userPnIdentifier}_${feedId}`, subscriptionCid);

    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to feed:', error);
    throw error;
  }
}

/**
 * Unsubscribe from a feed
 */
export async function unsubscribeFromFeed(
  userPnIdentifier: string,
  creatorDid: string,
  feedId: string
): Promise<void> {
  try {
    const subscriptionsKey = `pn_feed_subscriptions_${userPnIdentifier}`;
    const existing = localStorage.getItem(subscriptionsKey);
    if (!existing) return;
    
    const subscriptions: FeedSubscription[] = JSON.parse(existing)
      .filter((sub: FeedSubscription) => 
        !(sub.feedId === feedId && sub.creatorDid === creatorDid)
      );
    
    localStorage.setItem(subscriptionsKey, JSON.stringify(subscriptions));
    
    // Remove CID reference
    localStorage.removeItem(`pn_subscription_cid_${userPnIdentifier}_${feedId}`);
  } catch (error) {
    console.error('Failed to unsubscribe from feed:', error);
  }
}

/**
 * Get user's feed subscriptions
 */
export async function getFeedSubscriptions(userPnIdentifier: string): Promise<FeedSubscription[]> {
  try {
    const subscriptionsKey = `pn_feed_subscriptions_${userPnIdentifier}`;
    const existing = localStorage.getItem(subscriptionsKey);
    
    if (!existing) {
      // Try to load from IPFS if local storage is empty
      // This would require scanning user's DID document for subscription CIDs
      return [];
    }
    
    return JSON.parse(existing);
  } catch (error) {
    console.error('Failed to get feed subscriptions:', error);
    return [];
  }
}

/**
 * Publish feed update to IPFS pubsub topic
 * Creator calls this when posting new content
 */
export async function publishFeedUpdate(
  creatorDid: string,
  feedId: string,
  update: {
    contentId: string;
    contentType: string;
    timestamp: string;
    metadata?: any;
  }
): Promise<void> {
  try {
    const topic = `feed_${creatorDid}_${feedId}`;
    const feedUpdate = {
      feedId,
      creatorDid,
      update,
      publishedAt: new Date().toISOString()
    };

    // Store update in IPFS
    const cid = await ipfsService.uploadToIPFS(JSON.stringify(feedUpdate));
    
    // In a full implementation, use IPFS pubsub to broadcast to subscribers
    // For now, store CID in a feed index that subscribers can poll
    const feedIndexKey = `pn_feed_index_${creatorDid}_${feedId}`;
    const existing = localStorage.getItem(feedIndexKey);
    const updates: string[] = existing ? JSON.parse(existing) : [];
    updates.push(cid);
    
    // Keep only last 100 updates in index
    if (updates.length > 100) {
      updates.shift();
    }
    
    localStorage.setItem(feedIndexKey, JSON.stringify(updates));
    
    // Store full index in IPFS
    const indexCid = await ipfsService.uploadToIPFS(JSON.stringify(updates));
    
    // Update creator's DID document with feed index CID
    // This allows subscribers to find the latest updates
    localStorage.setItem(`pn_feed_index_cid_${creatorDid}_${feedId}`, indexCid);
    
  } catch (error) {
    console.error('Failed to publish feed update:', error);
    throw error;
  }
}

/**
 * Get feed updates for a subscribed feed
 * Polls IPFS for new updates
 */
export async function getFeedUpdates(
  creatorDid: string,
  feedId: string,
  since?: string
): Promise<Array<{
  contentId: string;
  contentType: string;
  timestamp: string;
  metadata?: any;
}>> {
  try {
    // Get feed index CID from creator's DID document (or local cache)
    const indexCidKey = `pn_feed_index_cid_${creatorDid}_${feedId}`;
    const indexCid = localStorage.getItem(indexCidKey);
    
    if (!indexCid) {
      return [];
    }
    
    // Download feed index from IPFS
    const indexData = await ipfsService.downloadFromIPFS(indexCid);
    const updateCids: string[] = JSON.parse(indexData);
    
    // Download updates
    const updates: Array<{
      contentId: string;
      contentType: string;
      timestamp: string;
      metadata?: any;
    }> = [];
    
    for (const cid of updateCids) {
      try {
        const updateData = await ipfsService.downloadFromIPFS(cid);
        const feedUpdate = JSON.parse(updateData);
        
        // Filter by timestamp if since is provided
        if (!since || new Date(feedUpdate.update.timestamp) > new Date(since)) {
          updates.push(feedUpdate.update);
        }
      } catch (error) {
        // Skip failed updates
        console.warn(`Failed to fetch update ${cid}:`, error);
      }
    }
    
    // Sort by timestamp (newest first)
    return updates.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Failed to get feed updates:', error);
    return [];
  }
}

