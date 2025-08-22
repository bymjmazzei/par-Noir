import React, { useState } from 'react';
import { Shield, CheckCircle, Smartphone, Lock, PartyPopper, User, Settings, XCircle } from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ReactNode;
  isRequired: boolean;
}

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ isOpen, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    passcode: '',
    confirmPasscode: '',
    recoveryEmail: '',
    recoveryPhone: '',
    recoveryContactType: 'email' as 'email' | 'phone'
  });

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Identity Protocol',
      description: 'Let\'s set up your secure digital identity in just a few steps.',
      component: (
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <Shield className="w-16 h-16 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold">Welcome to Identity Protocol</h2>
          <p className="text-lg">
            You&apos;re about to create a secure, user-owned digital identity that puts you in control.
          </p>
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-semibold mb-2">What you&apos;ll get:</h3>
            <ul className="text-left space-y-1">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Secure cryptographic identity</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> User-owned data (no tracking)</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Recovery system with custodians</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Device synchronization</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Privacy controls</li>
            </ul>
          </div>
        </div>
      ),
      isRequired: true
    },
    {
      id: 'identity',
      title: 'Create Your Identity',
      description: 'Set up your username and nickname.',
      component: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full p-3 border rounded-lg bg-bg-primary text-text-primary"
              placeholder="Enter your username"
            />
            <p className="text-xs text-text-secondary mt-1">
              This will be your unique identifier
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Nickname</label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              className="w-full p-3 border rounded-lg bg-bg-primary text-text-primary"
              placeholder="Enter a friendly nickname"
            />
            <p className="text-xs text-text-secondary mt-1">
              This will be displayed in the app
            </p>
          </div>
        </div>
      ),
      isRequired: true
    },
    {
      id: 'security',
      title: 'Set Your Passcode',
      description: 'Create a strong passcode to protect your identity.',
      component: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Passcode</label>
            <input
              type="password"
              value={formData.passcode}
              onChange={(e) => setFormData({ ...formData, passcode: e.target.value })}
              className="w-full p-3 border rounded-lg bg-bg-primary text-text-primary"
              placeholder="Enter a strong passcode"
            />
            <p className="text-xs text-text-secondary mt-1">
              Minimum 8 characters, no spaces
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Confirm Passcode</label>
            <input
              type="password"
              value={formData.confirmPasscode}
              onChange={(e) => setFormData({ ...formData, confirmPasscode: e.target.value })}
              className="w-full p-3 border rounded-lg bg-bg-primary text-text-primary"
              placeholder="Confirm your passcode"
            />
          </div>
          {formData.passcode && formData.confirmPasscode && (
            <div className={`p-3 rounded-lg ${
              formData.passcode === formData.confirmPasscode 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {formData.passcode === formData.confirmPasscode 
                ? <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Passcodes match
                  </div> 
                : <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="w-4 h-4" />
                    Passcodes do not match
                  </div>
              }
            </div>
          )}
        </div>
      ),
      isRequired: true
    },
    {
      id: 'recovery',
      title: 'Recovery Contact',
      description: 'Add a recovery contact for account recovery.',
      component: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Recovery Contact Type</label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.recoveryContactType === 'email'}
                  onChange={() => setFormData({ ...formData, recoveryContactType: 'email' })}
                  className="mr-2"
                />
                Email
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.recoveryContactType === 'phone'}
                  onChange={() => setFormData({ ...formData, recoveryContactType: 'phone' })}
                  className="mr-2"
                />
                Phone
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Recovery {formData.recoveryContactType === 'email' ? 'Email' : 'Phone'}
            </label>
            <input
              type={formData.recoveryContactType === 'email' ? 'email' : 'tel'}
              value={formData.recoveryContactType === 'email' ? formData.recoveryEmail : formData.recoveryPhone}
              onChange={(e) => setFormData({
                ...formData,
                [formData.recoveryContactType === 'email' ? 'recoveryEmail' : 'recoveryPhone']: e.target.value
              })}
              className="w-full p-3 border rounded-lg bg-bg-primary text-text-primary"
              placeholder={`Enter your ${formData.recoveryContactType}`}
            />
            <p className="text-xs text-text-secondary mt-1">
              Used for account recovery only
            </p>
          </div>
        </div>
      ),
      isRequired: false
    },
    {
      id: 'custodians',
      title: 'Recovery Custodians',
      description: 'Set up trusted custodians for account recovery.',
      component: (
        <div className="space-y-4">
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Recovery Custodians</h3>
            <p className="text-sm mb-4">
              Custodians are trusted people who can help you recover your account if you lose access.
            </p>
            <div className="space-y-2">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-primary rounded-full mr-2"></div>
                <span className="text-sm">You need at least 2 custodians</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-primary rounded-full mr-2"></div>
                <span className="text-sm">Custodians can be friends, family, or trusted contacts</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-primary rounded-full mr-2"></div>
                <span className="text-sm">You can add custodians later in the app</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-primary rounded-full mr-2"></div>
                <span className="text-sm">Simple process - just add their contact information</span>
              </div>
            </div>
          </div>
          <div className="text-center">
            <button
              onClick={() => setCompletedSteps(new Set([...completedSteps, 'custodians']))}
              className="px-6 py-2 bg-primary text-bg-primary rounded-lg hover:bg-hover"
            >
              Continue to Setup
            </button>
          </div>
        </div>
      ),
      isRequired: true
    },
    {
      id: 'complete',
      title: 'Setup Complete!',
      description: 'Your identity is ready to use.',
      component: (
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <PartyPopper className="w-16 h-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold">Setup Complete!</h2>
          <p className="text-lg">
            Your secure digital PN has been created successfully.
          </p>
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Next Steps:</h3>
            <ul className="text-left space-y-1">
              <li className="flex items-center gap-2"><Lock className="w-4 h-4 text-blue-500" /> Your PN is now secure and encrypted</li>
              <li className="flex items-center gap-2"><User className="w-4 h-4 text-blue-500" /> Add recovery custodians for account safety</li>
              <li className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-blue-500" /> Sync your devices for seamless access</li>
              <li className="flex items-center gap-2"><Settings className="w-4 h-4 text-blue-500" /> Configure privacy settings to your preference</li>
            </ul>
          </div>
        </div>
      ),
      isRequired: true
    }
  ];

  const currentStepData = steps[currentStep];
  const isStepValid = () => {
    switch (currentStepData.id) {
      case 'identity':
        return formData.username.trim() && formData.nickname.trim();
      case 'security':
        return formData.passcode.length >= 8 && formData.passcode === formData.confirmPasscode;
      case 'recovery':
        return true; // Optional step
      case 'custodians':
        return completedSteps.has('custodians');
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCompletedSteps(new Set([...completedSteps, currentStepData.id]));
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    setCompletedSteps(new Set([...completedSteps, currentStepData.id]));
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-primary rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Step {currentStep + 1} of {steps.length}</span>
              <span className="text-sm text-text-secondary">
                {Math.round(((currentStep + 1) / steps.length) * 100)}% Complete
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-2">{currentStepData.title}</h2>
            <p className="text-text-secondary mb-4">{currentStepData.description}</p>
            {currentStepData.component}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="px-4 py-2 text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              Back
            </button>
            
            <div className="flex space-x-2">
              {!currentStepData.isRequired && (
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-text-secondary hover:text-text-primary"
                >
                  Skip
                </button>
              )}
              
              <button
                onClick={handleNext}
                disabled={!isStepValid()}
                className="px-6 py-2 bg-primary text-bg-primary rounded-lg hover:bg-hover disabled:opacity-50"
              >
                {currentStep === steps.length - 1 ? 'Complete' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 