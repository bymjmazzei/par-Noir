import React from 'react';

interface DataAccessRequest {
  id: string;
  requester: string;
  requestedData: string[];
  purpose: string;
  timestamp: string;
}

interface DataAccessRequestsProps {
  requests: DataAccessRequest[];
  onRequestResponse: (requestId: string, approved: boolean) => void;
}

export const DataAccessRequests: React.FC<DataAccessRequestsProps> = React.memo(({ 
  requests, 
  onRequestResponse 
}) => {
  if (requests.length === 0) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Pending Requests
        </h3>
        <div className="text-center py-8">
          <div className="text-3xl font-bold text-gray-300 mb-2">0</div>
          <p className="text-gray-600 dark:text-gray-400">No pending requests</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Pending Data Access Requests
      </h3>
      <div className="space-y-4">
        {requests.map((request) => (
          <div key={request.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  {request.requester}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {request.purpose}
                </p>
                <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <span>Requested: {request.requestedData.join(', ')}</span>
                  <span>•</span>
                  <span>{new Date(request.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => onRequestResponse(request.id, true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Approve
                </button>
                <button
                  onClick={() => onRequestResponse(request.id, false)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

DataAccessRequests.displayName = 'DataAccessRequests';
