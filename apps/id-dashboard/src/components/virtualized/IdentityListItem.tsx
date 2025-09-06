import React from 'react';

interface IdentityItem {
  id: string;
  pnName: string;
  displayName?: string;
  email?: string;
  status: string;
  createdAt: string;
  isEncrypted?: boolean;
}

interface IdentityListItemProps {
  identity: IdentityItem;
}

export const IdentityListItem: React.FC<IdentityListItemProps> = React.memo(({ identity }) => {
  return (
    <div className="flex items-center p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-4">
        <span className="text-white font-medium text-sm">
          {identity.displayName?.[0] || identity.pnName[0]}
        </span>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {identity.displayName || identity.pnName}
          </h3>
          {identity.isEncrypted && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Encrypted
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{identity.pnName}</span>
          {identity.email && <span>{identity.email}</span>}
          <span className={`px-2 py-0.5 rounded ${
            identity.status === 'active' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
          }`}>
            {identity.status}
          </span>
        </div>
      </div>
      
      <div className="flex-shrink-0 text-xs text-gray-400">
        {new Date(identity.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
});

IdentityListItem.displayName = 'IdentityListItem';
