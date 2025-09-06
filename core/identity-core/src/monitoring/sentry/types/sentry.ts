export interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  enabled: boolean;
  debug: boolean;
  tracesSampleRate: number;
  profilesSampleRate: number;
  integrations: string[];
}

export interface SentryEvent {
  message: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  contexts?: {
    app?: {
      name: string;
      version: string;
    };
    device?: {
      name: string;
      version: string;
    };
    os?: {
      name: string;
      version: string;
    };
    runtime?: {
      name: string;
      version: string;
    };
  };
  breadcrumbs?: SentryBreadcrumb[];
}

export interface SentryBreadcrumb {
  message: string;
  category: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, any>;
  timestamp?: number;
}

export interface SentryPerformance {
  name: string;
  op: string;
  description?: string;
  startTimestamp: number;
  endTimestamp: number;
  tags?: Record<string, string>;
  data?: Record<string, any>;
}

export interface SentryUser {
  id: string;
  email?: string;
  username?: string;
  ip_address?: string;
  segment?: string;
}

export interface SentryContext {
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  user?: SentryUser;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
}

export interface SentryError {
  type: string;
  value: string;
  stacktrace?: {
    frames: Array<{
      filename?: string;
      function?: string;
      lineno?: number;
      colno?: number;
      in_app?: boolean;
    }>;
  };
}

export interface SentryTransaction {
  name: string;
  op: string;
  description?: string;
  startTimestamp: number;
  endTimestamp?: number;
  tags?: Record<string, string>;
  data?: Record<string, any>;
  spans?: SentryPerformance[];
}

export interface SentryMetrics {
  events: {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
  };
  performance: {
    totalSpans: number;
    activeSpans: number;
    averageDuration: number;
  };
  breadcrumbs: {
    total: number;
    byCategory: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
  };
}

export interface SentrySanitizationConfig {
  enabled: boolean;
  patterns: RegExp[];
  fields: string[];
  replacement: string;
}
