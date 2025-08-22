import express from 'express';
import { EventEmitter } from 'events';
declare class WebhookSystem extends EventEmitter {
    private app;
    private subscriptions;
    private events;
    private deliveries;
    private retryDelays;
    constructor();
    private setupMiddleware;
    private setupRoutes;
    private createSubscription;
    private listSubscriptions;
    private getSubscription;
    private updateSubscription;
    private deleteSubscription;
    private listEvents;
    private getEvent;
    private listDeliveries;
    private getDelivery;
    emitEvent(type: string, data: any, clientId?: string, userId?: string): void;
    private queueDeliveries;
    private processDelivery;
    private startRetryProcessor;
    start(port?: number): Promise<void>;
    getRouter(): express.Router;
}
export default WebhookSystem;
//# sourceMappingURL=webhook-system.d.ts.map