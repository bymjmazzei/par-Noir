// Notifications Service - Handles push notifications, local notifications, and notification management

export interface Notification {
  id: string;
  type: 'recovery-request' | 'custodian-approval' | 'integration-update' | 'security-alert' | 'sync-complete' | 'device-pairing';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  identityId: string; // Which ID this notification belongs to
  identityNickname: string; // Nickname of the ID for display
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: any;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  identityId?: string;
  identityNickname?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  recoveryRequests: boolean;
  custodianApprovals: boolean;
  integrationUpdates: boolean;
  securityAlerts: boolean;
  syncNotifications: boolean;
  devicePairing: boolean;
  sound: boolean;
  vibration: boolean;
  showInApp: boolean;
  showSystem: boolean;
}

export class NotificationsService {
  private static instance: NotificationsService;
  private notifications: Notification[] = [];
  private settings: NotificationSettings;
  private isInitialized = false;
  private pushSubscription: PushSubscription | null = null;
  private currentUnlockedIdentity: { id: string; nickname: string } | null = null;

  constructor() {
    this.settings = this.loadSettings();
    this.notifications = this.loadNotifications();
  }

  static getInstance(): NotificationsService {
    if (!NotificationsService.instance) {
      NotificationsService.instance = new NotificationsService();
    }
    return NotificationsService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if service workers are supported
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        await this.registerServiceWorker();
        await this.requestNotificationPermission();
        await this.subscribeToPushNotifications();
      }

      this.isInitialized = true;
      // Silently handle successful initialization in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle initialization failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  private async registerServiceWorker(): Promise<void> {
    try {
      // const registration = await navigator.serviceWorker.register('/sw.js');
      // Silently handle service worker registration in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle service worker registration failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  private async requestNotificationPermission(): Promise<void> {
    try {
      // const permission = await Notification.requestPermission();
      // Silently handle notification permission request in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle notification permission request failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  private async subscribeToPushNotifications(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(process.env.REACT_APP_VAPID_PUBLIC_KEY || '')
      });

      this.pushSubscription = subscription;
      // Silently handle push notification subscription in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle push notification subscription failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  // Set the currently unlocked identity (called when user unlocks an ID)
  setUnlockedIdentity(identityId: string, nickname: string): void {
    this.currentUnlockedIdentity = { id: identityId, nickname };
    // Silently handle identity unlock in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }

  // Clear the unlocked identity (called when user locks an ID)
  clearUnlockedIdentity(): void {
    this.currentUnlockedIdentity = null;
    // Silently handle identity lock in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }

  // Get notifications for the currently unlocked identity
  getNotificationsForCurrentIdentity(): Notification[] {
    if (!this.currentUnlockedIdentity) {
      return [];
    }
    return this.notifications.filter(n => n.identityId === this.currentUnlockedIdentity!.id);
  }

  // Get unread count for the currently unlocked identity
  getUnreadCountForCurrentIdentity(): number {
    if (!this.currentUnlockedIdentity) {
      return 0;
    }
    return this.notifications.filter(n => 
      n.identityId === this.currentUnlockedIdentity!.id && !n.read
    ).length;
  }

  // Create notifications for different events
  async createRecoveryRequestNotification(data: {
    requestingUser: string;
    identityId: string;
    identityNickname: string;
    recoveryCode?: string;
  }): Promise<void> {
    const notification: Notification = {
      id: `recovery-${Date.now()}`,
      type: 'recovery-request',
      title: 'Recovery Request',
      message: `${data.requestingUser} is requesting access to your identity. Recovery code: ${data.recoveryCode || 'N/A'}`,
      timestamp: new Date().toISOString(),
      read: false,
      identityId: data.identityId,
      identityNickname: data.identityNickname,
      priority: 'high',
      actionUrl: `/recovery/${data.identityId}`,
      metadata: data
    };

    await this.addNotification(notification);
    
    // Send push notification with ID context
    await this.sendPushNotification({
      title: 'New Notification',
      body: `You have a new notification in ${data.identityNickname}`,
      tag: 'recovery-request',
      data: { type: 'recovery-request', identityId: data.identityId },
      identityId: data.identityId,
      identityNickname: data.identityNickname
    });
  }

  async createCustodianApprovalNotification(data: {
    custodianName: string;
    identityId: string;
    identityNickname: string;
    action: 'approved' | 'denied';
  }): Promise<void> {
    const notification: Notification = {
      id: `custodian-${Date.now()}`,
      type: 'custodian-approval',
      title: 'Custodian Action',
      message: `${data.custodianName} has ${data.action} access to your identity "${data.identityNickname}"`,
      timestamp: new Date().toISOString(),
      read: false,
      identityId: data.identityId,
      identityNickname: data.identityNickname,
      priority: 'medium',
      actionUrl: `/custodians`,
      metadata: data
    };

    await this.addNotification(notification);
    await this.sendPushNotification({
      title: 'New Notification',
      body: `You have a new notification in ${data.identityNickname}`,
      tag: 'custodian-approval',
      data: { type: 'custodian-approval', action: data.action },
      identityId: data.identityId,
      identityNickname: data.identityNickname
    });
  }

  async createIntegrationUpdateNotification(data: {
    integrationName: string;
    identityId: string;
    identityNickname: string;
    updateType: 'connected' | 'disconnected' | 'updated' | 'error';
    details?: string;
  }): Promise<void> {
    const notification: Notification = {
      id: `integration-${Date.now()}`,
      type: 'integration-update',
      title: 'Integration Update',
      message: `${data.integrationName} has been ${data.updateType}${data.details ? `: ${data.details}` : ''}`,
      timestamp: new Date().toISOString(),
      read: false,
      identityId: data.identityId,
      identityNickname: data.identityNickname,
      priority: 'medium',
      actionUrl: `/integrations`,
      metadata: data
    };

    await this.addNotification(notification);
    await this.sendPushNotification({
      title: 'New Notification',
      body: `You have a new notification in ${data.identityNickname}`,
      tag: 'integration-update',
      data: { type: 'integration-update', integrationName: data.integrationName },
      identityId: data.identityId,
      identityNickname: data.identityNickname
    });
  }

  async createSecurityAlertNotification(data: {
    alertType: 'login' | 'recovery' | 'device' | 'custodian';
    identityId: string;
    identityNickname: string;
    details: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<void> {
    const notification: Notification = {
      id: `security-${Date.now()}`,
      type: 'security-alert',
      title: 'Security Alert',
      message: data.details,
      timestamp: new Date().toISOString(),
      read: false,
      identityId: data.identityId,
      identityNickname: data.identityNickname,
      priority: data.severity,
      actionUrl: `/security`,
      metadata: data
    };

    await this.addNotification(notification);
    await this.sendPushNotification({
      title: 'New Notification',
      body: `You have a new notification in ${data.identityNickname}`,
      tag: 'security-alert',
      data: { type: 'security-alert', alertType: data.alertType },
      identityId: data.identityId,
      identityNickname: data.identityNickname
    });
  }

  async createSyncCompleteNotification(data: {
    syncedItems: number;
    failedItems: number;
    identityId: string;
    identityNickname: string;
  }): Promise<void> {
    const notification: Notification = {
      id: `sync-${Date.now()}`,
      type: 'sync-complete',
      title: 'Sync Complete',
      message: `Successfully synced ${data.syncedItems} items${data.failedItems > 0 ? `, ${data.failedItems} failed` : ''}`,
      timestamp: new Date().toISOString(),
      read: false,
      identityId: data.identityId,
      identityNickname: data.identityNickname,
      priority: 'low',
      metadata: data
    };

    await this.addNotification(notification);
    await this.sendPushNotification({
      title: 'New Notification',
      body: `You have a new notification in ${data.identityNickname}`,
      tag: 'sync-complete',
      data: { type: 'sync-complete', syncedItems: data.syncedItems },
      identityId: data.identityId,
      identityNickname: data.identityNickname
    });
  }

  async createDevicePairingNotification(data: {
    deviceName: string;
    deviceType: string;
    identityId: string;
    identityNickname: string;
    action: 'paired' | 'unpaired';
  }): Promise<void> {
    const notification: Notification = {
      id: `device-${Date.now()}`,
      type: 'device-pairing',
      title: 'Device Pairing',
      message: `${data.deviceName} (${data.deviceType}) has been ${data.action}`,
      timestamp: new Date().toISOString(),
      read: false,
      identityId: data.identityId,
      identityNickname: data.identityNickname,
      priority: 'medium',
      actionUrl: `/devices`,
      metadata: data
    };

    await this.addNotification(notification);
    await this.sendPushNotification({
      title: 'New Notification',
      body: `You have a new notification in ${data.identityNickname}`,
      tag: 'device-pairing',
      data: { type: 'device-pairing', deviceName: data.deviceName },
      identityId: data.identityId,
      identityNickname: data.identityNickname
    });
  }

  // Notification management
  async addNotification(notification: Notification): Promise<void> {
    this.notifications.unshift(notification);
    this.saveNotifications();
    
    if (this.settings.showInApp) {
      this.showInAppNotification(notification);
    }
    
    if (this.settings.showSystem && Notification.permission === 'granted') {
      this.showSystemNotification(notification);
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.saveNotifications();
    }
  }

  async markAllAsRead(): Promise<void> {
    this.notifications.forEach(n => n.read = true);
    this.saveNotifications();
  }

  async deleteNotification(notificationId: string): Promise<void> {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.saveNotifications();
  }

  async clearAllNotifications(): Promise<void> {
    this.notifications = [];
    this.saveNotifications();
  }

  getNotifications(): Notification[] {
    return this.notifications;
  }

  async getNotificationCount(identityId: string): Promise<number> {
    return this.notifications.filter(n => n.identityId === identityId).length;
  }

  async getUnreadNotificationCount(identityId: string): Promise<number> {
    return this.notifications.filter(n => n.identityId === identityId && !n.read).length;
  }

  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  // Get current unlocked identity info
  getCurrentUnlockedIdentity(): { id: string; nickname: string } | null {
    return this.currentUnlockedIdentity;
  }

  // Get notification count for a specific identity (without unlocking it)
  getNotificationCountForIdentity(identityId: string): number {
    const count = this.notifications.filter(n => n.identityId === identityId).length;
    // Silently handle notification count retrieval in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
    return count;
  }

  // Get unread notification count for a specific identity (without unlocking it)
  getUnreadNotificationCountForIdentity(identityId: string): number {
    const count = this.notifications.filter(n => n.identityId === identityId && !n.read).length;
    // Silently handle unread notification count retrieval in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
    return count;
  }

  getNotificationsByType(type: Notification['type']): Notification[] {
    return this.notifications.filter(n => n.type === type);
  }

  // Settings management
  updateSettings(settings: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.saveSettings();
  }

  getSettings(): NotificationSettings {
    return this.settings;
  }

  // Private methods
  private async sendPushNotification(_payload: PushNotificationPayload): Promise<void> {
    if (!this.pushSubscription || !this.settings.enabled) return;

    try {
      // In a real implementation, this would send to your push service
      // Silently handle push notification sending in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle push notification sending failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  private showInAppNotification(_notification: Notification): void {
    // Show in-app notification toast
    // Silently handle in-app notification display in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }

  private showSystemNotification(notification: Notification): void {
    if (Notification.permission === 'granted') {
      const systemNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        tag: notification.id,
        data: notification.metadata
      });

      systemNotification.onclick = () => {
        window.focus();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
      };
    }
  }

  private loadNotifications(): Notification[] {
    try {
      const stored = localStorage.getItem('notifications');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      // Silently handle notification loading failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      return [];
    }
  }

  private saveNotifications(): void {
    try {
      localStorage.setItem('notifications', JSON.stringify(this.notifications));
    } catch (error) {
      // Silently handle notification saving failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  private loadSettings(): NotificationSettings {
    try {
      const stored = localStorage.getItem('notification-settings');
      return stored ? JSON.parse(stored) : {
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
        showSystem: true
      };
    } catch (error) {
      // Silently handle notification settings loading failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      return {
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
        showSystem: true
      };
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('notification-settings', JSON.stringify(this.settings));
    } catch (error) {
      // Silently handle notification settings saving failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Export singleton instance
export const notificationsService = NotificationsService.getInstance();
