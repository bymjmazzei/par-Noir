/**
 * Notification WebSocket Service
 * Real-time notifications via WebSocket with polling fallback
 */

import { Notification } from './notificationService';
import { io, Socket } from 'socket.io-client';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

export interface WebSocketNotification extends Notification {
  timestamp: string;
}

type NotificationCallback = (notification: WebSocketNotification) => void;
type ConnectionCallback = (connected: boolean) => void;

class NotificationWebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private pollingInterval: NodeJS.Timeout | null = null;
  private userDid: string | null = null;
  private lastNotificationTime: string | null = null;

  /**
   * Connect to WebSocket server
   */
  connect(userDid: string): void {
    if (this.socket?.connected && this.userDid === userDid) {
      return; // Already connected
    }

    this.userDid = userDid;
    this.disconnect(); // Clean up existing connection

    try {
      // Connect to Socket.IO server
      const wsUrl = API_ENDPOINT.replace('https://', 'wss://').replace('http://', 'ws://');
      this.socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('✅ WebSocket connected for notifications');
        
        // Authenticate with user DID
        this.socket?.emit('authenticate', { userDid });
        
        // Stop polling when WebSocket connects
        this.stopPolling();
        
        // Notify connection callbacks
        this.connectionCallbacks.forEach(cb => cb(true));
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        console.log('⚠️ WebSocket disconnected');
        
        // Start polling fallback
        this.startPolling(userDid);
        
        // Notify connection callbacks
        this.connectionCallbacks.forEach(cb => cb(false));
      });

      this.socket.on('connect_error', (error) => {
        console.warn('WebSocket connection error:', error);
        // Start polling fallback
        this.startPolling(userDid);
      });

      this.socket.on('notification', (notification: WebSocketNotification) => {
        console.log('📬 New notification via WebSocket:', notification);
        this.notificationCallbacks.forEach(cb => cb(notification));
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`✅ WebSocket reconnected after ${attemptNumber} attempts`);
        this.reconnectAttempts = 0;
        if (this.userDid) {
          this.socket?.emit('authenticate', { userDid: this.userDid });
        }
      });

      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 WebSocket reconnection attempt ${attemptNumber}`);
        this.reconnectAttempts = attemptNumber;
      });

      this.socket.on('reconnect_failed', () => {
        console.error('❌ WebSocket reconnection failed, using polling fallback');
        this.startPolling(userDid);
      });

    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      // Fallback to polling
      this.startPolling(userDid);
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.stopPolling();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Start polling fallback when WebSocket is unavailable
   */
  private startPolling(userDid: string): void {
    if (this.pollingInterval) {
      return; // Already polling
    }

    console.log('📡 Starting polling fallback for notifications');
    
    // Poll immediately
    this.pollForNotifications(userDid);

    // Then poll every 10 seconds
    this.pollingInterval = setInterval(() => {
      this.pollForNotifications(userDid);
    }, 10000);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Poll for new notifications
   */
  private async pollForNotifications(userDid: string): Promise<void> {
    try {
      const { NotificationService } = await import('./notificationService');
      const response = await NotificationService.getNotifications(userDid, {
        limit: 10,
        unreadOnly: true
      });

      // Only notify about new notifications
      if (response.notifications.length > 0) {
        const newNotifications = this.lastNotificationTime
          ? response.notifications.filter(n => new Date(n.created_at) > new Date(this.lastNotificationTime!))
          : response.notifications;

        if (newNotifications.length > 0) {
          newNotifications.forEach(notification => {
            const wsNotification: WebSocketNotification = {
              ...notification,
              timestamp: notification.created_at
            };
            this.notificationCallbacks.forEach(cb => cb(wsNotification));
          });

          // Update last notification time
          this.lastNotificationTime = response.notifications[0].created_at;
        }
      }
    } catch (error) {
      console.error('Failed to poll for notifications:', error);
    }
  }

  /**
   * Subscribe to notifications
   */
  onNotification(callback: NotificationCallback): () => void {
    this.notificationCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.notificationCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    
    // Return current status
    callback(this.isConnected);
    
    // Return unsubscribe function
    return () => {
      this.connectionCallbacks.delete(callback);
    };
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
export const notificationWebSocket = new NotificationWebSocketService();

