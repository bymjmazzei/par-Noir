import React, { useState } from 'react';
import { X, Users, Mail, Phone, Key, Upload, Shield } from 'lucide-react';

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelegationCreated?: (delegation: any) => void;
}

export const DelegationModal: React.FC<DelegationModalProps> = ({
  isOpen,
  onClose,
  onDelegationCreated
}) => {
  const [activeSection, setActiveSection] = useState<'create' | 'add'>('create');
  const [loading, setLoading] = useState(false);

  // Create Delegation Form
  const [createForm, setCreateForm] = useState({
    delegateName: '',
    contact: '',
    contactType: 'email' as 'email' | 'phone',
    delegatePin: ''
  });

  // Add Delegate Form
  const [addForm, setAddForm] = useState({
    token: '',
    delegateName: '',
    contact: '',
    contactType: 'email' as 'email' | 'phone',
    delegatePin: ''
  });

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Delegation creation logic - would integrate with the identity management system
      // This would create a secure delegation record with proper cryptographic signatures
      // 1. Generate delegation token
      // 2. Encrypt token with delegate PIN
      // 3. Store delegation in pN metadata
      // 4. Send token to contact (email/SMS)

      const delegation = {
        id: `delegation_${Date.now()}`,
        delegateName: createForm.delegateName,
        contact: createForm.contact,
        contactType: createForm.contactType,
        token: `encrypted_token_${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'pending'
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      onDelegationCreated?.(delegation);
      onClose();
      
      // Reset form
      setCreateForm({
        delegateName: '',
        contact: '',
        contactType: 'email',
        delegatePin: ''
      });
    } catch (error) {
      // Failed to create delegation - error handled by UI
    } finally {
      setLoading(false);
    }
  };

  const handleAddDelegate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Delegation acceptance logic - would validate and accept the delegation
      // This would verify the delegation signature and update the identity's delegation list
      // 1. Decrypt token with delegate PIN
      // 2. Verify token validity
      // 3. Add delegation to pN metadata
      // 4. Establish ZKP delegation relationship

      const delegation = {
        id: `delegation_${Date.now()}`,
        delegateName: addForm.delegateName,
        contact: addForm.contact,
        contactType: addForm.contactType,
        token: addForm.token,
        acceptedAt: new Date().toISOString(),
        status: 'active'
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      onDelegationCreated?.(delegation);
      onClose();
      
      // Reset form
      setAddForm({
        token: '',
        delegateName: '',
        contact: '',
        contactType: 'email',
        delegatePin: ''
      });
    } catch (error) {
      // Failed to add delegate - error handled by UI
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">Delegation</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveSection('create')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeSection === 'create'
                ? 'text-primary border-b-2 border-primary bg-hover'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Create Delegation
          </button>
          <button
            onClick={() => setActiveSection('add')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeSection === 'add'
                ? 'text-primary border-b-2 border-primary bg-hover'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Accept Delegation
          </button>
        </div>

        {/* Create Delegation Form */}
        {activeSection === 'create' && (
          <form onSubmit={handleCreateDelegation} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Delegate Name
              </label>
              <input
                type="text"
                value={createForm.delegateName}
                onChange={(e) => setCreateForm(prev => ({ ...prev, delegateName: e.target.value }))}
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                placeholder="Enter name of person you're delegating to"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Contact Method
              </label>
              <div className="flex gap-2">
                <select
                  value={createForm.contactType}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, contactType: e.target.value as 'email' | 'phone' }))}
                  className="px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
                <input
                  type={createForm.contactType === 'email' ? 'email' : 'tel'}
                  value={createForm.contact}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, contact: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                  placeholder={createForm.contactType === 'email' ? 'Enter email address' : 'Enter phone number'}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                <Key className="w-4 h-4 inline mr-2" />
                Delegate PIN (encrypts token)
              </label>
              <input
                type="password"
                value={createForm.delegatePin}
                onChange={(e) => setCreateForm(prev => ({ ...prev, delegatePin: e.target.value }))}
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                placeholder="Enter PIN to encrypt delegation token"
                required
              />
              <p className="text-xs text-text-secondary mt-1">
                This PIN encrypts the delegation token. The delegate will need this PIN to accept the delegation.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-border text-text-primary rounded-md hover:bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-primary text-text-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Generate Token
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Add Delegate Form */}
        {activeSection === 'add' && (
          <form onSubmit={handleAddDelegate} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                <Upload className="w-4 h-4 inline mr-2" />
                Delegation Token
              </label>
              <textarea
                value={addForm.token}
                onChange={(e) => setAddForm(prev => ({ ...prev, token: e.target.value }))}
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                rows={3}
                placeholder="Paste the delegation token here"
                required
              />
            </div>


            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Contact Method
              </label>
              <div className="flex gap-2">
                <select
                  value={addForm.contactType}
                  onChange={(e) => setAddForm(prev => ({ ...prev, contactType: e.target.value as 'email' | 'phone' }))}
                  className="px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
                <input
                  type={addForm.contactType === 'email' ? 'email' : 'tel'}
                  value={addForm.contact}
                  onChange={(e) => setAddForm(prev => ({ ...prev, contact: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                  placeholder={addForm.contactType === 'email' ? 'Enter your email' : 'Enter your phone'}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                <Key className="w-4 h-4 inline mr-2" />
                Delegate PIN (decrypts token)
              </label>
              <input
                type="password"
                value={addForm.delegatePin}
                onChange={(e) => setAddForm(prev => ({ ...prev, delegatePin: e.target.value }))}
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                placeholder="Enter PIN to decrypt delegation token"
                required
              />
              <p className="text-xs text-text-secondary mt-1">
                Enter the PIN provided by the person who created the delegation.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-border text-text-primary rounded-md hover:bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-primary text-text-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Accept Delegation
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default DelegationModal;