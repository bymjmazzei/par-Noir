export const DEFAULT_WEBHOOK_CONFIG = {
  port: 3002,
  retryDelays: [0, 60, 300, 900, 3600], // 0s, 1m, 5m, 15m, 1h
  maxFailureCount: 10,
  retryInterval: 30000 // 30 seconds
};

export const WEBHOOK_EVENTS = {
  DID_CREATED: 'did.created',
  DID_UPDATED: 'did.updated',
  DID_DELETED: 'did.deleted',
  AUTHENTICATION_SUCCESS: 'authentication.success',
  AUTHENTICATION_FAILURE: 'authentication.failure',
  TOOL_ACCESS_GRANTED: 'tool.access.granted',
  TOOL_ACCESS_REVOKED: 'tool.access.revoked',
  DATA_POINT_CREATED: 'data.point.created',
  DATA_POINT_UPDATED: 'data.point.updated',
  DATA_POINT_DELETED: 'data.point.deleted',
  SECURITY_ALERT: 'security.alert',
  SYSTEM_MAINTENANCE: 'system.maintenance'
} as const;

export const WEBHOOK_STATUS_CO = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const;

export const WEBHOOK_DELIVERY_STATUS = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed'
} as const;

export const WEBHOOK_SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended'
} as const;
