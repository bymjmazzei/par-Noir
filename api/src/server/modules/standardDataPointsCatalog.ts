/**
 * Public standard data points catalog for GET /api/v1/standard-data-points.
 *
 * Keep in sync with packages/standard-data-points/src/catalog.ts (single source of truth in the monorepo).
 * Inlined here so the API build does not depend on the workspace package’s dist/ or npm lifecycle scripts on Railway.
 */

type ZKPType =
  | 'age_verification'
  | 'email_verification'
  | 'phone_verification'
  | 'location_verification'
  | 'identity_verification'
  | 'identity_attestation'
  | 'preference_disclosure'
  | 'compliance_attestation'
  | 'custom_proof';

export interface StandardDataPointPublic {
  id: string;
  name: string;
  description: string;
  category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
  zkpType: ZKPType;
  validation?: {
    minValue?: number;
    maxValue?: number;
    pattern?: string;
    required?: boolean;
  };
  requiredFields?: string[];
  optionalFields?: string[];
  defaultPrivacy: 'public' | 'private' | 'selective';
  examples: string[];
}

const CATALOG_ROWS: Array<
  Omit<StandardDataPointPublic, 'validation'> & {
    validation?: { pattern?: string; required?: boolean; minValue?: number; maxValue?: number };
  }
> = [
  {
    id: 'age_attestation',
    name: 'Age',
    description: 'Attest to your age for age-restricted services',
    category: 'verification',
    dataType: 'date',
    zkpType: 'age_verification',
    validation: { required: true },
    requiredFields: ['dateOfBirth'],
    defaultPrivacy: 'selective',
    examples: ['Age-restricted content', 'Age verification services', 'Compliance requirements']
  },
  {
    id: 'email_verification',
    name: 'Email Verification',
    description: 'Verify user has access to an email address',
    category: 'verification',
    dataType: 'string',
    zkpType: 'email_verification',
    validation: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', required: true },
    requiredFields: ['email'],
    defaultPrivacy: 'selective',
    examples: ['Account recovery', 'Communication verification', 'Account creation']
  },
  {
    id: 'phone_verification',
    name: 'Phone Verification',
    description: 'Verify user has access to a phone number',
    category: 'verification',
    dataType: 'string',
    zkpType: 'phone_verification',
    validation: { pattern: '^\\+?[\\d\\s\\-\\(\\)]+$', required: true },
    requiredFields: ['phone'],
    defaultPrivacy: 'private',
    examples: ['Two-factor authentication', 'Account recovery', 'Emergency contact']
  },
  {
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
  {
    id: 'pn_identifier',
    name: 'pN Identifier',
    description: 'Your unique par Noir identifier',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['pnIdentifier'],
    defaultPrivacy: 'public',
    examples: ['Identity verification', 'Account identification']
  },
  {
    id: 'first_name',
    name: 'First Name',
    description: 'Your first name',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['firstName'],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name verification']
  },
  {
    id: 'middle_name',
    name: 'Middle Name',
    description: 'Your middle name',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: false },
    requiredFields: [],
    optionalFields: ['middleName'],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name verification']
  },
  {
    id: 'last_name',
    name: 'Last Name',
    description: 'Your last name',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['lastName'],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name verification']
  },
  {
    id: 'suffix',
    name: 'Suffix',
    description: 'Name suffix (e.g., Jr., Sr., III)',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: false },
    requiredFields: [],
    optionalFields: ['suffix'],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name verification']
  },
  {
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
];

export const DATA_POINT_CATEGORIES = {
  verification: 'Core Identity Verification',
  location: 'Location & Geography'
} as const;

export function getStandardDataPointsPublic(): StandardDataPointPublic[] {
  return CATALOG_ROWS.map((row) => {
    const { validation, ...rest } = row;
    const pub: StandardDataPointPublic = {
      ...rest,
      zkpType: rest.zkpType as ZKPType,
      validation: validation
        ? {
            required: validation.required,
            minValue: validation.minValue,
            maxValue: validation.maxValue,
            ...(validation.pattern ? { pattern: validation.pattern } : {})
          }
        : undefined
    };
    return pub;
  });
}
