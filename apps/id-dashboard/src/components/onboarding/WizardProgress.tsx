import React from 'react';
import { CheckCircle } from 'lucide-react';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  infoContent: string;
  isCompleted?: boolean;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  completedSteps: Set<string>;
}

export const WizardProgress: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  steps,
  currentStep,
  completedSteps
}) => {
  return (
    <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-center justify-between w-full">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            <div
              className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium flex-shrink-0 ${
                index <= currentStep
                  ? 'bg-blue-600 dark:bg-primary text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}
            >
              {completedSteps.has(step.id) ? (
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
              ) : (
                index + 1
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-1 sm:mx-2 ${
                  index < currentStep ? 'bg-blue-600 dark:bg-primary' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
