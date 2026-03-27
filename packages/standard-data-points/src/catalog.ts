import type { StandardDataPoint, StandardDataPointPublic, ZKPType } from './types';

/**
 * Source rows: validation.pattern is a regex source string when present.
 * Compiled to RegExp in buildStandardDataPoints().
 */
const CATALOG_ROWS: Array<
  Omit<StandardDataPoint, 'validation'> & {
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
  },
  {
    id: 'document_verification',
    name: 'Document Verification',
    description: 'Government ID document metadata for verification flows',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['documentType', 'documentNumber'],
    optionalFields: ['issuingAuthority', 'expirationDate'],
    defaultPrivacy: 'private',
    examples: ['KYC', 'Compliance', 'Document-bound attestations']
  }
];

function compileRow(
  row: (typeof CATALOG_ROWS)[number]
): StandardDataPoint {
  const { validation, ...rest } = row;
  let v: StandardDataPoint['validation'];
  if (validation) {
    const { pattern: patternSrc, ...restVal } = validation;
    v = {
      ...restVal,
      ...(patternSrc ? { pattern: new RegExp(patternSrc), patternSource: patternSrc } : {})
    };
  }
  return { ...rest, zkpType: rest.zkpType as ZKPType, validation: v };
}

/** Runtime registry (RegExp in validation.pattern where applicable) */
export const STANDARD_DATA_POINTS: Record<string, StandardDataPoint> = Object.fromEntries(
  CATALOG_ROWS.map((r) => [r.id, compileRow(r)])
);

export const DATA_POINT_CATEGORIES = {
  verification: 'Core Identity Verification',
  location: 'Location & Geography'
} as const;

export function getAvailableDataPoints(): StandardDataPoint[] {
  return Object.values(STANDARD_DATA_POINTS);
}

export function getDataPointsByCategory(category: string): StandardDataPoint[] {
  return Object.values(STANDARD_DATA_POINTS).filter((dp) => dp.category === category);
}

export function getDataPoint(id: string): StandardDataPoint | undefined {
  return STANDARD_DATA_POINTS[id];
}

/** JSON-serializable catalog for HTTP APIs */
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
