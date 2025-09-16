// Identity Verification Configuration
// Configures identity verification providers and fraud prevention settings

export interface VerificationProviderConfig {
  name: string;
  enabled: boolean;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  webhookUrl?: string;
  supportedDocuments: string[];
  supportedCountries: string[];
  fraudThreshold: number;
  confidenceThreshold: number;
  maxRetries: number;
  timeout: number;
}

export interface VerificationConfig {
  defaultProvider: 'veriff' | 'jumio' | 'onfido' | 'mock';
  providers: {
    veriff: VerificationProviderConfig;
    jumio: VerificationProviderConfig;
    onfido: VerificationProviderConfig;
    mock: VerificationProviderConfig;
  };
  globalSettings: {
    fraudThreshold: number;
    confidenceThreshold: number;
    maxRetries: number;
    timeout: number;
    enableFallback: boolean;
    enableCaching: boolean;
    cacheExpiry: number; // in hours
  };
  security: {
    enableLivenessCheck: boolean;
    enableBiometricMatching: boolean;
    enableDocumentAuthenticity: boolean;
    enableRiskAssessment: boolean;
    requireMultiFactor: boolean;
  };
  compliance: {
    enableGDPR: boolean;
    enableCCPA: boolean;
    enableSOX: boolean;
    dataRetentionDays: number;
    auditLogging: boolean;
  };
}

// Default configuration
export const defaultVerificationConfig: VerificationConfig = {
  defaultProvider: 'veriff', // Use Veriff for production
  
  providers: {
    veriff: {
      name: 'Veriff',
      enabled: true,
      apiKey: process.env.REACT_APP_VERIFF_API_KEY || 'ccc8f523-8157-4453-b75d-84bf97036bb8',
      apiSecret: process.env.REACT_APP_VERIFF_API_SECRET || '3e2b60bf-37e6-4dbb-9866-546018d810fd',
      baseUrl: 'https://stationapi.veriff.com',
      webhookUrl: process.env.REACT_APP_VERIFF_WEBHOOK_URL || 'https://yourdomain.com/api/veriff-webhook',
      supportedDocuments: ['drivers_license', 'passport', 'state_id', 'national_id'],
      supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI'],
      fraudThreshold: 0.3,
      confidenceThreshold: 0.8,
      maxRetries: 3,
      timeout: 30000
    },
    
    jumio: {
      name: 'Jumio',
      enabled: false,
      apiKey: process.env.REACT_APP_JUMIO_API_KEY,
      apiSecret: process.env.REACT_APP_JUMIO_API_SECRET,
      baseUrl: 'https://netverify.com/api/v4',
      webhookUrl: process.env.REACT_APP_JUMIO_WEBHOOK_URL,
      supportedDocuments: ['drivers_license', 'passport', 'state_id', 'national_id'],
      supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'AU', 'NZ'],
      fraudThreshold: 0.25,
      confidenceThreshold: 0.85,
      maxRetries: 3,
      timeout: 30000
    },
    
    onfido: {
      name: 'Onfido',
      enabled: false,
      apiKey: process.env.REACT_APP_ONFIDO_API_KEY,
      apiSecret: process.env.REACT_APP_ONFIDO_API_SECRET,
      baseUrl: 'https://api.onfido.com/v3',
      webhookUrl: process.env.REACT_APP_ONFIDO_WEBHOOK_URL,
      supportedDocuments: ['drivers_license', 'passport', 'state_id', 'national_id'],
      supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'AU', 'NZ', 'BR', 'MX'],
      fraudThreshold: 0.2,
      confidenceThreshold: 0.9,
      maxRetries: 3,
      timeout: 30000
    },
    
    mock: {
      name: 'Mock Provider',
      enabled: true,
      supportedDocuments: ['drivers_license', 'passport', 'state_id', 'national_id'],
      supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI'],
      fraudThreshold: 0.3,
      confidenceThreshold: 0.8,
      maxRetries: 3,
      timeout: 5000
    }
  },
  
  globalSettings: {
    fraudThreshold: 0.3,
    confidenceThreshold: 0.8,
    maxRetries: 3,
    timeout: 30000,
    enableFallback: true,
    enableCaching: true,
    cacheExpiry: 24 // 24 hours
  },
  
  security: {
    enableLivenessCheck: true,
    enableBiometricMatching: true,
    enableDocumentAuthenticity: true,
    enableRiskAssessment: true,
    requireMultiFactor: false
  },
  
  compliance: {
    enableGDPR: true,
    enableCCPA: true,
    enableSOX: false,
    dataRetentionDays: 365,
    auditLogging: true
  }
};

// Environment-specific configurations
export const getVerificationConfig = (): VerificationConfig => {
  const config = { ...defaultVerificationConfig };
  
  // Override with environment variables
  if (process.env.REACT_APP_VERIFICATION_PROVIDER) {
    config.defaultProvider = process.env.REACT_APP_VERIFICATION_PROVIDER as any;
  }
  
  if (process.env.REACT_APP_VERIFICATION_FRAUD_THRESHOLD) {
    config.globalSettings.fraudThreshold = parseFloat(process.env.REACT_APP_VERIFICATION_FRAUD_THRESHOLD);
  }
  
  if (process.env.REACT_APP_VERIFICATION_CONFIDENCE_THRESHOLD) {
    config.globalSettings.confidenceThreshold = parseFloat(process.env.REACT_APP_VERIFICATION_CONFIDENCE_THRESHOLD);
  }
  
  // Enable providers based on environment
  if (process.env.NODE_ENV === 'production') {
    // In production, enable real providers if API keys are available
    if (process.env.REACT_APP_VERIFF_API_KEY && process.env.REACT_APP_VERIFF_API_SECRET) {
      config.providers.veriff.enabled = true;
    }
    if (process.env.REACT_APP_JUMIO_API_KEY && process.env.REACT_APP_JUMIO_API_SECRET) {
      config.providers.jumio.enabled = true;
    }
    if (process.env.REACT_APP_ONFIDO_API_KEY && process.env.REACT_APP_ONFIDO_API_SECRET) {
      config.providers.onfido.enabled = true;
    }
    
    // Disable mock provider in production
    config.providers.mock.enabled = false;
  }
  
  return config;
};

// Validation functions
export const validateVerificationConfig = (config: VerificationConfig): string[] => {
  const errors: string[] = [];
  
  // Check if at least one provider is enabled
  const enabledProviders = Object.values(config.providers).filter(p => p.enabled);
  if (enabledProviders.length === 0) {
    errors.push('At least one verification provider must be enabled');
  }
  
  // Check if default provider is enabled
  if (!config.providers[config.defaultProvider]?.enabled) {
    errors.push(`Default provider '${config.defaultProvider}' is not enabled`);
  }
  
  // Validate thresholds
  if (config.globalSettings.fraudThreshold < 0 || config.globalSettings.fraudThreshold > 1) {
    errors.push('Fraud threshold must be between 0 and 1');
  }
  
  if (config.globalSettings.confidenceThreshold < 0 || config.globalSettings.confidenceThreshold > 1) {
    errors.push('Confidence threshold must be between 0 and 1');
  }
  
  // Validate provider configurations
  Object.entries(config.providers).forEach(([name, provider]) => {
    if (provider.enabled) {
      if (provider.fraudThreshold < 0 || provider.fraudThreshold > 1) {
        errors.push(`Provider '${name}' fraud threshold must be between 0 and 1`);
      }
      
      if (provider.confidenceThreshold < 0 || provider.confidenceThreshold > 1) {
        errors.push(`Provider '${name}' confidence threshold must be between 0 and 1`);
      }
      
      if (provider.maxRetries < 0 || provider.maxRetries > 10) {
        errors.push(`Provider '${name}' max retries must be between 0 and 10`);
      }
      
      if (provider.timeout < 1000 || provider.timeout > 300000) {
        errors.push(`Provider '${name}' timeout must be between 1000 and 300000 milliseconds`);
      }
    }
  });
  
  return errors;
};

// Helper functions
export const getEnabledProviders = (config: VerificationConfig): VerificationProviderConfig[] => {
  return Object.values(config.providers).filter(p => p.enabled);
};

export const getProviderConfig = (config: VerificationConfig, providerName: string): VerificationProviderConfig | null => {
  return config.providers[providerName as keyof typeof config.providers] || null;
};

export const isProviderEnabled = (config: VerificationConfig, providerName: string): boolean => {
  const provider = getProviderConfig(config, providerName);
  return provider?.enabled || false;
};
