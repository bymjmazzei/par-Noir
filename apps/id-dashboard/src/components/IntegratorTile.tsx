import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StandardDataPoint, STANDARD_DATA_POINTS } from '../types/standardDataPoints';

interface IntegratorTileProps {
  toolId: string;
  toolName: string;
  toolDescription: string;
  dataPoints: string[];
  requiredDataPoints: string[]; // Set by third party - read-only
  optionalDataPoints: string[]; // Set by third party - read-only
  onToggleDataPoint: (dataPointId: string, enabled: boolean) => void;
  globalDataPointSettings: Record<string, { globalSetting: boolean }>;
}

export const IntegratorTile: React.FC<IntegratorTileProps> = ({
  toolId,
  toolName,
  toolDescription,
  dataPoints,
  requiredDataPoints,
  optionalDataPoints,
  onToggleDataPoint,
  globalDataPointSettings
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get all available data points (excluding sensitive ones)
  const getAvailableDataPoints = (): StandardDataPoint[] => {
    return Object.values(STANDARD_DATA_POINTS).filter(
      (dp: StandardDataPoint) => 
        // NEVER allow access to pN File, pN Name, or passcode
        dp.id !== 'pn_file' && 
        dp.id !== 'pn_name' && 
        dp.id !== 'passcode' &&
        // Only show data points that are in the tool's requested list
        dataPoints.includes(dp.id)
    );
  };

  const availableDataPoints = getAvailableDataPoints();

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="font-medium text-sm text-text-primary flex-1">
          {toolName}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-text-secondary" />
        ) : (
          <ChevronDown className="w-5 h-5 text-text-secondary" />
        )}
      </div>
      
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border">
          {toolDescription && (
            <p className="text-xs text-text-secondary mt-3 mb-4">{toolDescription}</p>
          )}
          
          <div className="space-y-3">
            <h6 className="text-xs font-medium text-text-primary">Data Point Permissions:</h6>
            {availableDataPoints.length === 0 ? (
              <p className="text-xs text-text-secondary">No data points requested</p>
            ) : (
              availableDataPoints.map((dataPoint) => {
                const isEnabled = dataPoints.includes(dataPoint.id);
                const isRequired = requiredDataPoints.includes(dataPoint.id);
                const isOptional = optionalDataPoints.includes(dataPoint.id);
                const globalSetting = globalDataPointSettings[dataPoint.id]?.globalSetting ?? true;
                const isLocked = globalSetting === false; // Locked if globally disabled

                return (
                  <div 
                    key={dataPoint.id} 
                    className="flex items-center justify-between p-3 bg-secondary rounded border border-border"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-medium text-text-primary">{dataPoint.name}</div>
                      <div className="text-xs text-text-secondary mt-1">{dataPoint.description}</div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Required/Optional indicator (read-only, set by third party) */}
                      <span className={`text-xs px-2 py-1 rounded border ${
                        isRequired 
                          ? 'text-red-600 border-red-300' 
                          : 'text-blue-600 border-blue-300'
                      }`}>
                        {isRequired ? 'Required' : 'Optional'}
                      </span>
                      
                      {/* Grant/Deny toggle (user controls this) - no background */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isLocked && !isRequired) {
                            onToggleDataPoint(dataPoint.id, !isEnabled);
                          }
                        }}
                        disabled={isLocked || isRequired} // Required data points must be enabled
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-2 ${
                          isEnabled && !isLocked
                            ? 'border-primary' 
                            : 'border-border'
                        } ${isLocked || isRequired ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        aria-label={isEnabled ? 'Revoke access' : 'Grant access'}
                        title={isRequired ? 'Required by third party - must grant access' : isEnabled ? 'Revoke access to this data point' : 'Grant access to this data point'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                            isEnabled && !isLocked
                              ? 'bg-primary translate-x-6' 
                              : 'bg-gray-400 translate-x-1'
                          }`}
                        />
                      </button>
                      
                      {isRequired && !isEnabled && (
                        <span className="text-xs text-red-600">Required - must grant access</span>
                      )}
                      {isLocked && (
                        <span className="text-xs text-text-secondary">Locked</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

