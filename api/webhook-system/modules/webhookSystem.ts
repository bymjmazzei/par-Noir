import express from 'express';
import { EventEmitter } from 'events';
import { WebhookSubscription, WebhookEvent, WebhookDelivery, WebhookPayload, WebhookHealthStatus } from '../types/webhookSystem';
import { SubscriptionManager } from './subscriptionManager';
import { EventManager } from './eventManager';
import { DeliveryManager } from './deliveryManager';
import { DEFAULT_WEBHOOK_CONFIG } from '../constants/webhookConstants';

export class WebhookSystem extends EventEmitter {
  private app: express.Application;
  private subscriptionManager: SubscriptionManager;
  private eventManager: EventManager;
  private deliveryManager: DeliveryManager;
  private retryProcessorInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.app = express();
    this.subscriptionManager = new SubscriptionManager();
    this.eventManager = new EventManager();
    this.deliveryManager = new DeliveryManager();
    
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
    this.app.get('/webhooks/health', this.getHealthStatus.bind(this));
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

      const subscription = await this.subscriptionManager.createSubscription(clientId, url, events, secret);

      res.json({
        id: subscription.id,
        clientId: subscription.clientId,
        url: subscription.url,
        events: subscription.events,
        isActive: subscription.isActive,
        createdAt: subscription.createdAt
      });

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Subscription creation error logged
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // List webhook subscriptions
  private async listSubscriptions(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { clientId } = req.query;
      const subscriptions = this.subscriptionManager.listSubscriptions(clientId as string);

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
      if (process.env.NODE_ENV === 'development') {
        // Subscription listing error logged
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get a specific webhook subscription
  private async getSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const subscription = this.subscriptionManager.getSubscription(id);

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
      if (process.env.NODE_ENV === 'development') {
        // Subscription retrieval error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Update a webhook subscription
  private async updateSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { url, events, isActive } = req.body;

      const subscription = await this.subscriptionManager.updateSubscription(id, { url, events, isActive });

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
      if (process.env.NODE_ENV === 'development') {
        // Subscription update error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Delete a webhook subscription
  private async deleteSubscription(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = this.subscriptionManager.deleteSubscription(id);

      if (!deleted) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json({ message: 'Subscription deleted successfully' });

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Subscription deletion error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // List webhook events
  private async listEvents(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { clientId, type, limit = 50 } = req.query;
      const events = this.eventManager.listEvents(
        clientId as string,
        type as string,
        Number(limit)
      );

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
      if (process.env.NODE_ENV === 'development') {
        // Event listing error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get a specific webhook event
  private async getEvent(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const event = this.eventManager.getEvent(id);

      if (!event) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(event);

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Event retrieval error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // List webhook deliveries
  private async listDeliveries(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { subscriptionId, status, limit = 50 } = req.query;
      const deliveries = this.deliveryManager.listDeliveries(
        subscriptionId as string,
        status as string,
        Number(limit)
      );

      res.json({ deliveries });

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Delivery listing error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get a specific webhook delivery
  private async getDelivery(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const delivery = this.deliveryManager.getDelivery(id);

      if (!delivery) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(delivery);

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Delivery retrieval error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Get health status
  private async getHealthStatus(req: express.Request, res: express.Response): Promise<void> {
    try {
      const subscriptionStats = this.subscriptionManager.getSubscriptionStats();
      const eventStats = this.eventManager.getEventStats();
      const deliveryStats = this.deliveryManager.getDeliveryStats();

      const healthStatus: WebhookHealthStatus = {
        status: 'healthy',
        subscriptions: subscriptionStats.total,
        events: eventStats.total,
        deliveries: deliveryStats.total
      };

      res.json(healthStatus);

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Health check error
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Emit webhook event
  async emitEvent(type: string, data: any, clientId?: string, userId?: string): Promise<void> {
    try {
      // Create event
      const event = await this.eventManager.createEvent(type, data, clientId, userId);

      // Get active subscriptions for this event type
      const subscriptions = this.subscriptionManager.getActiveSubscriptionsForEvent(type);

      // Create deliveries and process them
      for (const subscription of subscriptions) {
        const delivery = await this.deliveryManager.createDelivery(subscription.id, event.id);
        
        // Process delivery asynchronously
        this.processDelivery(delivery, subscription, event).catch(error => {
          if (process.env.NODE_ENV === 'development') {
            // Delivery processing error
          }
        });
      }

      this.emit('event', event);

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Event emission error
      }
      this.emit('error', error);
    }
  }

  // Process webhook delivery
  private async processDelivery(
    delivery: WebhookDelivery,
    subscription: WebhookSubscription,
    event: WebhookEvent
  ): Promise<void> {
    const payload: WebhookPayload = {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      data: event.data,
      clientId: event.clientId,
      userId: event.userId
    };

    await this.deliveryManager.processDelivery(delivery, subscription, payload);

    // Update subscription based on delivery result
    if (delivery.status === 'delivered') {
      this.subscriptionManager.updateLastDelivery(subscription.id);
    } else if (delivery.status === 'failed') {
      this.subscriptionManager.updateFailureCount(subscription.id, subscription.failureCount + 1);
    }
  }

  // Start the retry processor
  private startRetryProcessor(): void {
    this.retryProcessorInterval = setInterval(() => {
      const pendingDeliveries = this.deliveryManager.getPendingDeliveries();

      for (const delivery of pendingDeliveries) {
        const subscription = this.subscriptionManager.getSubscription(delivery.subscriptionId);
        const event = this.eventManager.getEvent(delivery.eventId);

        if (subscription && event) {
          this.processDelivery(delivery, subscription, event).catch(error => {
            if (process.env.NODE_ENV === 'development') {
              // Retry processing error
            }
          });
        }
      }
    }, DEFAULT_WEBHOOK_CONFIG.retryInterval);
  }

  // Start the webhook server
  public async start(port: number = DEFAULT_WEBHOOK_CONFIG.port): Promise<void> {
    this.app.listen(port, () => {
      if (process.env.NODE_ENV === 'development') {
        // Webhook system started
      }
    });
  }

  // Get Express router
  public getRouter(): express.Router {
    const router = express.Router();
    
    // Webhook subscription management
    router.post('/subscriptions', this.createSubscription.bind(this));
    router.get('/subscriptions', this.listSubscriptions.bind(this));
    router.delete('/subscriptions/:id', this.deleteSubscription.bind(this));
    
    // Webhook event management
    router.get('/events', this.listEvents.bind(this));
    router.get('/deliveries', this.listDeliveries.bind(this));
    
    return router;
  }

  // Stop the webhook system
  public stop(): void {
    if (this.retryProcessorInterval) {
      clearInterval(this.retryProcessorInterval);
      this.retryProcessorInterval = null;
    }
  }

  // Get managers for external access
  public getSubscriptionManager(): SubscriptionManager {
    return this.subscriptionManager;
  }

  public getEventManager(): EventManager {
    return this.eventManager;
  }

  public getDeliveryManager(): DeliveryManager {
    return this.deliveryManager;
  }
}
