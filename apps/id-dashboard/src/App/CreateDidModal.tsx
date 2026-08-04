import React from 'react';
import {
  KEY_STRENGTH_RULES,
  meetsKeyStrengthRequirements,
} from '../constants/credentialLabels';

export interface CreateDidForm {
  pnName: string;
  confirmPNName: string;
  passcode: string;
  confirmPasscode: string;
  nickname: string;
  email: string;
  phone: string;
  recoveryEmail: string;
  confirmRecoveryEmail: string;
  recoveryPhone: string;
  confirmRecoveryPhone: string;
  recoveryContactType: 'email' | 'phone';
}

export interface CreateDidModalProps {
  showCreateForm: boolean;
  setShowCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  createStep: number;
  setCreateStep: React.Dispatch<React.SetStateAction<number>>;
  createForm: CreateDidForm;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateDidForm>>;
  showPNName: boolean;
  setShowPNName: React.Dispatch<React.SetStateAction<boolean>>;
  showPasscode: boolean;
  setShowPasscode: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPNName: boolean;
  setShowConfirmPNName: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPasscode: boolean;
  setShowConfirmPasscode: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  handleCreateDID: (e: React.FormEvent) => void | Promise<void>;
}

export function CreateDidModal(props: CreateDidModalProps) {
  const {
    showCreateForm,
    setShowCreateForm,
    createStep,
    setCreateStep,
    createForm,
    setCreateForm,
    showPNName,
    setShowPNName,
    showPasscode,
    setShowPasscode,
    showConfirmPNName,
    setShowConfirmPNName,
    showConfirmPasscode,
    setShowConfirmPasscode,
    error,
    handleCreateDID
  } = props;

  return (
    <>
        {/* Create DID Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Create New pN</h2>
                  <button 
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateStep(1);
                    setCreateForm({
                      pnName: '',
                      confirmPNName: '',
                      passcode: '',
                      confirmPasscode: '',
                      nickname: '',
                      email: '',
                      phone: '',
                      recoveryEmail: '',
                      confirmRecoveryEmail: '',
                      recoveryPhone: '',
                      confirmRecoveryPhone: '',
                      recoveryContactType: 'email'
                    });
                    // Reset show/hide states
                    setShowPNName(false);
                    setShowPasscode(false);
                    setShowConfirmPNName(false);
                    setShowConfirmPasscode(false);
                  }}
                  className="modal-close-button"
                >
                  ×
                  </button>
                </div>
                
                {/* Step Indicator */}
                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center space-x-2">
                    {/* Step 1 Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                      createStep === 1 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : createStep >= 2
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-transparent text-gray-400 border-gray-400'
                    }`}>
                      1
                    </div>
                    
                    {/* Connecting Line */}
                    <div className={`w-12 h-1 ${
                      createStep >= 2 ? 'bg-blue-600' : 'bg-gray-400'
                    }`}></div>
                    
                    {/* Step 2 Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                      createStep === 2 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-transparent text-gray-400 border-gray-400'
                    }`}>
                      2
                    </div>
                  </div>
                </div>
                
                {/* Error Message Display */}
                {error && (
                  <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                    <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                  </div>
                )}
                
              {createStep === 1 ? (
                <form key="step1" onSubmit={(e) => { e.preventDefault(); setCreateStep(2); }} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-text-primary border-b border-border pb-2">Step 1: Enter Your Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Key 1
                      </label>
                      <div className="relative">
                        <input
                          type={showPNName ? "text" : "password"}
                          value={createForm.pnName}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, pnName: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter Key 1"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPNName(!showPNName)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showPNName ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className="font-medium mb-1">Requirements:</p>
                        <ul className="space-y-1">
                          {KEY_STRENGTH_RULES.map((rule) => (
                            <li
                              key={`k1-${rule.id}`}
                              className={rule.test(createForm.pnName) ? 'text-green-500' : 'text-red-500'}
                            >
                              • {rule.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Key 2
                      </label>
                      <div className="relative">
                        <input
                          type={showPasscode ? "text" : "password"}
                          value={createForm.passcode}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, passcode: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter Key 2"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasscode(!showPasscode)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showPasscode ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className="font-medium mb-1">Requirements:</p>
                        <ul className="space-y-1">
                          {KEY_STRENGTH_RULES.map((rule) => (
                            <li
                              key={`k2-${rule.id}`}
                              className={rule.test(createForm.passcode) ? 'text-green-500' : 'text-red-500'}
                            >
                              • {rule.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact Type
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="recoveryContactType"
                            value="email"
                            checked={createForm.recoveryContactType === 'email'}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryContactType: e.target.value as 'email' | 'phone' }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Email</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="recoveryContactType"
                            value="phone"
                            checked={createForm.recoveryContactType === 'phone'}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryContactType: e.target.value as 'email' | 'phone' }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Phone</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact
                      </label>
                      {createForm.recoveryContactType === 'email' ? (
                        <input
                          type="email"
                          value={createForm.recoveryEmail}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryEmail: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter recovery email"
                          required
                        />
                      ) : (
                        <input
                          type="tel"
                          value={createForm.recoveryPhone}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryPhone: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter recovery phone"
                          required
                        />
                      )}
                      <p className="text-xs text-text-secondary mt-1">
                        This will only be used for recovery if you lose access
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                      disabled={
                        !meetsKeyStrengthRequirements(createForm.pnName) ||
                        !meetsKeyStrengthRequirements(createForm.passcode) ||
                        (createForm.recoveryContactType === 'email'
                          ? !createForm.recoveryEmail
                          : !createForm.recoveryPhone)
                      }
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form key="step2" onSubmit={handleCreateDID} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-text-primary border-b border-border pb-2">Step 2: Confirm Your Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Key 1
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPNName ? "text" : "password"}
                          value={createForm.confirmPNName}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPNName: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm Key 1"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPNName(!showConfirmPNName)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showConfirmPNName ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className={createForm.confirmPNName === createForm.pnName ? "text-green-500" : "text-red-500"}>
                          {createForm.confirmPNName === createForm.pnName ? "✓ Names match" : "✗ Names do not match"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Key 2
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPasscode ? "text" : "password"}
                          value={createForm.confirmPasscode}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPasscode: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm Key 2"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPasscode(!showConfirmPasscode)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                        >
                          {showConfirmPasscode ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        <p className={createForm.confirmPasscode === createForm.passcode ? "text-green-500" : "text-red-500"}>
                          {createForm.confirmPasscode === createForm.passcode ? "✓ Key 2 entries match" : "✗ Key 2 entries do not match"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Recovery Contact
                      </label>
                      {createForm.recoveryContactType === 'email' ? (
                        <input
                          type="email"
                          value={createForm.confirmRecoveryEmail}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmRecoveryEmail: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your recovery email"
                          required
                        />
                      ) : (
                        <input
                          type="tel"
                          value={createForm.confirmRecoveryPhone}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmRecoveryPhone: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your recovery phone"
                          required
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setCreateStep(1)}
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                      disabled={!createForm.confirmPNName || !createForm.confirmPasscode || 
                        (createForm.recoveryContactType === 'email' ? !createForm.confirmRecoveryEmail : !createForm.confirmRecoveryPhone)}
                    >
                      Create pN
                    </button>
                  </div>
                </form>
              )}
                  </div>
                </div>
        )}
    </>
  );
}
