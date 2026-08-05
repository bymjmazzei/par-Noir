import React, { useState } from 'react';
import { CheckCircle, ChevronDown, Lock } from 'lucide-react';
import {
  getPrivacyUiPrimaryRows,
  NAME_DERIVED_IDS,
  AGE_DERIVED_IDS,
  type DataPointUiClass,
  type StandardDataPoint
} from '@par-noir/standard-data-points';
import { SectionInfo } from '../common/SectionInfo';

type PrivacyGroupId = 'identity' | 'documents';

const PRIVACY_GROUPS: Array<{
  id: PrivacyGroupId;
  label: string;
  classes: DataPointUiClass[];
  infoTitle: string;
  info: React.ReactNode;
}> = [
  {
    id: 'identity',
    label: 'Identity',
    classes: ['name', 'age', 'location', 'contact'],
    infoTitle: 'Identity proofs',
    info: (
      <>
        <p>
          Add name, age, location, and contact once. Name and date of birth mint several shareable
          proofs (full name, first + last, over 18 / 21, etc.) so third parties can request only what
          they need.
        </p>
        <p>
          <strong className="text-text-primary">Verify</strong> (government ID) locks Veriff-capable
          fields on this identity. Changing those requires identity rekey / rotation.
        </p>
        <p>Email and phone use separate contact verification (Twilio), not Veriff.</p>
      </>
    )
  },
  {
    id: 'documents',
    label: 'Documents',
    classes: ['documents'],
    infoTitle: 'Document proofs',
    info: (
      <>
        <p>
          ID metadata and images are stored encrypted under private zkp-docs — not in Storage or
          public feeds.
        </p>
        <p>Rows Veriff proves are locked until identity rekey / rotation.</p>
      </>
    )
  }
];

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

function rowsForGroup(classes: DataPointUiClass[]): Array<{ dp: StandardDataPoint; uiClass: DataPointUiClass }> {
  const out: Array<{ dp: StandardDataPoint; uiClass: DataPointUiClass }> = [];
  for (const uiClass of classes) {
    for (const dp of getPrivacyUiPrimaryRows(uiClass)) {
      out.push({ dp, uiClass });
    }
  }
  return out;
}

export const PrivacyDataPointsPanel: React.FC<PrivacyDataPointsPanelProps> = ({
  attestedDataPoints,
  verifiedDataPoints,
  onRequestDataPoint
}) => {
  const [expanded, setExpanded] = useState<Record<PrivacyGroupId, boolean>>({
    identity: false,
    documents: false
  });

  return (
    <div className="space-y-3 mb-6">
      {PRIVACY_GROUPS.map((group) => {
        const open = expanded[group.id];
        const rows = rowsForGroup(group.classes);
        return (
          <div key={group.id} className="bg-secondary rounded-lg">
            <button
              type="button"
              onClick={() => setExpanded((s) => ({ ...s, [group.id]: !s[group.id] }))}
              className="w-full p-4 flex items-center justify-between gap-3 hover:bg-border/40 transition-colors rounded-lg"
              aria-expanded={open}
            >
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="font-medium text-text-primary">{group.label}</h4>
                <span
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <SectionInfo title={group.infoTitle}>{group.info}</SectionInfo>
                </span>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div className="px-4 pb-4 space-y-2">
                {rows.map(({ dp, uiClass }) => {
                  const present = isRowAttested(
                    dp.id,
                    uiClass,
                    attestedDataPoints,
                    verifiedDataPoints
                  );
                  const locked = isRowVerified(dp.id, uiClass, verifiedDataPoints);
                  return (
                    <div
                      key={dp.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-3 bg-modal-bg border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
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
            )}
          </div>
        );
      })}
    </div>
  );
};
