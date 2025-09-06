import React from 'react';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';

interface WizardFooterProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const WizardFooter: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  isFirstStep,
  isLastStep,
  onSkip,
  onPrevious,
  onNext
}) => {
  return (
    <div className="flex items-center justify-between p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <button
        onClick={onSkip}
        className="flex items-center space-x-2 text-gray-600 dark:text-text-secondary hover:text-gray-800 dark:hover:text-text-primary transition-colors"
      >
        <SkipForward className="w-4 h-4" />
        <span>Skip Wizard</span>
      </button>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {!isFirstStep && (
          <button
            onClick={onPrevious}
            className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 text-gray-600 dark:text-text-secondary hover:text-gray-800 dark:hover:text-text-primary transition-colors text-sm sm:text-base"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous</span>
            <span className="sm:hidden">Prev</span>
          </button>
        )}
        
        <button
          onClick={onNext}
          className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 bg-blue-600 dark:bg-primary text-white rounded-md hover:bg-blue-700 dark:hover:bg-primary-dark transition-colors text-sm sm:text-base"
        >
          <span>{isLastStep ? 'Finish' : 'Next'}</span>
          {!isLastStep && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
