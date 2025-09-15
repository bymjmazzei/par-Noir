import { useState, useEffect, useCallback } from 'react';
// import { websocketManager, WebSocketMessage } from '../utils/websocket';

export interface SecurityAlert {
  id: string;
  type: 'brute-force' | 'suspicious-login' | 'data-access-violation' | 'tool-access-blocked';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  details: any;
}

export interface SessionUpdate {
  sessionId: string;
  deviceName: string;
  status: 'connected' | 'disconnected' | 'terminated';
  timestamp: string;
  ipAddress?: string;
  location?: string;
}

export interface ToolAccessUpdate {
  toolId: string;
  toolName: string;
  action: 'granted' | 'revoked' | 'requested';
  timestamp: string;
  dataPoints: string[];
}

export interface RecoveryStatusUpdate {
  requestId: string;
  status: 'pending' | 'approved' | 'denied';
  timestamp: string;
  custodianName?: string;
}

export const useRealtimeSecurity = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [sessionUpdates, setSessionUpdates] = useState<SessionUpdate[]>([]);
  const [toolAccessUpdates, setToolAccessUpdates] = useState<ToolAccessUpdate[]>([]);
  const [recoveryStatusUpdates, setRecoveryStatusUpdates] = useState<RecoveryStatusUpdate[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Connect to WebSocket (disabled in dev mode)
  const connect = useCallback(async () => {
    // WebSocket disabled in development mode
    setIsConnected(false);
    setConnectionError(null);
  }, []);

  // Disconnect from WebSocket (disabled in dev mode)
  const disconnect = useCallback(() => {
    // WebSocket disabled in development mode
    setIsConnected(false);
  }, []);

  // Handle security alerts with better memory management
  const handleSecurityAlert = useCallback((message: any) => {
    const alert: SecurityAlert = {
      id: `alert-${Date.now()}`,
      type: message.data.type,
      severity: message.data.severity,
      message: message.data.message,
      timestamp: message.timestamp,
      details: message.data.details
    };

    setSecurityAlerts(prev => {
      const newAlerts = [alert, ...prev.slice(0, 49)]; // Keep last 50 alerts
      // Force garbage collection of old objects
      if (prev.length > 50) {
        prev.splice(50); // Remove excess objects
      }
      return newAlerts;
    });
  }, []);

  // Handle session updates with better memory management
  const handleSessionUpdate = useCallback((message: any) => {
    const update: SessionUpdate = {
      sessionId: message.data.sessionId,
      deviceName: message.data.deviceName,
      status: message.data.status,
      timestamp: message.timestamp,
      ipAddress: message.data.ipAddress,
      location: message.data.location
    };

    setSessionUpdates(prev => {
      const newUpdates = [update, ...prev.slice(0, 19)]; // Keep last 20 updates
      // Force garbage collection of old objects
      if (prev.length > 20) {
        prev.splice(20); // Remove excess objects
      }
      return newUpdates;
    });
  }, []);

  // Handle tool access updates with better memory management
  const handleToolAccessUpdate = useCallback((message: any) => {
    const update: ToolAccessUpdate = {
      toolId: message.data.toolId,
      toolName: message.data.toolName,
      action: message.data.action,
      timestamp: message.timestamp,
      dataPoints: message.data.dataPoints || []
    };

    setToolAccessUpdates(prev => {
      const newUpdates = [update, ...prev.slice(0, 19)]; // Keep last 20 updates
      // Force garbage collection of old objects
      if (prev.length > 20) {
        prev.splice(20); // Remove excess objects
      }
      return newUpdates;
    });
  }, []);

  // Handle recovery status updates with better memory management
  const handleRecoveryStatusUpdate = useCallback((message: any) => {
    const update: RecoveryStatusUpdate = {
      requestId: message.data.requestId,
      status: message.data.status,
      timestamp: message.timestamp,
      custodianName: message.data.custodianName
    };

    setRecoveryStatusUpdates(prev => {
      const newUpdates = [update, ...prev.slice(0, 19)]; // Keep last 20 updates
      // Force garbage collection of old objects
      if (prev.length > 20) {
        prev.splice(20); // Remove excess objects
      }
      return newUpdates;
    });
  }, []);

  // Setup WebSocket listeners (disabled in dev mode)
  useEffect(() => {
    // WebSocket disabled in development mode
    // Subscribe to message types
    // websocketManager.on('security-alert', handleSecurityAlert);
    // websocketManager.on('session-update', handleSessionUpdate);
    // websocketManager.on('tool-access', handleToolAccessUpdate);
    // websocketManager.on('recovery-status', handleRecoveryStatusUpdate);

    // Connect to WebSocket
    connect();

    // Cleanup on unmount
    return () => {
      // websocketManager.off('security-alert', handleSecurityAlert);
      // websocketManager.off('session-update', handleSessionUpdate);
      // websocketManager.off('tool-access', handleToolAccessUpdate);
      // websocketManager.off('recovery-status', handleRecoveryStatusUpdate);
      disconnect();
    };
  }, [connect, disconnect, handleSecurityAlert, handleSessionUpdate, handleToolAccessUpdate, handleRecoveryStatusUpdate]);

  // Consolidated timer management - single useEffect for all intervals
  useEffect(() => {
    const intervals: NodeJS.Timeout[] = [];

    // Monitor connection status every 5 seconds (disabled in dev mode)
    // const connectionInterval = setInterval(() => {
    //   const connected = websocketManager.isConnected;
    //   setIsConnected(connected);
    // }, 5000);
    // intervals.push(connectionInterval);

    // Clear old alerts every hour
    const cleanupInterval = setInterval(() => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      setSecurityAlerts(prev => 
        prev.filter(alert => new Date(alert.timestamp) > oneDayAgo)
      );
      
      setSessionUpdates(prev => 
        prev.filter(update => new Date(update.timestamp) > oneDayAgo)
      );
      
      setToolAccessUpdates(prev => 
        prev.filter(update => new Date(update.timestamp) > oneDayAgo)
      );
      
      setRecoveryStatusUpdates(prev => 
        prev.filter(update => new Date(update.timestamp) > oneDayAgo)
      );
    }, 60 * 60 * 1000); // Every hour
    intervals.push(cleanupInterval);

    // Cleanup all intervals on unmount
    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, []);

  return {
    isConnected,
    connectionError,
    securityAlerts,
    sessionUpdates,
    toolAccessUpdates,
    recoveryStatusUpdates,
    connect,
    disconnect,
    clearAlerts: () => setSecurityAlerts([]),
    clearSessionUpdates: () => setSessionUpdates([]),
    clearToolAccessUpdates: () => setToolAccessUpdates([]),
    clearRecoveryStatusUpdates: () => setRecoveryStatusUpdates([])
  };
}; 