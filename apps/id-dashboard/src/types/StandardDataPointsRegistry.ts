import { StandardDataPoint } from './DataPointTypes';

// Standard Data Points Registry
// Focused on essential, universal identity attributes
export const STANDARD_DATA_POINTS: Record<string, StandardDataPoint> = {
  // ===== CORE IDENTITY VERIFICATION =====
  'age_attestation': {
    id: 'age_attestation',
    name: 'Age Attestation',
    description: 'Attest to your age for age-restricted services',
    category: 'verification',
    dataType: 'date',
    zkpType: 'age_verification',
    validation: { required: true },
    requiredFields: ['dateOfBirth'],
    defaultPrivacy: 'selective',
    examples: ['Age-restricted content', 'Age verification services', 'Compliance requirements']
  },

  'email_verification': {
    id: 'email_verification',
    name: 'Email Verification',
    description: 'Verify user has access to an email address',
    category: 'verification',
    dataType: 'string',
    zkpType: 'email_verification',
    validation: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: true },
    requiredFields: ['email'],
    defaultPrivacy: 'selective',
    examples: ['Account recovery', 'Communication verification', 'Account creation']
  },

  'phone_verification': {
    id: 'phone_verification',
    name: 'Phone Verification',
    description: 'Verify user has access to a phone number',
    category: 'verification',
    dataType: 'string',
    zkpType: 'phone_verification',
    validation: { pattern: /^\+?[\d\s\-\(\)]+$/, required: true },
    requiredFields: ['phone'],
    defaultPrivacy: 'private',
    examples: ['Two-factor authentication', 'Account recovery', 'Emergency contact']
  },

  'identity_attestation': {
    id: 'identity_attestation',
    name: 'Identity Attestation',
    description: 'Attest to your legal name for identity verification',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_attestation',
    validation: { required: true },
    requiredFields: ['firstName', 'middleName', 'lastName'],
    optionalFields: [],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name verification', 'Compliance requirements']
  },

  // ===== LOCATION & GEOGRAPHY =====
  'location_verification': {
    id: 'location_verification',
    name: 'Location Verification',
    description: 'Verify user is in a specific location or region',
    category: 'location',
    dataType: 'object',
    zkpType: 'location_verification',
    validation: { required: true },
    requiredFields: ['country', 'region'],
    optionalFields: ['city', 'postalCode', 'coordinates'],
    defaultPrivacy: 'private',
    examples: ['Geographic verification', 'Regional compliance', 'Location-based services']
  }
};

// Data Point Categories
export const DATA_POINT_CATEGORIES = {
  verification: 'Core Identity Verification',
  location: 'Location & Geography'
} as const;

// Helper functions for accessing data points
export const getAvailableDataPoints = (): StandardDataPoint[] => {
  return Object.values(STANDARD_DATA_POINTS);
};

export const getDataPointsByCategory = (category: string): StandardDataPoint[] => {
  return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.category === category);
};

export const getDataPoint = (id: string): StandardDataPoint | undefined => {
  return STANDARD_DATA_POINTS[id];
};
