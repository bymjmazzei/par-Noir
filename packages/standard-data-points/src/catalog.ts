import type { StandardDataPoint, StandardDataPointPublic, ZKPType, DataPointUiClass } from './types';

/**
 * Source rows: validation.pattern is a regex source string when present.
 * Compiled to RegExp in buildStandardDataPoints().
 */
const CATALOG_ROWS: Array<
  Omit<StandardDataPoint, 'validation' | 'zkpType'> & {
    zkpType: ZKPType;
    validation?: { pattern?: string; required?: boolean; minValue?: number; maxValue?: number };
  }
> = [
  // —— Name bundle (form) + derived ——
  {
    id: 'name_attestation',
    name: 'Legal name',
    description: 'Enter your legal name once; shareable name proofs are derived from it',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_attestation',
    validation: { required: true },
    requiredFields: ['firstName', 'lastName'],
    optionalFields: ['prefix', 'middleName', 'suffix', 'nickname'],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name disclosure'],
    uiClass: 'name',
    veriffCapable: true
  },
  {
    id: 'full_name',
    name: 'Full name',
    description: 'Prefix, first, middle, last, and suffix',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['fullName'],
    defaultPrivacy: 'private',
    examples: ['Legal name disclosure'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
  },
  {
    id: 'first_last',
    name: 'First and last name',
    description: 'First name and last name',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['firstLast'],
    defaultPrivacy: 'private',
    examples: ['Name disclosure'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
  },
  {
    id: 'first_last_initial',
    name: 'First name and last initial',
    description: 'First name plus last-name initial',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['firstLastInitial'],
    defaultPrivacy: 'selective',
    examples: ['Partial name disclosure'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
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
    examples: ['Identity verification', 'Name verification'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
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
    examples: ['Identity verification', 'Name verification'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
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
    examples: ['Identity verification', 'Name verification'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
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
    examples: ['Identity verification', 'Name verification'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
  },
  {
    id: 'nickname',
    name: 'Nickname',
    description: 'Preferred nickname or display name',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: false },
    optionalFields: ['nickname'],
    defaultPrivacy: 'selective',
    examples: ['Display name'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: false
  },
  {
    id: 'identity_attestation',
    name: 'Identity Attestation',
    description: 'Legacy composite legal-name attestation (prefer name_attestation form)',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_attestation',
    validation: { required: true },
    requiredFields: ['firstName', 'middleName', 'lastName'],
    optionalFields: [],
    defaultPrivacy: 'private',
    examples: ['Identity verification', 'Name verification', 'Compliance requirements'],
    uiClass: 'name',
    derived: true,
    derivedFrom: 'name_attestation',
    veriffCapable: true
  },

  // —— Age bundle ——
  {
    id: 'age_attestation',
    name: 'Age',
    description: 'Attest date of birth; age and threshold proofs are derived',
    category: 'verification',
    dataType: 'date',
    zkpType: 'age_verification',
    validation: { required: true },
    requiredFields: ['dateOfBirth'],
    defaultPrivacy: 'selective',
    examples: ['Age-restricted content', 'Age verification services', 'Compliance requirements'],
    uiClass: 'age',
    veriffCapable: true
  },
  {
    id: 'over_18',
    name: 'Over 18',
    description: 'Proof that you are 18 or older without revealing date of birth',
    category: 'verification',
    dataType: 'boolean',
    zkpType: 'threshold_age',
    validation: { required: true },
    requiredFields: ['over18'],
    defaultPrivacy: 'selective',
    examples: ['Age-gated content', 'NSFW access'],
    uiClass: 'age',
    derived: true,
    derivedFrom: 'age_attestation',
    veriffCapable: true
  },
  {
    id: 'over_21',
    name: 'Over 21',
    description: 'Proof that you are 21 or older without revealing date of birth',
    category: 'verification',
    dataType: 'boolean',
    zkpType: 'threshold_age',
    validation: { required: true },
    requiredFields: ['over21'],
    defaultPrivacy: 'selective',
    examples: ['Alcohol age gate', 'Compliance'],
    uiClass: 'age',
    derived: true,
    derivedFrom: 'age_attestation',
    veriffCapable: true
  },

  // —— Contact ——
  {
    id: 'email_verification',
    name: 'Email',
    description: 'Verify access to an email address (Twilio Verify / email OTP)',
    category: 'verification',
    dataType: 'string',
    zkpType: 'email_verification',
    validation: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', required: true },
    requiredFields: ['email'],
    defaultPrivacy: 'selective',
    examples: ['Account recovery', 'Communication verification', 'Account creation'],
    uiClass: 'contact',
    veriffCapable: false
  },
  {
    id: 'phone_verification',
    name: 'Phone',
    description: 'Verify access to a phone number (Twilio SMS Verify)',
    category: 'verification',
    dataType: 'string',
    zkpType: 'phone_verification',
    validation: { pattern: '^\\+?[\\d\\s\\-\\(\\)]+$', required: true },
    requiredFields: ['phone'],
    defaultPrivacy: 'private',
    examples: ['Two-factor authentication', 'Account recovery', 'Emergency contact'],
    uiClass: 'contact',
    veriffCapable: false
  },

  // —— Location ——
  {
    id: 'location_verification',
    name: 'Location',
    description: 'Country, region, and optional city / postal code',
    category: 'location',
    dataType: 'object',
    zkpType: 'location_verification',
    validation: { required: true },
    requiredFields: ['country', 'region'],
    optionalFields: ['city', 'postalCode', 'coordinates'],
    defaultPrivacy: 'private',
    examples: ['Geographic verification', 'Regional compliance', 'Location-based services'],
    uiClass: 'location',
    veriffCapable: false
  },

  // —— Documents ——
  {
    id: 'document_type',
    name: 'Document type',
    description: 'Government ID type (passport, license, etc.)',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['documentType'],
    defaultPrivacy: 'private',
    examples: ['KYC'],
    uiClass: 'documents',
    veriffCapable: true
  },
  {
    id: 'document_number',
    name: 'Document number',
    description: 'Government ID document number',
    category: 'verification',
    dataType: 'string',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['documentNumber'],
    defaultPrivacy: 'private',
    examples: ['KYC'],
    uiClass: 'documents',
    veriffCapable: true
  },
  {
    id: 'document_front',
    name: 'ID front',
    description: 'Encrypted image of ID front (stored in private zkp-docs)',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['fileId'],
    defaultPrivacy: 'private',
    examples: ['KYC document image'],
    uiClass: 'documents',
    veriffCapable: true,
    documentImage: true
  },
  {
    id: 'document_back',
    name: 'ID back',
    description: 'Encrypted image of ID back (stored in private zkp-docs)',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_verification',
    validation: { required: false },
    optionalFields: ['fileId'],
    defaultPrivacy: 'private',
    examples: ['KYC document image'],
    uiClass: 'documents',
    veriffCapable: true,
    documentImage: true
  },
  {
    id: 'document_selfie',
    name: 'Selfie',
    description: 'Encrypted selfie for liveness (stored in private zkp-docs)',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_verification',
    validation: { required: false },
    optionalFields: ['fileId'],
    defaultPrivacy: 'private',
    examples: ['Liveness'],
    uiClass: 'documents',
    veriffCapable: true,
    documentImage: true
  },
  {
    id: 'document_verification',
    name: 'Document Verification',
    description: 'Legacy composite document metadata (prefer document_type / document_number)',
    category: 'verification',
    dataType: 'object',
    zkpType: 'identity_verification',
    validation: { required: true },
    requiredFields: ['documentType', 'documentNumber'],
    optionalFields: ['issuingAuthority', 'expirationDate'],
    defaultPrivacy: 'private',
    examples: ['KYC', 'Compliance', 'Document-bound attestations'],
    uiClass: 'documents',
    derived: true,
    derivedFrom: 'document_type',
    veriffCapable: true
  },

  // —— System (not shown in classed Add/Edit lists) ——
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
  }
];

function compileRow(row: (typeof CATALOG_ROWS)[number]): StandardDataPoint {
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

export const DATA_POINT_UI_CLASSES: Record<
  DataPointUiClass,
  { label: string; description: string; formId?: string }
> = {
  name: {
    label: 'Name',
    description: 'Legal name and derived shareable name proofs',
    formId: 'name_attestation'
  },
  age: {
    label: 'Age',
    description: 'Date of birth and age-threshold proofs',
    formId: 'age_attestation'
  },
  location: {
    label: 'Location',
    description: 'Country and region',
    formId: 'location_verification'
  },
  contact: {
    label: 'Contact',
    description: 'Email and phone (Twilio Verify)',
  },
  documents: {
    label: 'Documents',
    description: 'Government ID metadata and encrypted images'
  }
};

/** Derived proof ids minted from name_attestation form */
export const NAME_DERIVED_IDS = [
  'full_name',
  'first_last',
  'first_last_initial',
  'first_name',
  'middle_name',
  'last_name',
  'suffix',
  'nickname',
  'identity_attestation'
] as const;

/** Derived proof ids minted from age_attestation / DOB form */
export const AGE_DERIVED_IDS = ['age_attestation', 'over_18', 'over_21'] as const;

export const VERIFF_CAPABLE_IDS = Object.values(STANDARD_DATA_POINTS)
  .filter((dp) => dp.veriffCapable)
  .map((dp) => dp.id);

export function getAvailableDataPoints(): StandardDataPoint[] {
  return Object.values(STANDARD_DATA_POINTS);
}

export function getDataPointsByCategory(category: string): StandardDataPoint[] {
  return Object.values(STANDARD_DATA_POINTS).filter((dp) => dp.category === category);
}

export function getDataPointsByUiClass(uiClass: DataPointUiClass): StandardDataPoint[] {
  return Object.values(STANDARD_DATA_POINTS).filter((dp) => dp.uiClass === uiClass);
}

/** Rows shown as Add/Edit in Privacy UI (forms + contact/doc fields; not pure derived-only rows) */
export function getPrivacyUiPrimaryRows(uiClass: DataPointUiClass): StandardDataPoint[] {
  if (uiClass === 'name') {
    return [STANDARD_DATA_POINTS.name_attestation].filter(Boolean);
  }
  if (uiClass === 'age') {
    return [STANDARD_DATA_POINTS.age_attestation].filter(Boolean);
  }
  if (uiClass === 'location') {
    return [STANDARD_DATA_POINTS.location_verification].filter(Boolean);
  }
  if (uiClass === 'contact') {
    return [STANDARD_DATA_POINTS.email_verification, STANDARD_DATA_POINTS.phone_verification];
  }
  if (uiClass === 'documents') {
    return [
      STANDARD_DATA_POINTS.document_type,
      STANDARD_DATA_POINTS.document_number,
      STANDARD_DATA_POINTS.document_front,
      STANDARD_DATA_POINTS.document_back,
      STANDARD_DATA_POINTS.document_selfie
    ];
  }
  return [];
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
