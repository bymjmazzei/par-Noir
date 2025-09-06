// Notifications Service for pN Identity Management
// Handles notification storage, retrieval, and management using pN metadata

import { SecureMetadataStorage } from './secureMetadataStorage';
import { NotificationEvent, NotificationSettings } from './secureMetadata';

export interface Notification {
  id: string;
  type: 'recovery-request' | 'security-alert' | 'custodian-approval' | 'integration-update' | 'device-pairing' | 'sync-complete' | 'data-request' | 'system-update';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  identityId: string;
  identityNickname: string;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: any;
}

interface UnlockedIdentity {
  id: string;
  pnName: string;
  passcode: string;
  nickname: string;
}

// Notification expiration rules (in milliseconds)
const EXPIRATION_RULES = {
  'recovery-request': 7 * 24 * 60 * 60 * 1000, // 7 days
  'security-alert': 30 * 24 * 60 * 60 * 1000, // 30 days
  'custodian-approval': 14 * 24 * 60 * 60 * 1000, // 14 days
  'integration-update': 3 * 24 * 60 * 60 * 1000, // 3 days
  'device-pairing': 24 * 60 * 60 * 1000, // 1 day
  'sync-complete': 24 * 60 * 60 * 1000, // 1 day
  'data-request': 7 * 24 * 60 * 60 * 1000, // 7 days
  'system-update': 30 * 24 * 60 * 60 * 1000 // 30 days
};

class NotificationsService {
  private notifications: Notification[] = [];
  private currentUnlockedIdentity: UnlockedIdentity | null = null;
  private settings: NotificationSettings = {
    enabled: true,
    recoveryRequests: true,
    custodianApprovals: true,
    integrationUpdates: true,
    securityAlerts: true,
    syncNotifications: false,
    devicePairing: true,
    sound: true,
    vibration: true,
    showInApp: true,
    showSystem: false
  };

  constructor() {
    this.loadNotifications();
    this.loadSettings();
    this.initializeMetadataService();
  }

  private async initializeMetadataService(): Promise<void> {
    try {
      // Initialize metadata-based notifications
      if (process.env.NODE_ENV === 'development') {
        // Metadata-based Notifications service initialized
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to initialize notifications service - error handled gracefully
      }
    }
  }

  setUnlockedIdentity(identityId: string, pnName: string, passcode: string, nickname: string): void {
    this.currentUnlockedIdentity = { id: identityId, pnName, passcode, nickname };
    if (process.env.NODE_ENV === 'development') {
      // Identity unlocked - notifications enabled
    }
  }

  clearUnlockedIdentity(): void {
    this.currentUnlockedIdentity = null;
    if (process.env.NODE_ENV === 'development') {
      // Identity locked - notifications disabled
    }
  }

  async checkForNewNotifications(): Promise<void> {
    try {
      if (!this.currentUnlockedIdentity) {
        return;
      }

      // Check for new notifications in pN metadata
      const newNotifications = await this.getNotificationsFromMetadata(this.currentUnlockedIdentity.id);
      
      if (newNotifications.length > 0) {
        // Add new notifications to local storage
        this.notifications.push(...newNotifications);
        this.saveNotifications();
        
        if (process.env.NODE_ENV === 'development') {
          // Found new notifications in pN metadata
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to check for new notifications - error handled gracefully
      }
    }
  }

  async getNotifications(): Promise<Notification[]> {
    if (!this.currentUnlockedIdentity) {
      return [];
    }
    return this.notifications.filter(n => n.identityId === this.currentUnlockedIdentity!.id);
  }

  async getUnreadNotifications(): Promise<Notification[]> {
    if (!this.currentUnlockedIdentity) {
      return [];
    }
    return this.notifications.filter(n => 
      n.identityId === this.currentUnlockedIdentity!.id && !n.read
    );
  }

  async getUnreadCount(): Promise<number> {
    if (!this.currentUnlockedIdentity) {
      return 0;
    }
    return this.notifications.filter(n => 
      n.identityId === this.currentUnlockedIdentity!.id && !n.read
    ).length;
  }

  async markAsRead(notificationIds: string[]): Promise<void> {
    this.notifications.forEach(notification => {
      if (notificationIds.includes(notification.id)) {
        notification.read = true;
      }
    });
    this.saveNotifications();
    
    // Update metadata
    if (this.currentUnlockedIdentity) {
      await this.markNotificationAsReadInMetadata(this.currentUnlockedIdentity.id, notificationIds);
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.saveNotifications();
    
    // Update metadata
    if (this.currentUnlockedIdentity) {
      await this.deleteNotificationFromMetadata(this.currentUnlockedIdentity.id, notificationId);
    }
  }

  async createNotification(
    type: Notification['type'],
    title: string,
    message: string,
    identityId: string,
    identityNickname: string,
    priority: Notification['priority'] = 'medium',
    actionUrl?: string,
    metadata?: any
  ): Promise<void> {
    const notification: Notification = {
      id: this.generateNotificationId(),
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
      identityId,
      identityNickname,
      actionUrl,
      priority,
      metadata
    };

    this.notifications.push(notification);
    this.saveNotifications();

    // Store in pN metadata if identity is unlocked
    if (this.currentUnlockedIdentity && this.currentUnlockedIdentity.id === identityId) {
      await this.storeNotificationInMetadata(notification);
    }

    // Show in-app notification
    this.showInAppNotification(notification);
  }

  async createTestNotification(identityNickname: string): Promise<void> {
    // Don't store test notifications in metadata (none priority)
    if (process.env.NODE_ENV === 'development') {
      // Test notification created
    }
  }

  async getNotificationCount(identityId: string): Promise<number> {
    return this.notifications.filter(n => n.identityId === identityId).length;
  }

  async getUnreadNotificationCount(identityId: string): Promise<number> {
    return this.notifications.filter(n => n.identityId === identityId && !n.read).length;
  }

  // getUnreadCount(): number {
  //   return this.notifications.filter(n => !n.read).length;
  // }

  getNotificationsByType(type: Notification['type']): Notification[] {
    return this.notifications.filter(n => n.type === type);
  }

  async updateSettings(newSettings: Partial<NotificationSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    
    // Update metadata
    if (this.currentUnlockedIdentity) {
      await this.updateNotificationSettingsInMetadata(this.currentUnlockedIdentity.id, this.settings);
    }
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  // Get notification count for a specific identity (without unlocking it)
  getNotificationCountForIdentity(identityId: string): number {
    const count = this.notifications.filter(n => n.identityId === identityId).length;
    if (process.env.NODE_ENV === 'development') {
      // Notification count retrieved
    }
    return count;
  }

  // Get unread notification count for a specific identity (without unlocking it)
  getUnreadNotificationCountForIdentity(identityId: string): number {
    const count = this.notifications.filter(n => n.identityId === identityId && !n.read).length;
    if (process.env.NODE_ENV === 'development') {
      // Unread notification count retrieved
    }
    return count;
  }

  // Metadata-based notification methods
  private async storeNotificationInMetadata(notification: Notification): Promise<void> {
    try {
      if (!this.currentUnlockedIdentity) {
        return;
      }

      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(this.currentUnlockedIdentity.id);
      
      if (currentMetadata) {
        // Initialize notifications section if it doesn't exist
        if (!currentMetadata.notifications) {
          currentMetadata.notifications = {
            unread: [],
            read: [],
            lastChecked: new Date().toISOString(),
            settings: this.settings
          };
        }
        
        // Create notification event
        const notificationEvent: NotificationEvent = {
          id: notification.id,
          type: notification.type,
          timestamp: notification.timestamp,
          sender: 'system',
          encryptedPayload: this.encryptNotificationData({
            title: notification.title,
            message: notification.message,
            actionUrl: notification.actionUrl,
            metadata: notification.metadata
          }),
          signature: 'system-signature',
          priority: notification.priority
        };
        
        // Add notification to unread array
        currentMetadata.notifications.unread.push(notificationEvent);
        currentMetadata.notifications.lastChecked = new Date().toISOString();
        
        // Update metadata
        await SecureMetadataStorage.updateMetadata(this.currentUnlockedIdentity.id, currentMetadata);
      }
    } catch (error) {
      // Handle error silently in production
    }
  }

  private async getNotificationsFromMetadata(identityId: string): Promise<Notification[]> {
    try {
      if (!this.currentUnlockedIdentity) {
        return [];
      }

      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(identityId);
      
      if (currentMetadata && currentMetadata.notifications?.unread) {
        // Convert NotificationEvent to Notification
        return currentMetadata.notifications.unread.map((event: any) => {
          try {
            const decryptedPayload = this.decryptNotificationData(event.encryptedPayload);
            return {
              id: event.id,
              type: event.type,
              title: decryptedPayload.title,
              message: decryptedPayload.message,
              timestamp: event.timestamp,
              read: false,
              identityId: identityId,
              identityNickname: this.currentUnlockedIdentity?.nickname || 'Unknown',
              actionUrl: decryptedPayload.actionUrl,
              priority: event.priority,
              metadata: decryptedPayload.metadata
            };
          } catch (error) {
            return null;
          }
        }).filter(Boolean) as Notification[];
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }

  private async markNotificationAsReadInMetadata(identityId: string, notificationIds: string[]): Promise<void> {
    try {
      if (!this.currentUnlockedIdentity) {
        return;
      }

      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(identityId);
      
      if (currentMetadata && currentMetadata.notifications) {
        // Move notifications from unread to read
        const unreadNotifications = currentMetadata.notifications.unread || [];
        const readNotifications = currentMetadata.notifications.read || [];
        
        // Find notifications to mark as read
        const notificationsToMove = unreadNotifications.filter((n: any) => 
          notificationIds.includes(n.id)
        );
        
        // Remove from unread
        currentMetadata.notifications.unread = unreadNotifications.filter((n: any) => 
          !notificationIds.includes(n.id)
        );
        
        // Add to read
        currentMetadata.notifications.read = [...readNotifications, ...notificationsToMove];
        currentMetadata.notifications.lastChecked = new Date().toISOString();
        
        // Update metadata
        await SecureMetadataStorage.updateMetadata(identityId, currentMetadata);
      }
    } catch (error) {
      // Handle error silently in production
    }
  }

  private async deleteNotificationFromMetadata(identityId: string, notificationId: string): Promise<void> {
    try {
      if (!this.currentUnlockedIdentity) {
        return;
      }

      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(identityId);
      
      if (currentMetadata && currentMetadata.notifications) {
        // Remove from both unread and read arrays
        currentMetadata.notifications.unread = currentMetadata.notifications.unread.filter((n: any) => 
          n.id !== notificationId
        );
        currentMetadata.notifications.read = currentMetadata.notifications.read.filter((n: any) => 
          n.id !== notificationId
        );
        
        // Update metadata
        await SecureMetadataStorage.updateMetadata(identityId, currentMetadata);
      }
    } catch (error) {
      // Handle error silently in production
    }
  }

  private async updateNotificationSettingsInMetadata(identityId: string, settings: NotificationSettings): Promise<void> {
    try {
      if (!this.currentUnlockedIdentity) {
        return;
      }

      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(identityId);
      
      if (currentMetadata) {
        // Initialize notifications section if it doesn't exist
        if (!currentMetadata.notifications) {
          currentMetadata.notifications = {
            unread: [],
            read: [],
            lastChecked: new Date().toISOString(),
            settings: settings
          };
        } else {
          // Update settings
          currentMetadata.notifications.settings = settings;
        }
        
        // Update metadata
        await SecureMetadataStorage.updateMetadata(identityId, currentMetadata);
      }
    } catch (error) {
      // Handle error silently in production
    }
  }

  // Utility methods
  private generateNotificationId(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomString = Array.from(randomBytes).map(b => b.toString(36)).join('').substring(0, 9);
    return `notification_${Date.now()}_${randomString}`;
  }

  private encryptNotificationData(data: any): string {
    // Simple encryption for development - in production, use proper encryption
    return btoa(JSON.stringify(data));
  }

  private decryptNotificationData(encryptedData: string): any {
    // Simple decryption for development - in production, use proper decryption
    return JSON.parse(atob(encryptedData));
  }

  private showInAppNotification(notification: Notification): void {
    if (process.env.NODE_ENV === 'development') {
      // Showing in-app notification
    }
  }

  private loadNotifications(): void {
    try {
      const stored = localStorage.getItem('pn_notifications');
      if (stored) {
        this.notifications = JSON.parse(stored);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to load notifications - handled silently
      }
      this.notifications = [];
    }
  }

  private saveNotifications(): void {
    try {
      localStorage.setItem('pn_notifications', JSON.stringify(this.notifications));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to save notifications - handled silently
      }
    }
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem('pn_notification_settings');
      if (stored) {
        this.settings = { ...this.settings, ...JSON.parse(stored) };
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to load notification settings - handled silently
      }
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('pn_notification_settings', JSON.stringify(this.settings));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to save notification settings - handled silently
      }
    }
  }
}

// Export singleton instance
export const notificationsService = new NotificationsService();

