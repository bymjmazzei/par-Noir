export interface APMConfig {
  serviceName: string;
  serverUrl: string;
  enabled: boolean;
  debug: boolean;
  sampleRate: number;
  maxQueueSize: number;
  flushInterval: number;
}

export interface APMTransaction {
  id: string;
  name: string;
  type: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  result?: string;
  outcome?: 'success' | 'failure' | 'unknown';
  context?: {
    user?: {
      id?: string;
      email?: string;
      username?: string;
    };
    request?: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: any;
    };
    response?: {
      status_code?: number;
      headers?: Record<string, string>;
      body?: any;
    };
    tags?: Record<string, string>;
    custom?: Record<string, any>;
  };
  spans: APMSpan[];
}

export interface APMSpan {
  id: string;
  transactionId: string;
  name: string;
  type: string;
  subtype?: string;
  action?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  context?: {
    db?: {
      statement?: string;
      type?: string;
      user?: string;
      rows_affected?: number;
    };
    http?: {
      url?: string;
      method?: string;
      status_code?: number;
    };
    tags?: Record<string, string>;
    custom?: Record<string, any>;
  };
}

export interface APMError {
  id: string;
  transactionId?: string;
  spanId?: string;
  timestamp: number;
  culprit: string;
  exception: {
    type: string;
    message: string;
    stacktrace?: string[];
  };
  context?: {
    user?: {
      id?: string;
      email?: string;
      username?: string;
    };
    tags?: Record<string, string>;
    custom?: Record<string, any>;
  };
}

export interface APMMetrics {
  transactions: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    averageDuration: number;
  };
  spans: {
    total: number;
    active: number;
    completed: number;
    averageDuration: number;
  };
  errors: {
    total: number;
    unhandled: number;
    handled: number;
  };
  queue: {
    current: number;
    max: number;
    flushed: number;
  };
  performance: {
    memoryUsage: number;
    cpuUsage: number;
    responseTime: number;
  };
}

export interface APMQueueItem {
  type: 'transaction' | 'span' | 'error';
  data: APMTransaction | APMSpan | APMError;
  timestamp: number;
  retryCount: number;
}

export interface APMFlushResult {
  success: boolean;
  itemsProcessed: number;
  itemsFailed: number;
  duration: number;
  error?: string;
}

export interface APMContext {
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: any;
  };
  response?: {
    status_code?: number;
    headers?: Record<string, string>;
    body?: any;
  };
  tags?: Record<string, string>;
  custom?: Record<string, any>;
}

export interface APMTag {
  key: string;
  value: string;
}

export interface APMFilter {
  type?: string;
  outcome?: string;
  user?: string;
  tags?: Record<string, string>;
  timeRange?: {
    start: number;
    end: number;
  };
}
