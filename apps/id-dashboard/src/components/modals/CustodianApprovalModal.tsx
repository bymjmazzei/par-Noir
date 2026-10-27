import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RecoveryRequest } from '../../types/app';

interface CustodianApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRecoveryRequest: RecoveryRequest | null;
  selectedCustodianship: {
    id: string;
    identityName: string;
    identityPnId: string;
    identityId: string;
  } | null;
  recoveryThreshold: number;
  onApproveRecovery: (recoveryRequestId: string, custodianshipId: string) => void;
}

export function CustodianApprovalModal({
  isOpen,
  onClose,
  selectedRecoveryRequest,
  selectedCustodianship,
  recoveryThreshold,
  onApproveRecovery,
}: CustodianApprovalModalProps) {
  if (!isOpen || !selectedRecoveryRequest) return null;

  const relay = selectedRecoveryRequest.relay;
  const isDeviceReset = relay?.requestType === 'device_registry_reset';
  const approvalCount = relay?.approvalCount ?? selectedRecoveryRequest.approvals.length;
  const threshold = relay?.threshold ?? recoveryThreshold;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">
            {isDeviceReset ? 'Device Reset Approval' : 'Recovery Approval Request'}
          </h2>
          <button onClick={onClose} className="modal-close-button">
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {selectedCustodianship && (
            <div className="bg-secondary p-4 rounded-lg">
              <h3 className="font-medium text-text-primary mb-2">Identity Details</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-text-secondary">Name:</span> <span className="font-medium">{selectedCustodianship.identityName}</span></div>
                {selectedCustodianship.identityPnId && (
                  <div><span className="text-text-secondary">pN ID:</span> <span className="font-medium">{selectedCustodianship.identityPnId}</span></div>
                )}
              </div>
            </div>
          )}

          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Request</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">Requested by:</span> <span className="font-medium">{selectedRecoveryRequest.requestingUser}</span></div>
              <div><span className="text-text-secondary">Requested at:</span> <span className="font-medium">{new Date(selectedRecoveryRequest.timestamp).toLocaleString()}</span></div>
              {selectedRecoveryRequest.expiresAt && (
                <div><span className="text-text-secondary">Expires:</span> <span className="font-medium">{new Date(selectedRecoveryRequest.expiresAt).toLocaleString()}</span></div>
              )}
            </div>
          </div>

          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Authorization Status</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">Approvals:</span> <span className="font-medium text-green-600">{approvalCount}</span></div>
              <div><span className="text-text-secondary">Required:</span> <span className="font-medium">{threshold} custodians, including a protected one</span></div>
              <div className="text-xs text-text-secondary mt-2">
                {isDeviceReset
                  ? 'Your approval lets the owner clear their registered devices. No recovery share is sent.'
                  : 'Approving reads the share you hold from your cloud storage and re-encrypts it so only the requesting device can open it. par Noir relays it but cannot read it.'}
              </div>
            </div>
          </div>

          <div className="bg-secondary border border-border rounded-lg p-4">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Security Notice
            </h4>
            <div className="text-sm text-text-secondary space-y-1">
              <p>• Only approve if you have confirmed with the owner through a channel you trust</p>
              <p>• Verify their contact information matches your records</p>
              <p>• The owner can still cancel during the safety delay</p>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onApproveRecovery(selectedRecoveryRequest.id, selectedCustodianship?.id ?? '')}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
