"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const events_1 = require("events");
class WebhookSystem extends events_1.EventEmitter {
    constructor() {
        super();
        this.subscriptions = new Map();
        this.events = new Map();
        this.deliveries = new Map();
        this.retryDelays = [0, 60, 300, 900, 3600];
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
        this.startRetryProcessor();
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
    }
    setupRoutes() {
        this.app.post('/webhooks/subscriptions', this.createSubscription.bind(this));
        this.app.get('/webhooks/subscriptions', this.listSubscriptions.bind(this));
        this.app.get('/webhooks/subscriptions/:id', this.getSubscription.bind(this));
        this.app.put('/webhooks/subscriptions/:id', this.updateSubscription.bind(this));
        this.app.delete('/webhooks/subscriptions/:id', this.deleteSubscription.bind(this));
        this.app.get('/webhooks/events', this.listEvents.bind(this));
        this.app.get('/webhooks/events/:id', this.getEvent.bind(this));
        this.app.get('/webhooks/deliveries', this.listDeliveries.bind(this));
        this.app.get('/webhooks/deliveries/:id', this.getDelivery.bind(this));
        this.app.get('/webhooks/health', (req, res) => {
            res.json({
                status: 'healthy',
                subscriptions: this.subscriptions.size,
                events: this.events.size,
                deliveries: this.deliveries.size
            });
        });
    }
    async createSubscription(req, res) {
        try {
            const { clientId, url, events, secret } = req.body;
            if (!clientId || !url || !events || !Array.isArray(events)) {
                return res.status(400).json({
                    error: 'invalid_request',
                    message: 'Missing required fields: clientId, url, events'
                });
            }
            try {
                new URL(url);
            }
            catch {
                return res.status(400).json({
                    error: 'invalid_request',
                    message: 'Invalid webhook URL'
                });
            }
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
            const subscription = {
                id: crypto_1.default.randomBytes(16).toString('hex'),
                clientId,
                url,
                events,
                secret: secret || crypto_1.default.randomBytes(32).toString('hex'),
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
        }
        catch (error) {
            // Create subscription error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async listSubscriptions(req, res) {
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
        }
        catch (error) {
            // List subscriptions error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async getSubscription(req, res) {
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
        }
        catch (error) {
            // Get subscription error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async updateSubscription(req, res) {
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
                }
                catch {
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
        }
        catch (error) {
            // Update subscription error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async deleteSubscription(req, res) {
        try {
            const { id } = req.params;
            const subscription = this.subscriptions.get(id);
            if (!subscription) {
                return res.status(404).json({ error: 'not_found' });
            }
            this.subscriptions.delete(id);
            res.json({ message: 'Subscription deleted successfully' });
        }
        catch (error) {
            // Delete subscription error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async listEvents(req, res) {
        try {
            const { clientId, type, limit = 50 } = req.query;
            let events = Array.from(this.events.values());
            if (clientId) {
                events = events.filter(event => event.clientId === clientId);
            }
            if (type) {
                events = events.filter(event => event.type === type);
            }
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
        }
        catch (error) {
            // List events error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async getEvent(req, res) {
        try {
            const { id } = req.params;
            const event = this.events.get(id);
            if (!event) {
                return res.status(404).json({ error: 'not_found' });
            }
            res.json(event);
        }
        catch (error) {
            // Get event error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async listDeliveries(req, res) {
        try {
            const { subscriptionId, status, limit = 50 } = req.query;
            let deliveries = Array.from(this.deliveries.values());
            if (subscriptionId) {
                deliveries = deliveries.filter(delivery => delivery.subscriptionId === subscriptionId);
            }
            if (status) {
                deliveries = deliveries.filter(delivery => delivery.status === status);
            }
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
        }
        catch (error) {
            // List deliveries error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async getDelivery(req, res) {
        try {
            const { id } = req.params;
            const delivery = this.deliveries.get(id);
            if (!delivery) {
                return res.status(404).json({ error: 'not_found' });
            }
            res.json(delivery);
        }
        catch (error) {
            // Get delivery error
            res.status(500).json({ error: 'server_error' });
        }
    }
    emitEvent(type, data, clientId, userId) {
        const event = {
            id: crypto_1.default.randomBytes(16).toString('hex'),
            type,
            timestamp: new Date().toISOString(),
            data,
            clientId,
            userId
        };
        this.events.set(event.id, event);
        this.emit('event', event);
        this.queueDeliveries(event);
    }
    queueDeliveries(event) {
        const relevantSubscriptions = Array.from(this.subscriptions.values())
            .filter(sub => sub.isActive && sub.events.includes(event.type));
        for (const subscription of relevantSubscriptions) {
            const delivery = {
                id: crypto_1.default.randomBytes(16).toString('hex'),
                subscriptionId: subscription.id,
                eventId: event.id,
                status: 'pending',
                attempts: 0
            };
            this.deliveries.set(delivery.id, delivery);
            this.deliveries.set(delivery.id, delivery);
        }
    }
    async processDelivery(delivery) {
        const subscription = this.subscriptions.get(delivery.subscriptionId);
        const event = this.events.get(delivery.eventId);
        if (!subscription || !event) {
            delivery.status = 'failed';
            return;
        }
        try {
            const payload = {
                id: event.id,
                type: event.type,
                timestamp: event.timestamp,
                data: event.data
            };
            const signature = crypto_1.default
                .createHmac('sha256', subscription.secret)
                .update(JSON.stringify(payload))
                .digest('hex');
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
            }
            else {
                delivery.status = 'failed';
                subscription.failureCount++;
                delivery.responseBody = await response.text();
                if (delivery.attempts < this.retryDelays.length) {
                    const delay = this.retryDelays[delivery.attempts] * 1000;
                    delivery.nextRetry = new Date(Date.now() + delay);
                    delivery.status = 'pending';
                }
                else {
                    if (subscription.failureCount >= 10) {
                        subscription.isActive = false;
                    }
                }
            }
        }
        catch (error) {
            // Webhook delivery error
            delivery.attempts++;
            delivery.lastAttempt = new Date();
            delivery.status = 'failed';
            delivery.responseBody = error.message;
            subscription.failureCount++;
            if (delivery.attempts < this.retryDelays.length) {
                const delay = this.retryDelays[delivery.attempts] * 1000;
                delivery.nextRetry = new Date(Date.now() + delay);
                delivery.status = 'pending';
            }
            else {
                if (subscription.failureCount >= 10) {
                    subscription.isActive = false;
                }
            }
        }
    }
    startRetryProcessor() {
        setInterval(() => {
            const pendingDeliveries = Array.from(this.deliveries.values())
                .filter(delivery => delivery.status === 'pending' &&
                delivery.nextRetry &&
                new Date() >= delivery.nextRetry);
            for (const delivery of pendingDeliveries) {
                this.processDelivery(delivery);
            }
        }, 30000);
    }
    async start(port = 3002) {
        this.app.listen(port, () => {
            // Webhook system running
        });
    }
    getRouter() {
        const router = express_1.default.Router();
        router.post('/subscriptions', this.handleCreateSubscription.bind(this));
        router.get('/subscriptions', this.handleListSubscriptions.bind(this));
        router.delete('/subscriptions/:id', this.handleDeleteSubscription.bind(this));
        router.get('/events', this.handleListEvents.bind(this));
        router.get('/deliveries', this.handleListDeliveries.bind(this));
        return router;
    }
}
exports.default = WebhookSystem;
//# sourceMappingURL=webhook-system.js.map