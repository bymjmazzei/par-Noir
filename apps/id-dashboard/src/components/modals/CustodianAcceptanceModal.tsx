import React from 'react';
import { FileText, AlertTriangle } from 'lucide-react';

interface CustodianAcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingCustodianInvitationData: {
    identityName: string;
    identityUsername: string;
    custodianName: string;
    custodianType: string;
    contactValue: string;
    contactType: 'email' | 'phone';
  };
  setPendingCustodianInvitationData: (data: any) => void;
  custodianAcceptanceData: {
    contactValue: string;
    passcode: string;
  };
  setCustodianAcceptanceData: (data: { contactValue: string; passcode: string }) => void;
  onCustodianAcceptance: () => void;
}

export function CustodianAcceptanceModal({
  isOpen,
  onClose,
  pendingCustodianInvitationData,
  setPendingCustodianInvitationData,
  custodianAcceptanceData,
  setCustodianAcceptanceData,
  onCustodianAcceptance
}: CustodianAcceptanceModalProps) {
  if (!isOpen || !pendingCustodianInvitationData) return null;

  const handleClose = () => {
    setPendingCustodianInvitationData(null);
    setCustodianAcceptanceData({ contactValue: '', passcode: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Accept Custodianship</h2>
          <button 
            onClick={handleClose}
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
              <div><span className="text-text-secondary">Identity:</span> <span className="font-medium">{pendingCustodianInvitationData.identityName}</span></div>
              <div><span className="text-text-secondary">pN Name:</span> <span className="font-medium">{pendingCustodianInvitationData.identityUsername}</span></div>
              <div><span className="text-text-secondary">Custodian Name:</span> <span className="font-medium">{pendingCustodianInvitationData.custodianName}</span></div>
              <div><span className="text-text-secondary">Type:</span> <span className="font-medium">{pendingCustodianInvitationData.custodianType}</span></div>
              <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{pendingCustodianInvitationData.contactValue} ({pendingCustodianInvitationData.contactType})</span></div>
            </div>
          </div>

          {/* What This Means */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              What This Means
            </h4>
            <div className="text-sm text-blue-700 space-y-1">
              <p>• You're being asked to be a recovery custodian for this identity</p>
              <p>• You'll be able to approve or deny recovery requests</p>
              <p>• You'll receive notifications when recovery is requested</p>
              <p>• This is a trusted role - only accept if you know the identity owner</p>
            </div>
          </div>

          {/* Verification Form */}
          <div className="bg-secondary p-4 rounded-lg">
            <h4 className="font-medium text-text-primary mb-3">Verify Your Information</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Your Contact Information *
                </label>
                <input
                  type="text"
                  value={custodianAcceptanceData.contactValue}
                  onChange={(e) => setCustodianAcceptanceData(prev => ({ ...prev, contactValue: e.target.value }))}
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={`Enter your ${pendingCustodianInvitationData.contactType}`}
                />
                <p className="text-xs text-text-secondary mt-1">
                  Must match the contact information in the invitation
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Passcode *
                </label>
                <input
                  type="text"
                  value={custodianAcceptanceData.passcode}
                  onChange={(e) => setCustodianAcceptanceData(prev => ({ ...prev, passcode: e.target.value }))}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter 6-digit passcode"
                />
                <p className="text-xs text-text-secondary mt-1">
                  Enter the 6-digit passcode provided by the identity owner
                </p>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Requirements
            </h4>
            <div className="text-sm text-yellow-700 space-y-1">
              <p>• You must have your own identity unlocked to accept</p>
              <p>• Your contact information must match the invitation</p>
              <p>• You need the correct 6-digit passcode from the identity owner</p>
              <p>• You can revoke this custodianship at any time</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onCustodianAcceptance}
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
