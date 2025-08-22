/**
 * Identity Protocol Webhook System
 * 
 * Provides real-time event notifications to third-party applications
 */

import express from 'express';
import crypto from 'crypto';
import { EventEmitter } from 'events';

interface WebhookSubscription {
  id: string;
  clientId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  lastDelivery?: Date;
  failureCount: number;
}

interface WebhookEvent {
  id: string;
  type: string;
  timestamp: string;
  data: any;
  clientId?: string;
  userId?: string;
}

interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
  responseCode?: number;
  responseBody?: string;
}

class WebhookSystem extends EventEmitter {
  private app: express.Application;
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private events: Map<string, WebhookEvent> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private retryDelays: number[] = [0, 60, 300, 900, 3600]; // 0s, 1m, 5m, 15m, 1h

  constructor() {
    super();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.startRetryProcessor();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Webhook subscription management
    this.app.post('/webhooks/subscriptions', this.createSubscription.bind(this));
    this.app.get('/webhooks/subscriptions', this.listSubscriptions.bind(this));
    this.app.get('/webhooks/subscriptions/:id', this.getSubscription.bind(this));
    this.app.put('/webhooks/subscriptions/:id', this.updateSubscription.bind(this));
    this.app.delete('/webhooks/subscriptions/:id', this.deleteSubscription.bind(this));

    // Webhook event history
    this.app.get('/webhooks/events', this.listEvents.bind(this));
    this.app.get('/webhooks/events/:id', this.getEvent.bind(this));

    // Webhook delivery status
    this.app.get('/webhooks/deliveries', this.listDeliveries.bind(this));
    this.app.get('/webhooks/deliveries/:id', this.getDelivery.bind(this));

    // Health check
    this.app.get('/webhooks/health', (req, res) => {
      res.json({
        status: 'healthy',
        subscriptions: this.subscriptions.size,
        events: this.events.size,
        deliveries: this.deliveries.size
      });
    });
  }

  // Create a new webhook subscription
  private async createSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { clientId, url, events, secret } = req.body;

      if (!clientId || !url || !events || !Array.isArray(events)) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Missing required fields: clientId, url, events'
        });
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Invalid webhook URL'
        });
      }

      // Validate events
      const validEvents = [
        'identity.created',
        'identity.updated',
        'identity.deleted',
        'custodian.added',
        'custodian.removed',
        'custodian.updated',
        'recovery.initiated',
        'recovery.approved',
        'recovery.completed',
        'recovery.failed',
        'device.added',
        'device.removed',
        'auth.success',
        'auth.failed',
        'token.revoked'
      ];

      const invalidEvents = events.filter(event => !validEvents.includes(event));
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          error: 'invalid_request',
          message: `Invalid events: ${invalidEvents.join(', ')}`
        });
      }

      const subscription: WebhookSubscription = {
        id: crypto.randomBytes(16).toString('hex'),
        clientId,
        url,
        events,
        secret: secret || crypto.randomBytes(32).toString('hex'),
        isActive: true,
        createdAt: new Date(),
        failureCount: 0
      };

      this.subscriptions.set(subscription.id, subscription);

      res.status(201).json({
        id: subscription.id,
        clientId: subscription.clientId,
        url: subscription.url,
        events: subscription.events,
        secret: subscription.secret,
        isActive: subscription.isActive,
        createdAt: subscription.createdAt
      });

    } catch (error) {
      // Silently handle subscription creation errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // List webhook subscriptions
  private async listSubscriptions(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { clientId } = req.query;
      let subscriptions = Array.from(this.subscriptions.values());

      if (clientId) {
        subscriptions = subscriptions.filter(sub => sub.clientId === clientId);
      }

      res.json({
        subscriptions: subscriptions.map(sub => ({
          id: sub.id,
          clientId: sub.clientId,
          url: sub.url,
          events: sub.events,
          isActive: sub.isActive,
          createdAt: sub.createdAt,
          lastDelivery: sub.lastDelivery,
          failureCount: sub.failureCount
        }))
      });

    } catch (error) {
      // Silently handle subscription listing errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get a specific webhook subscription
  private async getSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const subscription = this.subscriptions.get(id);

      if (!subscription) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json({
        id: subscription.id,
        clientId: subscription.clientId,
        url: subscription.url,
        events: subscription.events,
        isActive: subscription.isActive,
        createdAt: subscription.createdAt,
        lastDelivery: subscription.lastDelivery,
        failureCount: subscription.failureCount
      });

    } catch (error) {
      // Silently handle subscription retrieval errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Update a webhook subscription
  private async updateSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { url, events, isActive } = req.body;

      const subscription = this.subscriptions.get(id);
      if (!subscription) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (url) {
        try {
          new URL(url);
          subscription.url = url;
        } catch {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'Invalid webhook URL'
          });
        }
      }

      if (events && Array.isArray(events)) {
        subscription.events = events;
      }

      if (typeof isActive === 'boolean') {
        subscription.isActive = isActive;
      }

      res.json({
        id: subscription.id,
        clientId: subscription.clientId,
        url: subscription.url,
        events: subscription.events,
        isActive: subscription.isActive,
        createdAt: subscription.createdAt,
        lastDelivery: subscription.lastDelivery,
        failureCount: subscription.failureCount
      });

    } catch (error) {
      // Silently handle subscription update errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Delete a webhook subscription
  private async deleteSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const subscription = this.subscriptions.get(id);

      if (!subscription) {
        return res.status(404).json({ error: 'not_found' });
      }

      this.subscriptions.delete(id);

      res.json({ message: 'Subscription deleted successfully' });

    } catch (error) {
      // Silently handle subscription deletion errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // List webhook events
  private async listEvents(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { clientId, type, limit = 50 } = req.query;
      let events = Array.from(this.events.values());

      if (clientId) {
        events = events.filter(event => event.clientId === clientId);
      }

      if (type) {
        events = events.filter(event => event.type === type);
      }

      // Sort by timestamp descending and limit
      events = events
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, Number(limit));

      res.json({
        events: events.map(event => ({
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          clientId: event.clientId,
          userId: event.userId
        }))
      });

    } catch (error) {
      // Silently handle event listing errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get a specific webhook event
  private async getEvent(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const event = this.events.get(id);

      if (!event) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(event);

    } catch (error) {
      // Silently handle event retrieval errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // List webhook deliveries
  private async listDeliveries(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { subscriptionId, status, limit = 50 } = req.query;
      let deliveries = Array.from(this.deliveries.values());

      if (subscriptionId) {
        deliveries = deliveries.filter(delivery => delivery.subscriptionId === subscriptionId);
      }

      if (status) {
        deliveries = deliveries.filter(delivery => delivery.status === status);
      }

      // Sort by last attempt descending and limit
      deliveries = deliveries
        .sort((a, b) => {
          const aTime = a.lastAttempt ? new Date(a.lastAttempt).getTime() : 0;
          const bTime = b.lastAttempt ? new Date(b.lastAttempt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, Number(limit));

      res.json({
        deliveries: deliveries.map(delivery => ({
          id: delivery.id,
          subscriptionId: delivery.subscriptionId,
          eventId: delivery.eventId,
          status: delivery.status,
          attempts: delivery.attempts,
          lastAttempt: delivery.lastAttempt,
          nextRetry: delivery.nextRetry,
          responseCode: delivery.responseCode
        }))
      });

    } catch (error) {
      // Silently handle delivery listing errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get a specific webhook delivery
  private async getDelivery(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const delivery = this.deliveries.get(id);

      if (!delivery) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(delivery);

    } catch (error) {
      // Silently handle delivery retrieval errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Emit a webhook event
  public emitEvent(type: string, data: any, clientId?: string, userId?: string): void {
    const event: WebhookEvent = {
      id: crypto.randomBytes(16).toString('hex'),
      type,
      timestamp: new Date().toISOString(),
      data,
      clientId,
      userId
    };

    this.events.set(event.id, event);
    this.emit('event', event);

    // Find relevant subscriptions and queue deliveries
    this.queueDeliveries(event);
  }

  // Queue webhook deliveries for an event
  private queueDeliveries(event: WebhookEvent): void {
    const relevantSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.isActive && sub.events.includes(event.type));

    for (const subscription of relevantSubscriptions) {
      const delivery: WebhookDelivery = {
        id: crypto.randomBytes(16).toString('hex'),
        subscriptionId: subscription.id,
        eventId: event.id,
        status: 'pending',
        attempts: 0
      };

      this.deliveries.set(delivery.id, delivery);
      this.deliveries.set(delivery.id, delivery);
    }
  }

  // Process webhook deliveries
  private async processDelivery(delivery: WebhookDelivery): Promise<void> {
    const subscription = this.subscriptions.get(delivery.subscriptionId);
    const event = this.events.get(delivery.eventId);

    if (!subscription || !event) {
      delivery.status = 'failed';
      return;
    }

    try {
      // Create webhook payload
      const payload = {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        data: event.data
      };

      // Sign the payload
      const signature = crypto
        .createHmac('sha256', subscription.secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      // Send webhook
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Identity-Protocol-Signature': signature,
          'X-Identity-Protocol-Event': event.type,
          'User-Agent': 'Identity-Protocol-Webhook/1.0'
        },
        body: JSON.stringify(payload)
      });

      delivery.attempts++;
      delivery.lastAttempt = new Date();
      delivery.responseCode = response.status;

      if (response.ok) {
        delivery.status = 'delivered';
        subscription.lastDelivery = new Date();
        subscription.failureCount = 0;
      } else {
        delivery.status = 'failed';
        subscription.failureCount++;
        delivery.responseBody = await response.text();

        // Schedule retry if attempts remaining
        if (delivery.attempts < this.retryDelays.length) {
          const delay = this.retryDelays[delivery.attempts] * 1000;
          delivery.nextRetry = new Date(Date.now() + delay);
          delivery.status = 'pending';
        } else {
          // Deactivate subscription after too many failures
          if (subscription.failureCount >= 10) {
            subscription.isActive = false;
          }
        }
      }

    } catch (error) {
      // Silently handle webhook delivery errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      delivery.attempts++;
      delivery.lastAttempt = new Date();
      delivery.status = 'failed';
      delivery.responseBody = error.message;

      subscription.failureCount++;

      // Schedule retry if attempts remaining
      if (delivery.attempts < this.retryDelays.length) {
        const delay = this.retryDelays[delivery.attempts] * 1000;
        delivery.nextRetry = new Date(Date.now() + delay);
        delivery.status = 'pending';
      } else {
        // Deactivate subscription after too many failures
        if (subscription.failureCount >= 10) {
          subscription.isActive = false;
        }
      }
    }
  }

  // Start the retry processor
  private startRetryProcessor(): void {
    setInterval(() => {
      const pendingDeliveries = Array.from(this.deliveries.values())
        .filter(delivery => 
          delivery.status === 'pending' && 
          delivery.nextRetry && 
          new Date() >= delivery.nextRetry
        );

      for (const delivery of pendingDeliveries) {
        this.processDelivery(delivery);
      }
    }, 30000); // Check every 30 seconds
  }

  // Start the webhook server
  public async start(port: number = 3002): Promise<void> {
    this.app.listen(port, () => {
      // Silently start webhook system in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    });
  }

  public getRouter(): express.Router {
    const router = express.Router();
    
    // Webhook subscription management
    router.post('/subscriptions', this.handleCreateSubscription.bind(this));
    router.get('/subscriptions', this.handleListSubscriptions.bind(this));
    router.delete('/subscriptions/:id', this.handleDeleteSubscription.bind(this));
    
    // Webhook event management
    router.get('/events', this.handleListEvents.bind(this));
    router.get('/deliveries', this.handleListDeliveries.bind(this));
    
    return router;
  }
}

export default WebhookSystem; 