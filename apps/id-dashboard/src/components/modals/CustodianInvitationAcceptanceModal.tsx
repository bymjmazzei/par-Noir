import React from 'react';
import { SectionInfo } from '../common/SectionInfo';

interface CustodianInvitationAcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingCustodianInvitation: {
    identityName: string;
    identityUsername: string;
    custodianName: string;
    custodianType: string;
    contactValue: string;
    contactType: string;
  };
  onAcceptCustodianship: (invitation: any) => void;
}

export function CustodianInvitationAcceptanceModal({
  isOpen,
  onClose,
  pendingCustodianInvitation,
  onAcceptCustodianship
}: CustodianInvitationAcceptanceModalProps) {
  if (!isOpen || !pendingCustodianInvitation) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Custodian Invitation</h2>
            <SectionInfo title="Custodian Invitation">
              <div>
                <p className="font-medium text-text-primary">What this means</p>
                <ul>
                  <li>You're being asked to be a recovery custodian for this identity</li>
                  <li>You'll be able to approve or deny recovery requests</li>
                  <li>You'll receive notifications when recovery is requested</li>
                  <li>This is a trusted role - only accept if you know the identity owner</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-text-primary">Requirements</p>
                <ul>
                  <li>You must have your own identity unlocked to accept</li>
                  <li>You'll need to verify your contact information</li>
                  <li>You can revoke this custodianship at any time</li>
                </ul>
              </div>
            </SectionInfo>
          </div>
          <button 
            onClick={onClose}
            className="modal-close-button"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Invitation Details */}
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Invitation Details</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">Identity:</span> <span className="font-medium">{pendingCustodianInvitation.identityName}</span></div>
              <div><span className="text-text-secondary">pN Name:</span> <span className="font-medium">{pendingCustodianInvitation.identityUsername}</span></div>
              <div><span className="text-text-secondary">Custodian Name:</span> <span className="font-medium">{pendingCustodianInvitation.custodianName}</span></div>
              <div><span className="text-text-secondary">Type:</span> <span className="font-medium">{pendingCustodianInvitation.custodianType}</span></div>
              <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{pendingCustodianInvitation.contactValue} ({pendingCustodianInvitation.contactType})</span></div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={() => onAcceptCustodianship(pendingCustodianInvitation)}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Accept Custodianship
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
