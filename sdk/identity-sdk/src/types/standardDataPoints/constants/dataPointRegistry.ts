import { StandardDataPoint } from '../types/standardDataPoints';

// Standard Data Points Registry
export const STANDARD_DATA_POINTS: Record<string, StandardDataPoint> = {
  // Core Identity Verification
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
    description: 'Verify your email address for account creation',
    category: 'verification',
    dataType: 'string',
    zkpType: 'email_verification',
    validation: { 
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    requiredFields: ['email'],
    defaultPrivacy: 'private',
    examples: ['Account creation', 'Password reset', 'Two-factor authentication']
  },

  'phone_verification': {
    id: 'phone_verification',
    name: 'Phone Verification',
    description: 'Verify your phone number for SMS-based services',
    category: 'verification',
    dataType: 'string',
    zkpType: 'phone_verification',
    validation: { 
      required: true,
      pattern: /^\+?[1-9]\d{1,14}$/
    },
    requiredFields: ['phoneNumber'],
    defaultPrivacy: 'private',
    examples: ['SMS verification', 'Emergency contacts', 'Two-factor authentication']
  },

  'location_verification': {
    id: 'location_verification',
    name: 'Location Verification',
    description: 'Verify your location for location-based services',
    category: 'location',
    dataType: 'object',
    zkpType: 'location_verification',
    validation: { required: true },
    requiredFields: ['country', 'region'],
    optionalFields: ['city', 'postalCode'],
    defaultPrivacy: 'selective',
    examples: ['Regional content', 'Tax compliance', 'Service availability']
  },

  'identity_verification': {
    id: 'identity_verification',
    name: 'Identity Verification',
    description: 'Verify your identity using government-issued documents',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['documentType', 'documentNumber'],
    defaultPrivacy: 'private',
    examples: ['KYC compliance', 'Financial services', 'Government services']
  },

  // Preference Management
  'user_preferences': {
    id: 'user_preferences',
    name: 'User Preferences',
    description: 'Manage your application preferences and settings',
    category: 'preferences',
    dataType: 'object',
    zkpType: 'preference_disclosure',
    validation: { required: false },
    defaultPrivacy: 'public',
    examples: ['Theme settings', 'Language preferences', 'Notification settings']
  },

  'accessibility_preferences': {
    id: 'accessibility_preferences',
    name: 'Accessibility Preferences',
    description: 'Configure accessibility features and accommodations',
    category: 'preferences',
    dataType: 'object',
    zkpType: 'preference_disclosure',
    validation: { required: false },
    defaultPrivacy: 'selective',
    examples: ['Screen reader support', 'High contrast mode', 'Font size preferences']
  },

  // Compliance and Attestation
  'gdpr_consent': {
    id: 'gdpr_consent',
    name: 'GDPR Consent',
    description: 'Manage your data processing consent preferences',
    category: 'compliance',
    dataType: 'object',
    zkpType: 'compliance_attestation',
    validation: { required: true },
    requiredFields: ['consentGiven', 'consentDate'],
    defaultPrivacy: 'private',
    examples: ['Data processing consent', 'Marketing preferences', 'Third-party sharing']
  },

  'age_verification': {
    id: 'age_verification',
    name: 'Age Verification',
    description: 'Verify your age for age-restricted content or services',
    category: 'verification',
    dataType: 'number',
    zkpType: 'age_verification',
    validation: { 
      required: true,
      minValue: 13,
      maxValue: 120
    },
    requiredFields: ['age'],
    defaultPrivacy: 'selective',
    examples: ['Age-restricted content', 'Age verification services', 'Compliance requirements']
  },

  'location_attestation': {
    id: 'location_attestation',
    name: 'Location Attestation',
    description: 'Attest to your current or preferred location',
    category: 'location',
    dataType: 'object',
    zkpType: 'location_verification',
    validation: { required: true },
    requiredFields: ['country'],
    optionalFields: ['region', 'city'],
    defaultPrivacy: 'selective',
    examples: ['Regional services', 'Tax compliance', 'Content localization']
  }
};
