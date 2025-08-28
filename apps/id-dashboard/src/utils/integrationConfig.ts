// Integration Configuration Manager
// This manages API keys and makes them available throughout the application

export interface IntegrationConfig {
  [integrationKey: string]: {
    [apiKey: string]: string;
  };
}

export class IntegrationConfigManager {
  private static readonly STORAGE_KEY = 'par_noir_integration_config';
  private static config: IntegrationConfig = {};
  private static listeners: Array<() => void> = [];

  /**
   * Initialize the configuration manager
   */
  static initialize(): void {
    this.loadFromStorage();
    this.setupEnvironmentVariables();
  }

  /**
   * Load configuration from localStorage
   */
  private static loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.config = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load integration config:', error);
      this.config = {};
    }
  }

  /**
   * Save configuration to localStorage
   */
  private static saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save integration config:', error);
    }
  }

  /**
   * Setup environment variables from stored config
   */
  private static setupEnvironmentVariables(): void {
    Object.entries(this.config).forEach(([integrationKey, apiKeys]) => {
      Object.entries(apiKeys).forEach(([key, value]) => {
        if (typeof window !== 'undefined') {
          (window as any)[`REACT_APP_${key}`] = value;
        }
        // Also set process.env for server-side compatibility
        if (typeof process !== 'undefined' && process.env) {
          (process.env as any)[`REACT_APP_${key}`] = value;
        }
      });
    });
  }

  /**
   * Get a specific API key value
   */
  static getApiKey(integrationKey: string, apiKeyName: string): string {
    return this.config[integrationKey]?.[apiKeyName] || '';
  }

  /**
   * Set a specific API key value
   */
  static setApiKey(integrationKey: string, apiKeyName: string, value: string): void {
    if (!this.config[integrationKey]) {
      this.config[integrationKey] = {};
    }
    this.config[integrationKey][apiKeyName] = value;
    
    // Update environment variables
    if (typeof window !== 'undefined') {
      (window as any)[`REACT_APP_${apiKeyName}`] = value;
    }
    if (typeof process !== 'undefined' && process.env) {
      (process.env as any)[`REACT_APP_${apiKeyName}`] = value;
    }
    
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Get all configuration
   */
  static getAllConfig(): IntegrationConfig {
    return { ...this.config };
  }

  /**
   * Set entire configuration
   */
  static setAllConfig(config: IntegrationConfig): void {
    this.config = { ...config };
    this.saveToStorage();
    this.setupEnvironmentVariables();
    this.notifyListeners();
  }

  /**
   * Clear all configuration
   */
  static clearAllConfig(): void {
    this.config = {};
    this.saveToStorage();
    this.setupEnvironmentVariables();
    this.notifyListeners();
  }

  /**
   * Get configuration for a specific integration
   */
  static getIntegrationConfig(integrationKey: string): { [key: string]: string } {
    return { ...this.config[integrationKey] } || {};
  }

  /**
   * Set configuration for a specific integration
   */
  static setIntegrationConfig(integrationKey: string, apiKeys: { [key: string]: string }): void {
    this.config[integrationKey] = { ...apiKeys };
    this.saveToStorage();
    this.setupEnvironmentVariables();
    this.notifyListeners();
  }

  /**
   * Check if an integration is configured
   */
  static isIntegrationConfigured(integrationKey: string, requiredKeys: string[]): boolean {
    const integrationConfig = this.config[integrationKey];
    if (!integrationConfig) return false;
    
    return requiredKeys.every(key => {
      const value = integrationConfig[key];
      return value && value.trim() !== '';
    });
  }

  /**
   * Get environment variable (with fallback to stored config)
   */
  static getEnvVar(key: string): string {
    // First try process.env (for server-side)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
    
    // Then try window (for client-side)
    if (typeof window !== 'undefined' && (window as any)[key]) {
      return (window as any)[key];
    }
    
    // Finally try stored config
    const configKey = key.replace('REACT_APP_', '');
    for (const integrationKey in this.config) {
      if (this.config[integrationKey][configKey]) {
        return this.config[integrationKey][configKey];
      }
    }
    
    return '';
  }

  /**
   * Subscribe to configuration changes
   */
  static subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of configuration changes
   */
  private static notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Export configuration for backup
   */
  static exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from backup
   */
  static importConfig(configString: string): boolean {
    try {
      const config = JSON.parse(configString);
      this.setAllConfig(config);
      return true;
    } catch (error) {
      console.error('Failed to import configuration:', error);
      return false;
    }
  }

  /**
   * Validate configuration
   */
  static validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required integrations
    const requiredIntegrations = {
      ipfs: ['IPFS_PROJECT_ID', 'IPFS_PROJECT_SECRET'],
      sendgrid: ['SENDGRID_API_KEY', 'FROM_EMAIL'],
      twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
      coinbase: ['COINBASE_COMMERCE_API_KEY']
    };

    Object.entries(requiredIntegrations).forEach(([integrationKey, requiredKeys]) => {
      if (!this.isIntegrationConfigured(integrationKey, requiredKeys)) {
        errors.push(`${integrationKey}: Missing required API keys`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Initialize the config manager when this module is loaded
if (typeof window !== 'undefined') {
  IntegrationConfigManager.initialize();
}
