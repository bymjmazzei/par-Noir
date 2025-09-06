// Validation Types and Interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedValue?: string;
}

export interface ValidationRule {
  name: string;
  validator: (value: any) => boolean;
  errorMessage: string;
  warningMessage?: string;
}
