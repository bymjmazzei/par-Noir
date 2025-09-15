import React, { useState } from 'react';

interface DashboardDropdownProps {
  onNavigate: (section: string) => void;
  onLogout: () => void;
  authenticatedUser: any;
}

const DashboardDropdown: React.FC<DashboardDropdownProps> = ({ 
  onNavigate, 
  onLogout, 
  authenticatedUser 
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const menuItems = [
    {
      id: 'profile',
      label: 'Profile',
      icon: '👤',
      description: 'View and edit your profile'
    },
    {
      id: 'security',
      label: 'Security',
      icon: '🛡️',
      description: 'Security settings and recovery'
    },
    {
      id: 'custodians',
      label: 'Custodians',
      icon: '👥',
      description: 'Manage recovery custodians'
    },
    {
      id: 'devices',
      label: 'Devices',
      icon: '📱',
      description: 'Connected devices and sync'
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: '🔗',
      description: 'Third-party integrations'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      description: 'App preferences and configuration'
    }
  ];

  const handleItemClick = (section: string) => {
    onNavigate(section);
    setShowDropdown(false);
  };

  const handleLogout = () => {
    onLogout();
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      {/* Dashboard Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="p-2 rounded-lg hover:bg-hover transition-colors text-text-primary"
        title="Dashboard"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>

      {/* Dashboard Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-72 bg-modal-bg border border-border rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                {authenticatedUser?.nickname?.charAt(0) || authenticatedUser?.username?.charAt(0) || 'U'}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {authenticatedUser?.nickname || authenticatedUser?.username || 'User'}
                </h3>
                <p className="text-xs text-text-secondary">
                  {authenticatedUser?.email || 'No email'}
                </p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="w-full px-4 py-3 text-left hover:bg-hover transition-colors flex items-center space-x-3"
              >
                <span className="text-lg">{item.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {item.label}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {item.description}
                  </div>
                </div>
                <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Logout */}
          <div className="p-2">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center space-x-3 text-red-600 dark:text-red-400"
            >
              <span className="text-lg">🚪</span>
              <div className="flex-1">
                <div className="text-sm font-medium">Lock Identity</div>
                <div className="text-xs text-text-secondary">Sign out and lock your identity</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default DashboardDropdown;
