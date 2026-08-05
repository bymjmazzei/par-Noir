import React from 'react';
import { CheckCircle, Lock } from 'lucide-react';
import {
  DATA_POINT_UI_CLASSES,
  getPrivacyUiPrimaryRows,
  NAME_DERIVED_IDS,
  AGE_DERIVED_IDS,
  type DataPointUiClass
} from '@par-noir/standard-data-points';

const UI_CLASS_ORDER: DataPointUiClass[] = ['name', 'age', 'location', 'contact', 'documents'];

export interface PrivacyDataPointsPanelProps {
  attestedDataPoints: Set<string>;
  verifiedDataPoints: Set<string>;
  onRequestDataPoint: (dataPointId: string) => void;
}

function isBundlePresent(
  uiClass: DataPointUiClass,
  attested: Set<string>,
  verified: Set<string>
): boolean {
  if (uiClass === 'name') {
    return (
      attested.has('name_attestation') ||
      verified.has('name_attestation') ||
      NAME_DERIVED_IDS.some((id) => attested.has(id) || verified.has(id))
    );
  }
  if (uiClass === 'age') {
    return AGE_DERIVED_IDS.some((id) => attested.has(id) || verified.has(id));
  }
  return false;
}

function isRowVerified(
  dataPointId: string,
  uiClass: DataPointUiClass,
  verified: Set<string>
): boolean {
  if (uiClass === 'name') {
    return (
      verified.has('name_attestation') ||
      verified.has('full_name') ||
      verified.has('first_name') ||
      verified.has('last_name')
    );
  }
  if (uiClass === 'age') {
    return AGE_DERIVED_IDS.some((id) => verified.has(id));
  }
  return verified.has(dataPointId);
}

function isRowAttested(
  dataPointId: string,
  uiClass: DataPointUiClass,
  attested: Set<string>,
  verified: Set<string>
): boolean {
  if (isRowVerified(dataPointId, uiClass, verified)) return true;
  if (uiClass === 'name' || uiClass === 'age') {
    return isBundlePresent(uiClass, attested, verified);
  }
  return attested.has(dataPointId) || verified.has(dataPointId);
}

export const PrivacyDataPointsPanel: React.FC<PrivacyDataPointsPanelProps> = ({
  attestedDataPoints,
  verifiedDataPoints,
  onRequestDataPoint
}) => {
  return (
    <div className="space-y-6 mb-6">
      {UI_CLASS_ORDER.map((uiClass) => {
        const meta = DATA_POINT_UI_CLASSES[uiClass];
        const rows = getPrivacyUiPrimaryRows(uiClass);
        return (
          <div key={uiClass} className="bg-secondary rounded-lg p-6">
            <h4 className="font-medium text-text-primary mb-1">{meta.label}</h4>
            <p className="text-xs text-text-secondary mb-4">{meta.description}</p>
            <div className="space-y-3">
              {rows.map((dp) => {
                const present = isRowAttested(dp.id, uiClass, attestedDataPoints, verifiedDataPoints);
                const locked = isRowVerified(dp.id, uiClass, verifiedDataPoints);
                return (
                  <div
                    key={dp.id}
                    className="flex items-center justify-between p-3 bg-modal-bg border border-border rounded-lg gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-text-primary">{dp.name}</span>
                        {present && !locked && (
                          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" aria-label="Attested" />
                        )}
                        {locked && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                            <Lock className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary">{dp.description}</p>
                      {locked && (
                        <p className="text-xs text-text-secondary mt-1">
                          Locked by identity verification. Change requires identity rekey / rotation.
                        </p>
                      )}
                    </div>
                    {locked ? null : present ? (
                      <button
                        type="button"
                        onClick={() => onRequestDataPoint(dp.id)}
                        className="px-3 py-1 text-sm border border-border rounded hover:bg-hover text-text-primary shrink-0"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRequestDataPoint(dp.id)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0"
                      >
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
