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
                const isRequired = requiredDataPoints.includes(dataPoint.id);
                // Required data points are always enabled (shared)
                const isEnabled = isRequired ? true : dataPoints.includes(dataPoint.id);
                const globalSetting = globalDataPointSettings[dataPoint.id]?.globalSetting ?? true;
                const isLocked = globalSetting === false; // Locked if globally disabled

                return (
                  <div 
                    key={dataPoint.id} 
                    className="flex items-center justify-between p-3 bg-secondary rounded border border-border"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-medium text-text-primary">
                        {dataPoint.name}
                        {!isRequired && <span className="text-blue-600 ml-1">(Optional)</span>}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">{dataPoint.description}</div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Required indicator (read-only, set by third party) */}
                      {isRequired && (
                        <span className="text-xs px-2 py-1 rounded border text-red-600 border-red-300">
                          Required
                        </span>
                      )}
                      
                      {/* Share status dropdown for optional fields, always "Shared" for required */}
                      {isRequired ? (
                        <span className="text-xs text-text-primary px-2 py-1 border border-border rounded">
                          Shared
                        </span>
                      ) : (
                        <select
                          value={isEnabled ? 'shared' : 'not_shared'}
                          onChange={(e) => {
                            const shared = e.target.value === 'shared';
                            onToggleDataPoint(dataPoint.id, shared);
                          }}
                          disabled={isLocked}
                          className="text-xs border border-border rounded px-2 py-1 bg-background text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: '#e5e7eb' }}
                        >
                          <option value="not_shared" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Not Shared</option>
                          <option value="shared" style={{ color: '#1f2937', backgroundColor: '#ffffff' }}>Shared</option>
                        </select>
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

