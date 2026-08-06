import React, { useMemo } from 'react';
import { STANDARD_DATA_POINTS } from '@par-noir/standard-data-points';
import { GlobalPrivacySettings } from '../../types/privacy';
import { SectionInfo } from '../common/SectionInfo';

interface GlobalPrivacySettingsBodyProps {
  settings: GlobalPrivacySettings;
  attestedDataPoints: Set<string>;
  verifiedDataPoints: Set<string>;
  onToggleShareWithThirdParties: (dataPointId: string, allowed: boolean) => void;
}

type Row = {
  id: string;
  name: string;
  status: 'verified' | 'attested';
  allowed: boolean;
};

/**
 * Global Settings: attested/verified data points with a checkbox to disable
 * sharing that point with all third parties.
 */
export const GlobalPrivacySettingsBody: React.FC<GlobalPrivacySettingsBodyProps> = ({
  settings,
  attestedDataPoints,
  verifiedDataPoints,
  onToggleShareWithThirdParties
}) => {
  const rows = useMemo((): Row[] => {
    const ids = new Set<string>([...attestedDataPoints, ...verifiedDataPoints]);
    const list: Row[] = [];
    for (const id of ids) {
      const dp = STANDARD_DATA_POINTS[id];
      if (!dp) continue;
      // Never expose identity secrets in this table
      if (id === 'pn_file' || id === 'pn_name' || id === 'passcode') continue;
      const verified = verifiedDataPoints.has(id);
      const allowed = settings.dataPoints[id]?.globalSetting ?? true;
      list.push({
        id,
        name: dp.name,
        status: verified ? 'verified' : 'attested',
        allowed
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [attestedDataPoints, verifiedDataPoints, settings.dataPoints]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-secondary py-2">
        No attested or verified data points yet. Add proofs under Identity or Documents above.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-text-primary">
      <div className="flex items-center gap-2">
        <SectionInfo title="Share with third parties">
          <p>
            Uncheck a data point to disable it for every connected third party. Per-app grants cannot
            override a disabled global setting.
          </p>
        </SectionInfo>
      </div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-modal-bg/60 text-left text-text-secondary">
              <th className="px-3 py-2 font-medium">Data point</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Share with third parties</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-medium text-text-primary">{row.name}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      row.status === 'verified'
                        ? 'text-xs text-amber-400'
                        : 'text-xs text-green-400'
                    }
                  >
                    {row.status === 'verified' ? 'Verified' : 'Attested'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <input
                    type="checkbox"
                    checked={row.allowed}
                    onChange={(e) => onToggleShareWithThirdParties(row.id, e.target.checked)}
                    aria-label={`Share ${row.name} with third parties`}
                    className="h-4 w-4"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** @deprecated use GlobalPrivacySettingsBody */
export const AdvancedPrivacySettingsBody = GlobalPrivacySettingsBody;
