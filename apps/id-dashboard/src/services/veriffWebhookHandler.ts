// Veriff Webhook Handler
// Handles callbacks from Veriff after verification completion

export interface VeriffWebhookEvent {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'REVIEW';
  code: number;
  reason?: string;
  vendorData?: string;
  person?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  };
  document?: {
    type?: string;
    number?: string;
    country?: string;
    validFrom?: string;
    validUntil?: string;
  };
  address?: {
    country?: string;
    city?: string;
    streetAddress?: string;
    postalCode?: string;
  };
  verification?: {
    id: string;
    url: string;
    vendorData?: string;
    status: 'SUCCESS' | 'FAILED' | 'REVIEW';
    code: number;
    reason?: string;
  };
}

export interface VeriffVerificationResult {
  success: boolean;
  verificationId: string;
  extractedData: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    dateOfBirth?: string;
    documentNumber?: string;
    documentType?: string;
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    address?: string;
    expirationDate?: string;
    issuingAuthority?: string;
  };
  fraudPrevention: {
    livenessCheck: boolean;
    documentAuthenticity: boolean;
    biometricMatch: boolean;
    riskScore: number;
  };
  error?: string;
}

export class VeriffWebhookHandler {
  private static instance: VeriffWebhookHandler;
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.REACT_APP_VERIFF_WEBHOOK_SECRET || '4e5d0ee0-f4e6-419f-b1fa-7610e026b892';
  }

  static getInstance(): VeriffWebhookHandler {
    if (!VeriffWebhookHandler.instance) {
      VeriffWebhookHandler.instance = new VeriffWebhookHandler();
    }
    return VeriffWebhookHandler.instance;
  }

  /**
   * Process webhook event from Veriff
   */
  async processWebhook(event: VeriffWebhookEvent): Promise<VeriffVerificationResult> {
    try {
      // Validate webhook signature (in production)
      // await this.validateWebhookSignature(event);

      // Extract data from Veriff response
      const extractedData = this.extractDataFromVeriffEvent(event);
      
      // Determine success based on Veriff status
      const success = event.status === 'SUCCESS';
      
      // Generate fraud prevention data
      const fraudPrevention = this.generateFraudPreventionData(event);

      return {
        success,
        verificationId: event.id,
        extractedData,
        fraudPrevention,
        error: success ? undefined : event.reason || 'Verification failed'
      };

    } catch (error) {
      console.error('Error processing Veriff webhook:', error);
      throw error;
    }
  }

  /**
   * Extract identity data from Veriff webhook event
   */
  private extractDataFromVeriffEvent(event: VeriffWebhookEvent): any {
    const person = event.person || {};
    const document = event.document || {};
    const address = event.address || {};

    return {
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      middleName: '', // Not provided by Veriff
      dateOfBirth: person.dateOfBirth || '',
      documentNumber: document.number || '',
      documentType: this.mapDocumentType(document.type),
      country: document.country || address.country || '',
      state: '', // Extract from address if available
      city: address.city || '',
      postalCode: address.postalCode || '',
      address: address.streetAddress || '',
      expirationDate: document.validUntil || '',
      issuingAuthority: '' // Not provided by Veriff
    };
  }

  /**
   * Map Veriff document types to our internal types
   */
  private mapDocumentType(veriffType?: string): string {
    if (!veriffType) return 'drivers_license';
    
    const typeMap: { [key: string]: string } = {
      'DRIVERS_LICENSE': 'drivers_license',
      'PASSPORT': 'passport',
      'NATIONAL_ID': 'national_id',
      'STATE_ID': 'state_id'
    };

    return typeMap[veriffType] || 'drivers_license';
  }

  /**
   * Generate fraud prevention data from Veriff event
   */
  private generateFraudPreventionData(event: VeriffWebhookEvent): any {
    const isSuccess = event.status === 'SUCCESS';
    
    return {
      livenessCheck: isSuccess,
      documentAuthenticity: isSuccess,
      biometricMatch: isSuccess,
      riskScore: isSuccess ? 0.1 : 0.9
    };
  }

  /**
   * Validate webhook signature (for production security)
   */
  private async validateWebhookSignature(event: VeriffWebhookEvent): Promise<boolean> {
    // In production, validate the webhook signature using Veriff's webhook secret
    // This ensures the webhook actually came from Veriff
    return true; // Simplified for now
  }

  /**
   * Handle successful verification
   */
  async handleSuccessfulVerification(verificationResult: VeriffVerificationResult): Promise<void> {
    try {
      // Store verification result
      await this.storeVerificationResult(verificationResult);
      
      // Generate ZKPs
      await this.generateZKPsFromVerification(verificationResult);
      
      // Notify user of successful verification
      await this.notifyUserOfSuccess(verificationResult);
      
    } catch (error) {
      console.error('Error handling successful verification:', error);
      throw error;
    }
  }

  /**
   * Store verification result
   */
  private async storeVerificationResult(result: VeriffVerificationResult): Promise<void> {
    // Store in local storage or database
    const storageKey = `verification_${result.verificationId}`;
    localStorage.setItem(storageKey, JSON.stringify(result));
  }

  /**
   * Generate ZKPs from verification result
   */
  private async generateZKPsFromVerification(result: VeriffVerificationResult): Promise<void> {
    // This would integrate with the ZKP generation system
    // For now, just log the extracted data
    console.log('Generating ZKPs for:', result.extractedData);
  }

  /**
   * Notify user of successful verification
   */
  private async notifyUserOfSuccess(result: VeriffVerificationResult): Promise<void> {
    // This could trigger a notification or redirect
    console.log('Verification successful:', result.verificationId);
  }
}

// Export singleton instance
export const veriffWebhookHandler = VeriffWebhookHandler.getInstance();
