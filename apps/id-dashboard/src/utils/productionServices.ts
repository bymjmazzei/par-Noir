// Production Services Integration
// This file manages all production services and provides a unified interface

import { orbitDBService } from './orbitDBService';
import { emailService } from './emailService';
import { smsService } from './smsService';
import { ipfsService } from './ipfsService';
import { qrScannerService } from './qrScannerService';

export interface ProductionServicesConfig {
  orbitDB: {
    enabled: boolean;
    ipfsUrl: string;
    projectId: string;
  };
  email: {
    enabled: boolean;
    apiKey: string;
    fromEmail: string;
  };
  sms: {
    enabled: boolean;
    accountSid: string;
    authToken: string;
  };
  ipfs: {
    enabled: boolean;
    apiKey: string;
    gatewayUrl: string;
  };
  qrScanner: {
    enabled: boolean;
    enableCamera: boolean;
    enableFileUpload: boolean;
  };
}

export interface ServiceStatus {
  service: string;
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: string;
  error?: string;
}

export interface ServiceResult {
  service: string;
  success: boolean;
  error?: string;
}

export interface InitializationResult {
  success: boolean;
  services: ServiceResult[];
  successCount: number;
  totalCount: number;
}

export class ProductionServicesManager {
  private static instance: ProductionServicesManager;
  private config: ProductionServicesConfig;
  private serviceStatus: Map<string, ServiceStatus> = new Map();

  constructor(config: ProductionServicesConfig) {
    this.config = config;
  }

  static getInstance(): ProductionServicesManager {
    if (!ProductionServicesManager.instance) {
      // Default configuration from environment variables
      const config: ProductionServicesConfig = {
        orbitDB: {
          enabled: !!process.env.REACT_APP_IPFS_PROJECT_ID,
          ipfsUrl: process.env.REACT_APP_IPFS_URL || '',
          projectId: process.env.REACT_APP_IPFS_PROJECT_ID || ''
        },
        email: {
          enabled: !!process.env.REACT_APP_SENDGRID_API_KEY,
          apiKey: process.env.REACT_APP_SENDGRID_API_KEY || '',
          fromEmail: process.env.REACT_APP_FROM_EMAIL || ''
        },
        sms: {
          enabled: !!process.env.REACT_APP_TWILIO_ACCOUNT_SID,
          accountSid: process.env.REACT_APP_TWILIO_ACCOUNT_SID || '',
          authToken: process.env.REACT_APP_TWILIO_AUTH_TOKEN || ''
        },
        ipfs: {
          enabled: !!process.env.REACT_APP_IPFS_API_KEY,
          apiKey: process.env.REACT_APP_IPFS_API_KEY || '',
          gatewayUrl: process.env.REACT_APP_IPFS_GATEWAY_URL || ''
        },
        qrScanner: {
          enabled: true,
          enableCamera: true,
          enableFileUpload: true
        }
      };
      
      ProductionServicesManager.instance = new ProductionServicesManager(config);
    }
    return ProductionServicesManager.instance;
  }

  static async initialize(): Promise<InitializationResult> {
    const results: ServiceResult[] = [];
    
    try {
      // Initialize OrbitDB
      const orbitDBResult = await this.initializeOrbitDB();
      results.push(orbitDBResult);
      
      // Initialize Email Service
      const emailResult = await this.initializeEmailService();
      results.push(emailResult);
      
      // Initialize SMS Service
      const smsResult = await this.initializeSMSService();
      results.push(smsResult);
      
      // Initialize IPFS Service
      const ipfsResult = await this.initializeIPFSService();
      results.push(ipfsResult);
      
      // Initialize QR Scanner Service
      const qrResult = await this.initializeQRScannerService();
      results.push(qrResult);
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      return {
        success: successCount === totalCount,
        services: results,
        successCount,
        totalCount
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      return {
        success: false,
        services: results,
        successCount: 0,
        totalCount: results.length
      };
    }
  }

  private static async initializeOrbitDB(): Promise<ServiceResult> {
    try {
      const result = await orbitDBService.healthCheck();
      return {
        service: 'orbitDB',
        success: result.success,
        error: result.success ? undefined : result.error
      };
    } catch (error) {
      return {
        service: 'orbitDB',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async initializeEmailService(): Promise<ServiceResult> {
    try {
      await emailService.initialize();
      return {
        service: 'email',
        success: true
      };
    } catch (error) {
      return {
        service: 'email',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async initializeSMSService(): Promise<ServiceResult> {
    try {
      await smsService.initialize();
      return {
        service: 'sms',
        success: true
      };
    } catch (error) {
      return {
        service: 'sms',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async initializeIPFSService(): Promise<ServiceResult> {
    try {
      const config = {
        apiKey: process.env.REACT_APP_PINATA_API_KEY || '',
        secretKey: process.env.REACT_APP_PINATA_SECRET_KEY || '',
        gatewayUrl: process.env.REACT_APP_IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud'
      };

      if (!config.apiKey || !config.secretKey) {
        return {
          service: 'ipfs',
          success: false,
          error: 'IPFS configuration missing'
        };
      }

      await ipfsService.initialize(config);
      return {
        service: 'ipfs',
        success: true
      };
    } catch (error) {
      return {
        service: 'ipfs',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async initializeQRScannerService(): Promise<ServiceResult> {
    try {
      await qrScannerService.initialize();
      return {
        service: 'qrScanner',
        success: true
      };
    } catch (error) {
      return {
        service: 'qrScanner',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }





  getServiceStatus(): ServiceStatus[] {
    return Array.from(this.serviceStatus.values());
  }

  isServiceEnabled(service: string): boolean {
    switch (service) {
      case 'orbitDB':
        return this.config.orbitDB.enabled;
      case 'email':
        return this.config.email.enabled;
      case 'sms':
        return this.config.sms.enabled;
      case 'ipfs':
        return this.config.ipfs.enabled;
      case 'qrScanner':
        return this.config.qrScanner.enabled;
      default:
        return false;
    }
  }

  getConnectedServices(): string[] {
    return this.getServiceStatus()
      .filter(status => status.status === 'connected')
      .map(status => status.service);
  }

  getFailedServices(): string[] {
    return this.getServiceStatus()
      .filter(status => status.status === 'error')
      .map(status => status.service);
  }

  // Service accessors
  getOrbitDBService() {
    return orbitDBService;
  }

  getEmailService() {
    return emailService;
  }

  getSMSService() {
    return smsService;
  }

  getIPFSService() {
    return ipfsService;
  }

  getQRScannerService() {
    return qrScannerService;
  }
}

// Export singleton instance
export const productionServices = ProductionServicesManager.getInstance();
