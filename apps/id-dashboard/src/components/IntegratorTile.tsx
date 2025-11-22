import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StandardDataPoint, STANDARD_DATA_POINTS } from '../types/standardDataPoints';

interface IntegratorTileProps {
  toolId: string;
  toolName: string;
  toolDescription: string;
  dataPoints: string[];
  requiredDataPoints: string[];
  optionalDataPoints: string[];
  onToggleDataPoint: (dataPointId: string, enabled: boolean) => void;
  onSetRequired: (dataPointId: string, required: boolean) => void;
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
  onSetRequired,
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
                      {/* Required/Optional selector */}
                      <select
                        value={isRequired ? 'required' : 'optional'}
                        onChange={(e) => {
                          const required = e.target.value === 'required';
                          onSetRequired(dataPoint.id, required);
                        }}
                        disabled={!isEnabled || isLocked}
                        className="text-xs border border-border rounded px-2 py-1 bg-white text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="optional">Optional</option>
                        <option value="required">Required</option>
                      </select>
                      
                      {/* Enable/Disable toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isLocked) {
                            onToggleDataPoint(dataPoint.id, !isEnabled);
                          }
                        }}
                        disabled={isLocked}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-2 ${
                          isEnabled && !isLocked
                            ? 'bg-primary border-primary' 
                            : 'bg-white border-border'
                        } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        aria-label={isEnabled ? 'Disable' : 'Enable'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full shadow-sm transition-transform ${
                            isEnabled && !isLocked
                              ? 'bg-white translate-x-6' 
                              : 'bg-gray-600 translate-x-1'
                          }`}
                        />
                      </button>
                      
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

