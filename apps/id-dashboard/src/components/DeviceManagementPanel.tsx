import React from 'react';

/** Device / session list — extend when session registry API is available. */
export const DeviceManagementPanel: React.FC = () => {
  return (
    <div className="bg-secondary rounded-lg p-6 space-y-3">
      <h4 className="font-medium text-text-primary">Devices & sessions</h4>
      <p className="text-xs text-text-secondary">
        This device holds your unlocked session. Use Export or Sync Receiver to move your identity to another
        device. Remote session revoke will appear here when the session registry ships.
      </p>
      <ul className="text-xs text-text-secondary list-disc pl-4 space-y-1">
        <li>Export encrypted identity (.pn) for backup</li>
        <li>Sync Receiver — transfer via encrypted sync code</li>
        <li>Cloud Sync — custodian and nickname updates to API</li>
      </ul>
    </div>
  );
};
