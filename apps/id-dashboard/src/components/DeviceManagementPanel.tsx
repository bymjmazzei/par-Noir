import React from 'react';

/** Device / session list — push registration via API when unlocked. */
export const DeviceManagementPanel: React.FC<{ authToken?: string; pnIdentifier?: string }> = ({
  authToken,
  pnIdentifier
}) => {
  return (
    <div className="bg-secondary rounded-lg p-6 space-y-3">
      <h4 className="font-medium text-text-primary">Devices & sessions</h4>
      <p className="text-xs text-text-secondary">
        This device holds your unlocked session. Use Export or Sync Receiver to move your identity to another
        device. Push notification registration uses <code className="text-xs">POST /api/push/register</code> when
        the browser registers a device token.
      </p>
      <ul className="text-xs text-text-secondary list-disc pl-4 space-y-1">
        <li>Export encrypted identity (.pn) for backup</li>
        <li>Sync Receiver — transfer via encrypted sync code</li>
        <li>Cloud Sync — custodian and nickname updates to API</li>
        {authToken && pnIdentifier ? (
          <li className="text-text-primary">Session active for platform services on this device</li>
        ) : (
          <li>Unlock and connect API OAuth to register push tokens</li>
        )}
      </ul>
    </div>
  );
};
