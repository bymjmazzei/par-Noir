/** ZKP proof kinds referenced by standard data points */
export type ZKPType =
  | 'age_verification'
  | 'email_verification'
  | 'phone_verification'
  | 'location_verification'
  | 'identity_verification'
  | 'identity_attestation'
  | 'preference_disclosure'
  | 'compliance_attestation'
  | 'custom_proof';

export interface DataValidation {
  minValue?: number;
  maxValue?: number;
  /** Present in runtime objects compiled for the dashboard (not in public JSON). */
  pattern?: RegExp;
  /** Original regex source when pattern was compiled from catalog strings. */
  patternSource?: string;
  required?: boolean;
}

/** Runtime shape used by the dashboard and ZKP helpers */
export interface StandardDataPoint {
  id: string;
  name: string;
  description: string;
  category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
  zkpType: ZKPType;
  validation?: DataValidation;
  requiredFields?: string[];
  optionalFields?: string[];
  defaultPrivacy: 'public' | 'private' | 'selective';
  examples: string[];
}

/** JSON-safe catalog entry (API + developer portal) */
export interface StandardDataPointPublic {
  id: string;
  name: string;
  description: string;
  category: StandardDataPoint['category'];
  dataType: StandardDataPoint['dataType'];
  zkpType: ZKPType;
  validation?: {
    minValue?: number;
    maxValue?: number;
    pattern?: string;
    required?: boolean;
  };
  requiredFields?: string[];
  optionalFields?: string[];
  defaultPrivacy: StandardDataPoint['defaultPrivacy'];
  examples: string[];
}
