import { config, features, log } from '../config/environment';

export interface RealtimeMessage {
  type: 'custodian-notification' | 'device-sync' | 'recovery-approval' | 'security-alert';
  data: any;
  timestamp: number;
  id: string;
}

export interface CustodianNotification {
  custodianId: string;
  custodianName: string;
  action: 'approve' | 'deny' | 'request';
  recoveryId?: string;
  message: string;
}

export interface DeviceSyncUpdate {
  deviceId: string;
  deviceName: string;
  action: 'paired' | 'unpaired' | 'sync-complete' | 'nickname-updated';
  data?: any;
}

export interface RecoveryApproval {
  recoveryId: string;
  custodianId: string;
  action: 'approve' | 'deny';
  timestamp: number;
}

export class RealtimeManager {
  private static instance: RealtimeManager;
  private listeners: Map<string, Set<(message: RealtimeMessage) => void>> = new Map();
  private messageQueue: RealtimeMessage[] = [];
  private isConnected = false;
  private reconnectInterval: number | null = null;
  private ws: WebSocket | null = null;
  private url: string = config.apiEndpoints.websocket;
  // private reconnectAttempts = 0;

  static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager();
    }
    return RealtimeManager.instance;
  }

  /**
   * Connect to real-time service (simulated)
   */
  async connect(): Promise<void> {
    try {
      // Check if WebSocket is enabled in current environment
      if (!features.enableWebSocket) {
        log.debug('WebSocket disabled in current environment');
        this.isConnected = true; // Simulate connection for development
        // this.reconnectAttempts = 0;
        this.startHealthCheck();
        return;
      }
      
      // Only create WebSocket if enabled
      if (features.enableWebSocket) {
        this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        // this.reconnectAttempts = 0;
        this.startHealthCheck();
      };
      
      this.ws.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };
      
      this.ws.onerror = () => {
        // Handle connection error silently
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.processMessage(message);
        } catch (error) {
          // Handle message processing error silently
        }
      };
      }
    } catch (error) {
      // Handle connection error silently
    }
  }

  /**
   * Disconnect from real-time service
   */
  disconnect(): void {
    this.isConnected = false;
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    // Realtime connection disconnected
  }

  /**
   * Subscribe to real-time messages
   */
  subscribe(type: string, callback: (message: RealtimeMessage) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    
    this.listeners.get(type)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(type);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(type);
        }
      }
    };
  }

  /**
   * Send a real-time message
   */
  async sendMessage(message: Omit<RealtimeMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: RealtimeMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now()
    };

    // Check if WebSocket is enabled
    if (!features.enableWebSocket) {
      log.debug('WebSocket disabled, processing message locally');
      await this.processMessage(fullMessage);
      return;
    }

    if (this.isConnected) {
      await this.processMessage(fullMessage);
    } else {
      this.messageQueue.push(fullMessage);
    }
  }

  /**
   * Send custodian notification
   */
  async sendCustodianNotification(notification: CustodianNotification): Promise<void> {
    await this.sendMessage({
      type: 'custodian-notification',
      data: notification
    });
  }

  /**
   * Send device sync update
   */
  async sendDeviceSyncUpdate(update: DeviceSyncUpdate): Promise<void> {
    await this.sendMessage({
      type: 'device-sync',
      data: update
    });
  }

  /**
   * Send nickname update to all synced devices
   */
  async sendNicknameUpdate(identityId: string, newNickname: string, updatedByDeviceId: string): Promise<void> {
    await this.sendDeviceSyncUpdate({
      deviceId: updatedByDeviceId,
      deviceName: 'Current Device',
      action: 'nickname-updated',
      data: {
        identityId,
        newNickname,
        updatedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Send recovery approval
   */
  async sendRecoveryApproval(approval: RecoveryApproval): Promise<void> {
    await this.sendMessage({
      type: 'recovery-approval',
      data: approval
    });
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(alert: { type: string; message: string; severity: 'low' | 'medium' | 'high' }): Promise<void> {
    await this.sendMessage({
      type: 'security-alert',
      data: alert
    });
  }

  /**
   * Process incoming message
   */
  private async processMessage(message: RealtimeMessage): Promise<void> {
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      
      // Notify subscribers
      const listeners = this.listeners.get(message.type);
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(message);
                } catch (error) {
        // Handle realtime callback error silently
      }
        });
      }
          } catch (error) {
        // Handle message processing error silently
      }
  }

  /**
   * Process queued messages
   */
  // private async processQueuedMessages(): Promise<void> {
  //   if (this.messageQueue.length === 0) return;
  //   
  //   const messages = [...this.messageQueue];
  //   this.messageQueue = [];
  //   
  //   for (const message of messages) {
  //     try {
  //       await this.processMessage(message);
  //     } catch (error) {
  //       // Handle message processing error silently
  //     }
  //   }
  // }

  /**
   * Start health check
   */
  private startHealthCheck(): void {
    // Simulate health check every 30 seconds
    setInterval(() => {
      if (this.isConnected) {
        // Send ping message
        this.sendMessage({
          type: 'security-alert',
          data: { timestamp: Date.now() }
        }).catch(() => {
          // Handle health check error silently
        });
      }
    }, 30000);
  }


  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }
    
    this.reconnectInterval = window.setTimeout(() => {
      this.connect().catch(() => {
      // Handle connection error silently
    });
    }, 5000); // Retry after 5 seconds
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get message queue length
   */
  getQueueLength(): number {
    return this.messageQueue.length;
  }
}

// Export singleton instance
export const realtimeManager = RealtimeManager.getInstance(); 