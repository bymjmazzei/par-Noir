import React from 'react';
import { CheckCircle } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';

interface AddCustodianModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCustodian: (custodianData: {
    name: string;
    contactType: 'email' | 'phone';
    contactValue: string;
    type: 'person' | 'service' | 'self';
    passcode: string;
    unrevokable?: boolean;
  }) => Promise<void>;
}

export function AddCustodianModal({
  isOpen,
  onClose,
  onAddCustodian
}: AddCustodianModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Add Recovery Custodian</h2>
            <SectionInfo title="About Custodians">
              <ul>
                <li>Custodians can help you recover your identity if you lose access</li>
                <li>You need at least 2 custodians to enable recovery</li>
                <li>Maximum 5 custodians allowed</li>
                <li>Custodians will be notified when you initiate recovery</li>
                <li>They can approve recovery requests</li>
                <li>Custodians start as "pending" until they accept the invitation</li>
              </ul>
            </SectionInfo>
          </div>
          <button 
            onClick={onClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const custodianData = {
            name: formData.get('name') as string,
            contactType: formData.get('contactType') as 'email' | 'phone',
            contactValue: formData.get('contactValue') as string,
            type: (formData.get('custodianType') as 'person' | 'service' | 'self') || 'person',
            passcode: formData.get('passcode') as string,
            unrevokable: formData.get('unrevokable') === 'on',
          };
          
          await onAddCustodian(custodianData);
        }} className="space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Custodian Name *
            </label>
            <input
              type="text"
              name="name"
              required
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter custodian's full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Contact Type *
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="contactType"
                  value="email"
                  defaultChecked
                  className="mr-2"
                />
                <span className="text-sm text-text-primary">Email</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="contactType"
                  value="phone"
                  className="mr-2"
                />
                <span className="text-sm text-text-primary">Phone</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Contact Value *
            </label>
            <input
              type="text"
              name="contactValue"
              required
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter email or phone number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Custodian type
            </label>
            <select
              name="custodianType"
              defaultValue="person"
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="person">Person</option>
              <option value="self">Self (your alt pN)</option>
              <option value="service">Service</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" name="unrevokable" defaultChecked />
              Protected custodian (cannot be revoked from dashboard)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Custodian Passcode *
            </label>
            <input
              type="text"
              name="passcode"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter 6-digit numeric code"
            />
            <p className="text-xs text-text-secondary mt-1">
              Create a 6-digit numeric code to share with the custodian. They'll need this code to accept the custodianship.
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 modal-button rounded-md"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Add Custodian
              </div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
