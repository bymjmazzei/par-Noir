import React from 'react';
import { QrCode, MessageSquare, Phone } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';

interface CustodianInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustodianForInvitation: {
    name: string;
    contactType: 'email' | 'phone';
    contactValue: string;
    type: 'person' | 'service' | 'self';
    passcode: string;
  };
  setSelectedCustodianForInvitation: (custodian: any) => void;
  custodianQRCode: string;
  setCustodianQRCode: (code: string) => void;
  custodianContactInfo: {
    name: string;
    contactType: 'email' | 'phone';
    contactValue: string;
    type: 'person' | 'service' | 'self';
    passcode: string;
  };
  setCustodianContactInfo: (info: any) => void;
  onGenerateCustodianQRCode: (custodianData: any) => Promise<void>;
  onContactAction: (type: 'email' | 'phone', contactValue: string) => void;
}

export function CustodianInvitationModal({
  isOpen,
  onClose,
  selectedCustodianForInvitation,
  setSelectedCustodianForInvitation,
  custodianQRCode,
  setCustodianQRCode,
  custodianContactInfo,
  setCustodianContactInfo,
  onGenerateCustodianQRCode,
  onContactAction
}: CustodianInvitationModalProps) {
  if (!isOpen || !selectedCustodianForInvitation) return null;

  const handleClose = () => {
    setSelectedCustodianForInvitation(null);
    setCustodianQRCode('');
    setCustodianContactInfo({
      name: '',
      contactType: 'email',
      contactValue: '',
      type: 'person',
      passcode: ''
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Send Custodian Invitation</h2>
            <SectionInfo title="Send Custodian Invitation">
              <div>
                <p className="font-medium text-text-primary">How it works</p>
                <ul>
                  <li>Generate a QR code invitation for your custodian</li>
                  <li>Send the QR code via email, text, or any method you prefer</li>
                  <li>When they scan the QR code, they'll be prompted to accept</li>
                  <li>Once accepted, their status will change from "pending" to "active"</li>
                  <li>Active custodians can approve recovery requests</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-text-primary">After you send it</p>
                <ul>
                  <li>Share the QR code with {selectedCustodianForInvitation.name}</li>
                  <li>They can scan it to accept the custodianship</li>
                  <li>The invitation is encrypted with their contact information</li>
                  <li>You can regenerate the QR code if needed</li>
                </ul>
              </div>
            </SectionInfo>
          </div>
          <button 
            onClick={handleClose}
            className="modal-close-button"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Custodian Details */}
          <div className="bg-secondary p-4 rounded-lg">
            <h3 className="font-medium text-text-primary mb-2">Custodian Details</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-text-secondary">Name:</span> <span className="font-medium">{selectedCustodianForInvitation.name}</span></div>
              <div><span className="text-text-secondary">Type:</span> <span className="font-medium">{selectedCustodianForInvitation.type}</span></div>
              <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{selectedCustodianForInvitation.contactValue} ({selectedCustodianForInvitation.contactType})</span></div>
              <div><span className="text-text-secondary">Status:</span> <span className="font-medium text-yellow-600">Pending</span></div>
            </div>
          </div>

          {/* QR Code Section */}
          {!custodianQRCode ? (
            <div className="bg-secondary p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3 flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Generate Invitation
              </h4>
              <p className="text-sm text-text-secondary mb-4">
                Generate a QR code invitation for {selectedCustodianForInvitation.name}. 
                This will create an encrypted invitation that they can scan to accept custodianship.
              </p>
              <button
                onClick={async () => {
                  const custodianData = {
                    name: selectedCustodianForInvitation.name,
                    contactType: selectedCustodianForInvitation.contactType,
                    contactValue: selectedCustodianForInvitation.contactValue,
                    type: selectedCustodianForInvitation.type,
                    passcode: selectedCustodianForInvitation.passcode || ''
                  };
                  await onGenerateCustodianQRCode(custodianData);
                }}
                className="w-full px-4 py-2 modal-button rounded-md"
              >
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Generate QR Code
                </div>
              </button>
            </div>
          ) : (
            <div className="bg-secondary p-4 rounded-lg">
              <h4 className="font-medium text-text-primary mb-3 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Send Invitation
              </h4>
              <div className="space-y-4">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg">
                    <img 
                      src={custodianQRCode} 
                      alt="Custodian Invitation QR Code" 
                      className="w-48 h-48"
                    />
                  </div>
                </div>
                
                {/* Contact Buttons */}
                <div className="flex space-x-3">
                  {custodianContactInfo.contactType === 'email' ? (
                    <button
                      onClick={() => onContactAction('email', custodianContactInfo.contactValue)}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      📧 Send Email
                    </button>
                  ) : (
                    <button
                      onClick={() => onContactAction('phone', custodianContactInfo.contactValue)}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Send Text
                      </div>
                    </button>
                  )}
                </div>
                
                {/* Regenerate Button */}
                <button
                  onClick={async () => {
                    const custodianData = {
                      name: selectedCustodianForInvitation.name,
                      contactType: selectedCustodianForInvitation.contactType,
                      contactValue: selectedCustodianForInvitation.contactValue,
                      type: selectedCustodianForInvitation.type,
                      passcode: selectedCustodianForInvitation.passcode || ''
                    };
                    await onGenerateCustodianQRCode(custodianData);
                  }}
                  className="w-full px-4 py-2 bg-secondary text-text-primary rounded-md hover:bg-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4" />
                    Regenerate QR Code
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
