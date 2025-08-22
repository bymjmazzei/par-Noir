import React, { useState, useEffect } from 'react';

interface ActiveSession {
  id: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'other';
  ipAddress: string;
  location: string;
  lastActivity: string;
  isCurrent: boolean;
  userAgent: string;
}

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SessionManager: React.FC<SessionManagerProps> = ({
  isOpen,
  onClose
}) => {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = async () => {
    try {
      // Mock sessions for now - implement actual session management later
      const mockSessions: ActiveSession[] = [
        {
          id: 'session-1',
          deviceName: 'Current Device',
          deviceType: 'desktop',
          ipAddress: '192.168.1.1',
          location: 'Local Network',
          lastActivity: new Date().toISOString(),
          isCurrent: true,
          userAgent: navigator.userAgent
        }
      ];
      setSessions(mockSessions);
    } catch (error) {
      // Handle error silently
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      // Mock implementation - implement actual session termination later
      console.log('Terminating session:', sessionId);
      await loadSessions();
    } catch (error) {
      // Handle error silently
    }
  };

  const terminateAllOtherSessions = async () => {
    try {
      // Mock implementation - implement actual session termination later
      console.log('Terminating all other sessions');
      await loadSessions();
    } catch (error) {
      // Handle error silently
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile': return '📱';
      case 'desktop': return '💻';
      case 'tablet': return '📱';
      default: return '🖥️';
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-text-primary">Active Sessions</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Session Info */}
            <div className="bg-secondary rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2 text-text-primary">Current Session</h3>
              <p className="text-sm text-text-secondary">
                This is your current active session. You cannot terminate it from here.
              </p>
            </div>

            {/* Sessions List */}
            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getDeviceIcon(session.deviceType)}</span>
                      <div>
                        <div className="font-medium text-text-primary">
                          {session.deviceName}
                          {session.isCurrent && (
                            <span className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-secondary">
                          {session.ipAddress} • {session.location}
                        </div>
                        <div className="text-xs text-text-secondary">
                          Last activity: {getTimeAgo(session.lastActivity)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!session.isCurrent && (
                        <button
                          onClick={() => terminateSession(session.id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                          Terminate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-border">
              <div className="text-sm text-text-secondary">
                {sessions.filter(s => !s.isCurrent).length} other active sessions
              </div>
              <div className="space-x-3">
                <button
                  onClick={terminateAllOtherSessions}
                  disabled={sessions.filter(s => !s.isCurrent).length === 0}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Terminate All Others
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-modal-bg transition-colors text-text-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 