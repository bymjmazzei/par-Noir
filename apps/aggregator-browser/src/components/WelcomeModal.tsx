/**
 * Welcome Modal Component
 * Onboarding flow for first-time users
 */

import React, { useState } from 'react';
import { X, ArrowRight, Shield, Users, Sparkles, Globe } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { PNConnect } from './PNConnect';

interface WelcomeModalProps {
  onClose: () => void;
  onComplete?: () => void;
}

export function WelcomeModal({ onClose, onComplete }: WelcomeModalProps) {
  const { userState } = useUserState();
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: <Globe className="h-12 w-12 text-blue-400" />,
      title: 'Welcome to par Noir Browser',
      description: 'Discover decentralized social media content from creators around the world. Everything is peer-to-peer and user-curated.',
      action: 'Get Started'
    },
    {
      icon: <Shield className="h-12 w-12 text-blue-400" />,
      title: 'Content Ratings',
      description: 'All content is self-rated by creators. Set your preferences to see only content that matches your comfort level.',
      action: 'Set Preferences'
    },
    {
      icon: <Sparkles className="h-12 w-12 text-blue-400" />,
      title: 'Curated Feeds',
      description: 'Subscribe to feeds organized by niche categories. Build your custom algorithm by choosing what interests you.',
      action: 'Browse Feeds'
    },
    {
      icon: <Users className="h-12 w-12 text-blue-400" />,
      title: 'Connect Your pN',
      description: 'Unlock full engagement features by connecting your par Noir identity. Like, comment, and interact with creators.',
      action: userState.isUnlocked ? 'Continue' : 'Connect pN'
    }
  ];

  const currentStep = steps[step];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete?.();
      onClose();
    }
  };

  const handleSkip = () => {
    onComplete?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <div className="flex items-center space-x-2">
            <span className="text-text-secondary text-sm">
              Step {step + 1} of {steps.length}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center text-center">
          <div className="mb-6">
            {currentStep.icon}
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">
            {currentStep.title}
          </h2>
          <p className="text-text-secondary text-lg mb-8 max-w-md">
            {currentStep.description}
          </p>

          {/* Step-specific content */}
          {step === 1 && (
            <div className="w-full max-w-md mb-8">
              <p className="text-text-secondary text-sm mb-4">
                Your current rating preference: <span className="text-white font-medium">{userState.preferences.maxRating}</span>
              </p>
              <p className="text-text-secondary text-xs">
                You can change this anytime in Settings
              </p>
            </div>
          )}

          {step === 3 && !userState.isUnlocked && (
            <div className="w-full max-w-md mb-8">
              <PNConnect compact />
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center space-x-2 p-4 border-t border-neutral-700">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all ${
                idx === step
                  ? 'w-8 bg-blue-600'
                  : idx < step
                  ? 'w-2 bg-blue-400'
                  : 'w-2 bg-neutral-700'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-neutral-700">
          <button
            onClick={handleSkip}
            className="text-text-secondary hover:text-white transition-colors"
          >
            Skip Tour
          </button>
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <span>{currentStep.action}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

