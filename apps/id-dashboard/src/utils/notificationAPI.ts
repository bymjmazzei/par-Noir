// Third-party Notification API
// Allows external services to send notifications to pNs

import { NotificationEvent } from './secureMetadata';

export interface ThirdPartyNotificationRequest {
  targetIdentityId: string; // The pN ID to send notification to
  type: 'recovery-request' | 'custodian-approval' | 'integration-update' | 'security-alert' | 'device-pairing';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
  metadata?: any;
  senderId: string; // ID of the sending service/identity
  signature: string; // Cryptographic signature for verification
}

export interface NotificationAPIResponse {
  success: boolean;
  message: string;
  notificationId?: string;
  error?: string;
}

export class NotificationAPI {
  private static instance: NotificationAPI;
  private apiEndpoint: string;

  constructor() {
    // Use the same endpoint as other pN services
    this.apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
  }

  static getInstance(): NotificationAPI {
    if (!NotificationAPI.instance) {
      NotificationAPI.instance = new NotificationAPI();
    }
    return NotificationAPI.instance;
  }

  /**
   * Send a notification to a pN (for third-party use)
   */
  async sendNotification(request: ThirdPartyNotificationRequest): Promise<NotificationAPIResponse> {
    try {
      // Validate request
      const validation = this.validateNotificationRequest(request);
      if (!validation.isValid) {
        return {
          success: false,
          message: 'Invalid notification request',
          error: validation.errors.join(', ')
        };
      }

      // Create notification event
      const notificationEvent: NotificationEvent = {
        id: `ext-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(36)).join('').substring(0, 9)}`,
        type: request.type,
        timestamp: new Date().toISOString(),
        sender: request.senderId,
        encryptedPayload: this.encryptNotificationPayload(request),
        signature: request.signature,
        priority: request.priority
      };

      // Store in target pN's metadata
      const result = await this.storeNotificationInTargetMetadata(
        request.targetIdentityId,
        notificationEvent
      );

      if (result.success) {
        return {
          success: true,
          message: 'Notification sent successfully',
          notificationId: notificationEvent.id
        };
      } else {
        return {
          success: false,
          message: 'Failed to store notification',
          error: result.error
        };
      }

    } catch (error) {
      return {
        success: false,
        message: 'Failed to send notification',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate notification request
   */
  private validateNotificationRequest(request: ThirdPartyNotificationRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.targetIdentityId) {
      errors.push('targetIdentityId is required');
    }

    if (!request.type) {
      errors.push('type is required');
    }

    if (!request.title || request.title.trim().length === 0) {
      errors.push('title is required');
    }

    if (!request.message || request.message.trim().length === 0) {
      errors.push('message is required');
    }

    if (!request.priority) {
      errors.push('priority is required');
    }

    if (!request.senderId) {
      errors.push('senderId is required');
    }

    if (!request.signature) {
      errors.push('signature is required');
    }

    // Validate type
    const validTypes = ['recovery-request', 'custodian-approval', 'integration-update', 'security-alert', 'device-pairing'];
    if (!validTypes.includes(request.type)) {
      errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(request.priority)) {
      errors.push(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
    }

    // Validate title length
    if (request.title.length > 100) {
      errors.push('title must be 100 characters or less');
    }

    // Validate message length
    if (request.message.length > 500) {
      errors.push('message must be 500 characters or less');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Encrypt notification payload
   */
  private encryptNotificationPayload(request: ThirdPartyNotificationRequest): string {
    const payload = {
      title: request.title,
      message: request.message,
      actionUrl: request.actionUrl,
      metadata: request.metadata,
      timestamp: new Date().toISOString()
    };

    // Simple encryption for now - in production, use proper encryption
    return btoa(JSON.stringify(payload));
  }

  /**
   * Store notification in target pN's metadata
   */
  private async storeNotificationInTargetMetadata(
    targetIdentityId: string,
    notificationEvent: NotificationEvent
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // This would integrate with the existing metadata storage system
      // For now, we'll use a placeholder that would be implemented
      // to work with the existing pN metadata infrastructure
      
      if (process.env.NODE_ENV === 'development') {
        // Storing notification in metadata
          targetIdentityId,
          notificationId: notificationEvent.id,
          type: notificationEvent.type
        });
      }

      // Metadata storage integration - would use SecureMetadataStorage
      // For now, notifications are handled through the existing notification system
      // This would use the existing metadata infrastructure to:
      // 1. Get the target pN's metadata
      // 2. Add the notification to the unread array
      // 3. Update the metadata
      
      return { success: true };

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to store notification in metadata - handled silently
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify notification signature
   */
  private verifySignature(request: ThirdPartyNotificationRequest): boolean {
    try {
      // In production, this would verify the cryptographic signature
      // For now, we'll do basic validation
      const expectedSignature = this.generateExpectedSignature(request);
      return request.signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate expected signature for verification
   */
  private generateExpectedSignature(request: ThirdPartyNotificationRequest): string {
    const data = `${request.targetIdentityId}:${request.type}:${request.title}:${request.message}:${request.senderId}`;
    // Simple signature for now - in production, use proper cryptographic signatures
    return btoa(data);
  }
}

// Export singleton instance
export const notificationAPI = NotificationAPI.getInstance();

// Example usage for third parties:
/*
const api = NotificationAPI.getInstance();

const result = await api.sendNotification({
  targetIdentityId: 'pn-123456',
  type: 'security-alert',
  title: 'Suspicious Login Detected',
  message: 'A new device logged into your account from an unknown location.',
  priority: 'high',
  actionUrl: '/security',
  metadata: { location: 'Unknown', device: 'Unknown' },
  senderId: 'security-service-001',
  signature: 'verified-signature-here'
});

if (result.success) {
} else {
}
*/
