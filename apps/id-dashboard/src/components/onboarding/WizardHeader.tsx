import React from 'react';
import { X, HelpCircle } from 'lucide-react';

interface WizardHeaderProps {
  currentStepData: {
    icon: React.ReactNode;
    title: string;
  };
  currentStep: number;
  totalSteps: number;
  showInfo: boolean;
  onToggleInfo: () => void;
  onClose: () => void;
}

export const WizardHeader: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  currentStepData,
  currentStep,
  totalSteps,
  showInfo,
  onToggleInfo,
  onClose
}) => {
  return (
    <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          {currentStepData.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-text-primary truncate">
            {currentStepData.title}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-text-secondary">
            Step {currentStep + 1} of {totalSteps}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleInfo}
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
  );
};
