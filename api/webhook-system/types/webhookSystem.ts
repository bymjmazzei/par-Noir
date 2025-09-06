export interface WebhookSubscription {
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

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: string;
  data: any;
  clientId?: string;
  userId?: string;
}

export interface WebhookDelivery {
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

export interface WebhookPayload {
  id: string;
  type: string;
  timestamp: string;
  data: any;
  clientId?: string;
  userId?: string;
}

export interface WebhookResponse {
  status: 'success' | 'error';
  message?: string;
  data?: any;
}

export interface WebhookHealthStatus {
  status: string;
  subscriptions: number;
  events: number;
  deliveries: number;
}

export interface WebhookConfig {
  port: number;
  retryDelays: number[];
  maxFailureCount: number;
  retryInterval: number;
}
