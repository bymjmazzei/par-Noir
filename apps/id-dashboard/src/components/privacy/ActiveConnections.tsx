import React from 'react';

interface ActiveConnection {
  id: string;
  name: string;
  grantedData: string[];
  grantedAt: string;
  lastUsed: string;
}

interface ActiveConnectionsProps {
  connections: ActiveConnection[];
  onRevokeConnection: (connectionId: string) => void;
}

export const ActiveConnections: React.FC<ActiveConnectionsProps> = React.memo(({ 
  connections, 
  onRevokeConnection 
}) => {
  if (connections.length === 0) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Active Data Connections
        </h3>
        <div className="text-center py-8">
          <div className="text-3xl font-bold text-blue-300 mb-2">0</div>
          <p className="text-gray-600 dark:text-gray-400">No active connections</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Active Data Connections
      </h3>
      <div className="space-y-4">
        {connections.map((connection) => (
          <div key={connection.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  {connection.name}
                </h4>
                <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>Access to: {connection.grantedData.join(', ')}</span>
                  <span>•</span>
                  <span>Granted: {new Date(connection.grantedAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Last used: {new Date(connection.lastUsed).toLocaleDateString()}</span>
                </div>
              </div>
              
              <button
                onClick={() => onRevokeConnection(connection.id)}
                className="px-3 py-1 text-red-600 hover:text-red-700 transition-colors text-sm"
              >
                Revoke Access
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

ActiveConnections.displayName = 'ActiveConnections';
