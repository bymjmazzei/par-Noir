/**
 * WebSocket utility for real-time communication
 */

export interface WebSocketMessage {
  type: 'security-alert' | 'session-update' | 'tool-access' | 'recovery-status';
  data: any;
  timestamp: string;
}

export interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private listeners: Map<string, Set<(message: WebSocketMessage) => void>> = new Map();
  private isConnecting = false;

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = {
      url: config.url || 'ws://localhost:3002/socket.io/?EIO=4&transport=websocket',
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 5
    };
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            // Handle Socket.io protocol messages
            if (event.data.startsWith('42')) {
              // Socket.io event message
              const jsonData = event.data.substring(2);
              const parsed = JSON.parse(jsonData);
              if (Array.isArray(parsed) && parsed.length >= 2) {
                const [eventName, data] = parsed;
                const message: WebSocketMessage = {
                  type: eventName as any,
                  data,
                  timestamp: new Date().toISOString()
                };
                this.handleMessage(message);
              }
            } else if (event.data.startsWith('{')) {
              // Direct JSON message
              const message: WebSocketMessage = JSON.parse(event.data);
              this.handleMessage(message);
            }
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
            }
          }
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.handleDisconnect();
        };

        this.ws.onerror = () => {
          this.isConnecting = false;
          reject(new Error('WebSocket connection failed'));
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send message to WebSocket server
   */
  send(type: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Format as Socket.io event message
      const message = `42["${type}",${JSON.stringify(data)}]`;
      this.ws.send(message);
    } else {
      // Handle disconnected state silently
    }
  }

  /**
   * Subscribe to message type
   */
  on(type: string, callback: (message: WebSocketMessage) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  /**
   * Unsubscribe from message type
   */
  off(type: string, callback: (message: WebSocketMessage) => void): void {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: WebSocketMessage): void {
    const callbacks = this.listeners.get(message.type);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          // Error in WebSocket message handler
        }
      });
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
          // Reconnection failed
        });
      }, this.config.reconnectInterval);
    } else {
      // Max reconnection attempts reached
    }
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  get readyState(): number {
    return this.ws?.readyState || WebSocket.CLOSED;
  }
}

// Global WebSocket manager instance
export const websocketManager = new WebSocketManager(); 