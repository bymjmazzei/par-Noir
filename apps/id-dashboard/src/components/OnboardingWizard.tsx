import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Info, 
  User, 
  Shield, 
  Download, 
  Users, 
  Smartphone, 
  Settings,
  CheckCircle,
  SkipForward,
  HelpCircle
} from 'lucide-react';

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  currentUser?: any;
  onUpdateNickname?: (nickname: string) => void;
  onSetupCustodians?: () => void;
  onExportID?: () => void;
  onExportRecoveryKey?: () => void;
  onNavigateToSection?: (section: string) => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  infoContent: string;
  isCompleted?: boolean;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  currentUser,
  onUpdateNickname,
  onSetupCustodians,
  onExportID,
  onExportRecoveryKey,
  onNavigateToSection
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [nickname, setNickname] = useState(currentUser?.nickname || '');
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const steps: WizardStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Your Identity Dashboard!',
      description: 'Let\'s get you set up with the essential features to make the most of your new digital identity.',
      icon: <User className="w-8 h-8 text-blue-600" />,
      infoContent: `Your Identity Dashboard is your personal command center for managing your digital identity. 
      
Here you can:
• Set up your identity nickname for easy recognition
• Configure recovery custodians to protect your identity
• Export your identity and recovery keys for backup
• Manage privacy settings and security features
• Sync your identity across multiple devices

This wizard will guide you through each important feature step by step. You can skip any step or come back to it later.`
    },
    {
      id: 'nickname',
      title: 'Set Your Identity Nickname',
      description: 'Choose a friendly nickname to easily identify this identity across your devices.',
      icon: <User className="w-8 h-8 text-green-600" />,
      action: () => {
        if (onUpdateNickname && nickname.trim()) {
          onUpdateNickname(nickname.trim());
          setCompletedSteps(prev => new Set([...prev, 'nickname']));
        }
      },
      infoContent: `Your identity nickname is a user-friendly name that helps you identify this identity across different devices and applications.

Key benefits:
• Easy recognition when you have multiple identities
• Shown instead of the complex DID string
• Helps you quickly identify the right identity
• Can be changed anytime without affecting your DID

The nickname is stored locally on your device and is not shared with external services unless you explicitly choose to do so.`
    },
    {
      id: 'custodians',
      title: 'Set Up Recovery Custodians',
      description: 'Add trusted people or services who can help you recover your identity if needed.',
      icon: <Users className="w-8 h-8 text-purple-600" />,
      action: () => {
        if (onSetupCustodians) {
          onSetupCustodians();
          setCompletedSteps(prev => new Set([...prev, 'custodians']));
        }
      },
      infoContent: `Recovery custodians are trusted people or services who can help you recover access to your identity if you lose your device or forget your passcode.

How it works:
• You add 2-5 trusted custodians (people or services)
• Each custodian gets a secure invitation
• If you need recovery, custodians approve your request
• Once approved, you can regain access to your identity

Security features:
• Custodians can only approve recovery requests
• They cannot access your private data
• You can remove or change custodians anytime
• Recovery requires approval from multiple custodians

This is crucial for protecting your identity - without custodians, you could permanently lose access if something happens to your device.`
    },
    {
      id: 'export-id',
      title: 'Export Your Identity',
      description: 'Create a secure backup of your identity that you can store safely.',
      icon: <Download className="w-8 h-8 text-orange-600" />,
      action: () => {
        if (onExportID) {
          onExportID();
          setCompletedSteps(prev => new Set([...prev, 'export-id']));
        }
      },
      infoContent: `Exporting your identity creates an encrypted backup file that contains all your identity data.

What's included in the export:
• Your encrypted DID document
• Your nickname and metadata
• Recovery custodian information
• Privacy settings and preferences

Security features:
• The export file is encrypted with your passcode
• Only you can decrypt and use the backup
• Store it in a secure location (password manager, safe, etc.)
• You can import it on other devices if needed

Important: Keep this backup safe! It's your lifeline if you need to restore your identity on a new device.`
    },
    {
      id: 'recovery-key',
      title: 'Export Recovery Key',
      description: 'Generate a recovery key as an additional backup method.',
      icon: <Shield className="w-8 h-8 text-red-600" />,
      action: () => {
        if (onExportRecoveryKey) {
          onExportRecoveryKey();
          setCompletedSteps(prev => new Set([...prev, 'recovery-key']));
        }
      },
      infoContent: `A recovery key is a cryptographic key that provides an additional way to recover your identity.

How recovery keys work:
• Generate a unique cryptographic key
• Store it securely (password manager, safe, etc.)
• Use it to recover your identity if needed
• Works independently of custodians

Security features:
• The key is cryptographically secure
• Can be used on any device
• Provides immediate recovery access
• Can be revoked and regenerated

Best practices:
• Store in multiple secure locations
• Don't share with anyone
• Consider it as important as your passcode
• Test recovery process periodically

This gives you a backup recovery method in addition to your custodians.`
    },
    {
      id: 'devices',
      title: 'Sync Across Devices',
      description: 'Learn how to access your identity on multiple devices securely.',
      icon: <Smartphone className="w-8 h-8 text-indigo-600" />,
      action: () => {
        if (onNavigateToSection) {
          onNavigateToSection('devices');
          setCompletedSteps(prev => new Set([...prev, 'devices']));
        }
      },
      infoContent: `You can securely sync your identity across multiple devices using QR codes and encrypted keys.

How device syncing works:
• Generate a QR code on your current device
• Scan the QR code with your other device
• Both devices are now securely paired
• Your identity syncs automatically between devices

Security features:
• Each device has its own encryption keys
• Data is encrypted in transit
• You can revoke device access anytime
• Devices are authenticated before syncing

Supported devices:
• Smartphones and tablets
• Desktop and laptop computers
• Web browsers (PWA mode)
• Any device with a camera for QR scanning

This allows you to access your identity from anywhere while maintaining security.`
    },
    {
      id: 'privacy',
      title: 'Privacy & Security Settings',
      description: 'Configure how your identity data is shared and protected.',
      icon: <Settings className="w-8 h-8 text-teal-600" />,
      action: () => {
        if (onNavigateToSection) {
          onNavigateToSection('privacy');
          setCompletedSteps(prev => new Set([...prev, 'privacy']));
        }
      },
      infoContent: `Your privacy and security settings control how your identity data is shared and protected.

Privacy controls:
• Choose what data to share with third-party tools
• Control analytics and marketing preferences
• Manage data retention policies
• Set granular permissions per application

Security features:
• Session timeout settings
• Biometric authentication options
• Device management and revocation
• Security alerts and notifications

Zero-knowledge features:
• Prove claims without revealing data
• Selective disclosure of information
• Privacy-preserving authentication
• Unlinkable identity verification

These settings help you maintain control over your digital identity while using it across different services.`
    },
    {
      id: 'complete',
      title: 'You\'re All Set!',
      description: 'Your identity is configured and ready to use. You can always access these features from the dashboard.',
      icon: <CheckCircle className="w-8 h-8 text-green-600" />,
      infoContent: `Congratulations! You've successfully set up your digital identity with all the essential features.

What you've accomplished:
• Created a secure, user-owned digital identity
• Set up recovery mechanisms to protect your identity
• Configured privacy and security settings
• Learned how to manage your identity across devices

Next steps:
• Explore the dashboard to discover additional features
• Test the recovery process to ensure it works
• Set up additional identities if needed
• Start using your identity with compatible services

Remember:
• Keep your backups secure and up to date
• Regularly review your privacy settings
• Test recovery procedures periodically
• Your identity is yours - you have complete control

You can always return to this wizard or access any feature from the main dashboard.`
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setShowInfo(false);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setShowInfo(false);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleStepAction = () => {
    const step = steps[currentStep];
    if (step.action) {
      step.action();
    }
  };

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-modal-bg rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            {currentStepData.icon}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-text-primary">
                {currentStepData.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-text-secondary">
                Step {currentStep + 1} of {steps.length}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 text-gray-500 dark:text-text-secondary hover:text-gray-700 dark:hover:text-text-primary transition-colors"
              title="More information"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 dark:text-text-secondary hover:text-gray-700 dark:hover:text-text-primary transition-colors"
              title="Close wizard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center space-x-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index <= currentStep
                      ? 'bg-blue-600 dark:bg-primary text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {completedSteps.has(step.id) ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-12 h-1 mx-2 ${
                      index < currentStep ? 'bg-blue-600 dark:bg-primary' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {showInfo ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-700 dark:text-text-primary whitespace-pre-line">
                  {currentStepData.infoContent}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-gray-700 dark:text-text-primary leading-relaxed">
                {currentStepData.description}
              </p>

              {/* Step-specific content */}
              {currentStepData.id === 'nickname' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-2">
                      Identity Nickname
                    </label>
                    <input
                      type="text"
                      id="nickname"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Enter a friendly nickname for this identity"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-primary focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-text-primary placeholder-gray-500 dark:placeholder-gray-400"
                    />
                  </div>
                  <button
                    onClick={handleStepAction}
                    disabled={!nickname.trim()}
                    className="w-full bg-blue-600 dark:bg-primary text-white py-2 px-4 rounded-md hover:bg-blue-700 dark:hover:bg-primary-dark disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    Set Nickname
                  </button>
                </div>
              )}

              {currentStepData.id === 'custodians' && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      <strong>Important:</strong> Setting up recovery custodians is crucial for protecting your identity. 
                      You'll need at least 2 custodians to create your identity.
                    </p>
                  </div>
                  <button
                    onClick={handleStepAction}
                    className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors"
                  >
                    Set Up Custodians
                  </button>
                </div>
              )}

              {currentStepData.id === 'export-id' && (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                    <p className="text-sm text-green-800 dark:text-green-300">
                      <strong>Backup your identity:</strong> This creates an encrypted file that you can use to restore your identity on other devices.
                    </p>
                  </div>
                  <button
                    onClick={handleStepAction}
                    className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
                  >
                    Export Identity
                  </button>
                </div>
              )}

              {currentStepData.id === 'recovery-key' && (
                <div className="space-y-4">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-sm text-red-800 dark:text-red-300">
                      <strong>Additional security:</strong> A recovery key provides another way to recover your identity if needed.
                    </p>
                  </div>
                  <button
                    onClick={handleStepAction}
                    className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
                  >
                    Generate Recovery Key
                  </button>
                </div>
              )}

              {currentStepData.id === 'devices' && (
                <div className="space-y-4">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
                    <p className="text-sm text-indigo-800 dark:text-indigo-300">
                      <strong>Multi-device access:</strong> Learn how to securely sync your identity across multiple devices using QR codes.
                    </p>
                  </div>
                  <button
                    onClick={handleStepAction}
                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Go to Device Settings
                  </button>
                </div>
              )}

              {currentStepData.id === 'privacy' && (
                <div className="space-y-4">
                  <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
                    <p className="text-sm text-teal-800 dark:text-teal-300">
                      <strong>Privacy control:</strong> Configure how your identity data is shared and protected across different services.
                    </p>
                  </div>
                  <button
                    onClick={handleStepAction}
                    className="w-full bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 transition-colors"
                  >
                    Go to Privacy Settings
                  </button>
                </div>
              )}

              {currentStepData.id === 'complete' && (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-gray-700 dark:text-text-primary">
                    You've successfully completed the setup! Your identity is now ready to use.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={handleSkip}
            className="flex items-center space-x-2 text-gray-600 dark:text-text-secondary hover:text-gray-800 dark:hover:text-text-primary transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            <span>Skip Wizard</span>
          </button>

          <div className="flex items-center space-x-3">
            {!isFirstStep && (
              <button
                onClick={handlePrevious}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-text-secondary hover:text-gray-800 dark:hover:text-text-primary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
            )}
            
            <button
              onClick={handleNext}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 dark:bg-primary text-white rounded-md hover:bg-blue-700 dark:hover:bg-primary-dark transition-colors"
            >
              <span>{isLastStep ? 'Finish' : 'Next'}</span>
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
