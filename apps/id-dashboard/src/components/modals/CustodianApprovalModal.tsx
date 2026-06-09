import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface CustodianApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRecoveryRequest: {
    id: string;
    requestingUser: string;
    timestamp: number | string;
    claimantContactType?: 'email' | 'phone';
    claimantContactValue?: string;
    status: 'pending' | 'approved' | 'denied';
    signatures: unknown[];
    proofs?: unknown[];
    approvals: unknown[];
  };
  selectedCustodianship: {
    id: string;
    identityName: string;
    identityUsername: string;
    identityId: string;
  };
  recoveryThreshold: number;
  onApproveRecovery: (recoveryRequestId: string, custodianshipId: string) => void;
  onSuccess: (message: string) => void;
}

export function CustodianApprovalModal({
  isOpen,
  onClose,
  selectedRecoveryRequest,
  selectedCustodianship,
  recoveryThreshold,
  onApproveRecovery,
  onSuccess
}: CustodianApprovalModalProps) {
  if (!isOpen || !selectedRecoveryRequest || !selectedCustodianship) return null;

  const approvalCount = selectedRecoveryRequest.proofs?.length ?? selectedRecoveryRequest.approvals.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Recovery Approval Request</h2>
          <button onClick={onClose} className="modal-close-button">
            ✕
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Identity Details</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">Name:</span> <span className="font-medium">{selectedCustodianship.identityName}</span></div>
              <div><span className="text-text-secondary">Username:</span> <span className="font-medium">{selectedCustodianship.identityUsername}</span></div>
            </div>
          </div>

          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Recovery Request</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">Requested by:</span> <span className="font-medium">{selectedRecoveryRequest.requestingUser}</span></div>
              <div><span className="text-text-secondary">Requested at:</span> <span className="font-medium">{new Date(selectedRecoveryRequest.timestamp).toLocaleString()}</span></div>
              {selectedRecoveryRequest.claimantContactType && (
                <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{selectedRecoveryRequest.claimantContactValue} ({selectedRecoveryRequest.claimantContactType})</span></div>
              )}
            </div>
          </div>

          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Authorization Status</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">ZK approvals:</span> <span className="font-medium text-green-600">{approvalCount}</span></div>
              <div><span className="text-text-secondary">Required:</span> <span className="font-medium">{recoveryThreshold} custodian authorizations</span></div>
              <div className="text-xs text-text-secondary mt-2">
                Your approval submits a ZK authorization proof only. Shamir shares stay on the owner&apos;s Drive — you never hold secret material.
              </div>
            </div>
          </div>

          <div className="bg-secondary border border-border rounded-lg p-4">
            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Security Notice
            </h4>
            <div className="text-sm text-text-secondary space-y-1">
              <p>• Only approve if you recognize the claimant</p>
              <p>• Verify their contact information matches your records</p>
              <p>• Your ZK approval authorizes release of vault shares to the claimant</p>
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
              onClick={() => {
                onApproveRecovery(selectedRecoveryRequest.id, selectedCustodianship.id);
                onClose();
                onSuccess('Recovery authorization submitted');
              }}
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
