import React, { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface MockGoogleOAuthProps {
  onAuthSuccess: (token: string, user: { email: string; name: string; picture?: string }) => void;
  onAuthError: (error: string) => void;
  onClose: () => void;
}

export const MockGoogleOAuth: React.FC<MockGoogleOAuthProps> = ({
  onAuthSuccess,
  onAuthError,
  onClose
}) => {
  const [step, setStep] = useState<'select-account' | 'consent' | 'loading' | 'success'>('select-account');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Mock user accounts for selection
  const mockUsers = [
    {
      email: 'demo@parnoir.com',
      password: 'demo123',
      name: 'par Noir Demo User',
      picture: 'https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=PN',
      lastActive: 'Active now'
    },
    {
      email: 'john.smith@gmail.com',
      password: 'password123',
      name: 'John Smith',
      picture: 'https://via.placeholder.com/40x40/10B981/FFFFFF?text=JS',
      lastActive: '2 hours ago'
    },
    {
      email: 'jane.doe@gmail.com',
      password: 'demo456',
      name: 'Jane Doe',
      picture: 'https://via.placeholder.com/40x40/F59E0B/FFFFFF?text=JD',
      lastActive: '1 day ago'
    },
    {
      email: 'alex.chen@gmail.com',
      password: 'demo789',
      name: 'Alex Chen',
      picture: 'https://via.placeholder.com/40x40/8B5CF6/FFFFFF?text=AC',
      lastActive: '3 days ago'
    }
  ];

  const handleAccountSelect = async (user: typeof mockUsers[0]) => {
    setEmail(user.email);
    setStep('loading');
    
    // Simulate quick authentication (no password needed)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setStep('consent');
  };


  const handleConsent = async () => {
    setStep('loading');
    
    // Simulate OAuth token generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const token = `mock_oauth_token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const user = mockUsers.find(u => u.email === email);
    
    if (user) {
      setStep('success');
      
      // Wait a moment then call success callback
      setTimeout(() => {
        onAuthSuccess(token, {
          email: user.email,
          name: user.name,
          picture: user.picture
        });
      }, 1000);
    }
  };

  const handleCancel = () => {
    onAuthError('Authentication cancelled by user');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <span className="font-medium text-gray-900">Google</span>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'select-account' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Choose an account</h2>
                <p className="text-gray-600">to continue to par Noir</p>
              </div>

              <div className="space-y-2">
                {mockUsers.map((user, index) => (
                  <button
                    key={user.email}
                    onClick={() => handleAccountSelect(user)}
                    className="w-full flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                    <div className="text-xs text-gray-400">{user.lastActive}</div>
                  </button>
                ))}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <button
                  onClick={handleCancel}
                  className="w-full text-center text-blue-600 hover:text-blue-700 font-medium"
                >
                  Use another account
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 font-medium mb-2">Demo Accounts:</p>
                <div className="text-xs text-blue-700 space-y-1">
                  <div>• demo@parnoir.com / demo123</div>
                  <div>• john.smith@gmail.com / password123</div>
                  <div>• jane.doe@gmail.com / demo456</div>
                  <div>• alex.chen@gmail.com / demo789</div>
                </div>
              </div>
            </div>
          )}


          {step === 'consent' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">par Noir wants to access your Google Account</h2>
                <p className="text-gray-600">This will allow par Noir to manage your Google Drive files securely</p>
              </div>

              {/* Selected Account Display */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={mockUsers.find(u => u.email === email)?.picture || ''}
                    alt="Selected account"
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {mockUsers.find(u => u.email === email)?.name}
                    </div>
                    <div className="text-xs text-gray-500">{email}</div>
                  </div>
                  <button
                    onClick={() => setStep('select-account')}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Switch account
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <img
                    src="https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=PN"
                    alt="par Noir"
                    className="w-10 h-10 rounded-lg"
                  />
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">par Noir</h3>
                    <p className="text-sm text-gray-600">Secure file management with decentralized identity</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">This app wants to:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>View and manage your Google Drive files</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Upload files to your Google Drive</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Download files from your Google Drive</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Delete files from your Google Drive</span>
                  </li>
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Security Note:</strong> All files are encrypted with AES-256-GCM using your decentralized identity. 
                  Google Drive only sees encrypted content.
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConsent}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Allow
                </button>
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Setting up your account</h2>
              <p className="text-gray-600">Please wait while we configure your secure access...</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Success!</h2>
              <p className="text-gray-600">You're now connected to Google Drive with par Noir</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
