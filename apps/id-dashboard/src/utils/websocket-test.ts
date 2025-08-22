/**
 * WebSocket Test Script
 * Run this in the browser console to test WebSocket functionality
 */

import { websocketManager, WebSocketMessage } from './websocket';

export const testWebSocketConnection = async (): Promise<boolean> => {
  try {
    const ws = new WebSocket('ws://localhost:3002/socket.io/?EIO=4&transport=websocket');
    
    return new Promise((resolve) => {
      ws.onopen = () => {
        resolve(true);
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'security_alert':
            // Handle security alert
            break;
          case 'session_update':
            // Handle session update
            break;
          case 'tool_access_update':
            // Handle tool access update
            break;
          case 'recovery_status_update':
            // Handle recovery status update
            break;
        }
      };
      
      ws.onerror = () => {
        resolve(false);
      };
      
      // Timeout after 5 seconds
      setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    return false;
  }
};

// Test connection status
export const checkConnection = () => {
  const isConnected = websocketManager.isConnected;
  // const readyState = websocketManager.readyState;
  
  return isConnected;
};

// Simulate receiving a security alert (for testing)
export const simulateSecurityAlert = () => {
  if (websocketManager.isConnected) {
    const testAlert: WebSocketMessage = {
      type: 'security-alert',
      data: {
        type: 'brute-force',
        severity: 'high',
        message: 'Multiple failed login attempts detected',
        details: {
          ipAddress: '***.***.***.***',
          attempts: 5,
          timeWindow: '5 minutes'
        }
      },
      timestamp: new Date().toISOString()
    };
    
    // Trigger the event manually for testing
    websocketManager['handleMessage'](testAlert);
      } else {
      // WebSocket not connected
    }
};

// Export for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testWebSocket = testWebSocketConnection;
  (window as any).checkConnection = checkConnection;
  (window as any).simulateSecurityAlert = simulateSecurityAlert;
} 