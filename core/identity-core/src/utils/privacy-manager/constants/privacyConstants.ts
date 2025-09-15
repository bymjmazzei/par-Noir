// Security configuration
export const SENSITIVE_PATTERNS = [
  'password', 'privateKey', 'recoveryKey', 'ssn', 'medical', 'biometric', 'secret', 'token', 'credential'
];

export const ALLOWED_DATA_POINTS = [
  'userProfile', 'displayName', 'avatar', 'preferences', 'theme', 'language', 'content', 'files', 'messages'
];

export const SUSPICIOUS_TOOL_PATTERNS = [
  /(admin|root|system|test|debug|internal|secret)/i,
  /(sql|script|exec|cmd|shell)/i,
  /(union|select|insert|update|delete|drop)/i,
  /(javascript|vbscript|eval|function)/i,
  /(\.\.\/|\.\.\\)/, // Path traversal
  /[<>"'&]/, // HTML/XML injection
  /[^\w-]/ // Non-alphanumeric characters except hyphens
];

export const SENSITIVE_DATA_PATTERNS = [
  /(password|passwd|secret|key|token|credential)/i,
  /(ssn|social|security|number)/i,
  /(credit|card|bank|account|routing)/i,
  /(private|internal|confidential)/i,
  /(admin|root|system|privileged)/i
];

export const DEFAULT_PRIVACY_SETTINGS = {
  shareDisplayName: true,
  shareEmail: false,
  sharePreferences: true,
  shareCustomFields: false,
  allowToolAccess: true,
  requireExplicitConsent: true,
  auditLogging: true
};

export const AUDIT_LOG_MAX_SIZE = 1000;
export const TOOL_ID_REGEX = /^[a-zA-Z0-9-_]{3,50}$/;
export const DATA_POINT_REGEX = /^[a-zA-Z0-9_]{1,50}$/;
export const TOOL_NAME_MIN_LENGTH = 1;
export const TOOL_NAME_MAX_LENGTH = 100;
export const TOOL_DESCRIPTION_MIN_LENGTH = 10;
export const TOOL_DESCRIPTION_MAX_LENGTH = 500;
