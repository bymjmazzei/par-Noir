import React from 'react';

interface StatsCardsProps {
  activeConnectionsCount: number;
  pendingRequestsCount: number;
}

export const StatsCards: React.FC<StatsCardsProps> = React.memo(({ 
  activeConnectionsCount, 
  pendingRequestsCount 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Active Connections
        </h3>
        <div className="text-3xl font-bold text-blue-600 mb-2">
          {activeConnectionsCount}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {activeConnectionsCount === 0 
            ? 'No active connections' 
            : 'Apps with data access'
          }
        </p>
      </div>

      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Pending Requests
        </h3>
        <div className="text-3xl font-bold text-orange-600 mb-2">
          {pendingRequestsCount}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {pendingRequestsCount === 0 
            ? 'No pending requests' 
            : 'Awaiting your approval'
          }
        </p>
      </div>
    </div>
  );
});

StatsCards.displayName = 'StatsCards';
