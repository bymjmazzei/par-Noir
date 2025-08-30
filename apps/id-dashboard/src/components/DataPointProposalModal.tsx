import React, { useState } from 'react';
import { ZKPGenerator, DATA_POINT_CATEGORIES } from '../types/standardDataPoints';

interface DataPointProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProposalSubmitted: (proposalId: string) => void;
}

export const DataPointProposalModal: React.FC<DataPointProposalModalProps> = ({
  isOpen,
  onClose,
  onProposalSubmitted
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'verification' as const,
    dataType: 'string' as const,
    requiredFields: [''],
    examples: [''],
    useCase: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleArrayChange = (field: string, index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).map((item: string, i: number) => 
        i === index ? value : item
      )
    }));
  };

  const addArrayItem = (field: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field as keyof typeof prev], '']
    }));
  };

  const removeArrayItem = (field: string, index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).filter((_: string, i: number) => i !== index)
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.useCase.trim()) {
      newErrors.useCase = 'Use case is required';
    }

    if (formData.requiredFields.length === 0 || !formData.requiredFields[0].trim()) {
      newErrors.requiredFields = 'At least one required field is needed';
    }

    if (formData.examples.length === 0 || !formData.examples[0].trim()) {
      newErrors.examples = 'At least one example is needed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Get current session info
      const session = JSON.parse(localStorage.getItem('current_session') || '{}');
      
      const proposal = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category,
        dataType: formData.dataType,
        requiredFields: formData.requiredFields.filter(f => f.trim()),
        examples: formData.examples.filter(e => e.trim()),
        useCase: formData.useCase.trim(),
        proposedBy: session.pnName || 'Unknown'
      };
      if (!session.id || !session.pnName || !session.passcode) {
        setErrors({ submit: 'No active session found. Please unlock your pN first.' });
        return;
      }

      const result = await ZKPGenerator.proposeDataPoint(
        proposal,
        session.id,
        session.pnName,
        session.passcode
      );

      if (result.success && result.proposalId) {
        onProposalSubmitted(result.proposalId);
        onClose();
        // Reset form
        setFormData({
          name: '',
          description: '',
          category: 'verification',
          dataType: 'string',
          requiredFields: [''],
          examples: [''],
          useCase: ''
        });
      } else {
        setErrors({ submit: result.error || 'Failed to submit proposal' });
      }
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to submit proposal' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-modal-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-modal-border shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-text-primary">Propose New Data Point</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
              disabled={loading}
            >
              ✕
            </button>
          </div>

          {/* Info */}
          <div className="bg-secondary border border-border rounded-lg p-4 mb-6">
            <h3 className="font-medium text-text-primary mb-2">About Data Point Proposals</h3>
            <p className="text-text-secondary text-sm">
              Propose new standard data points that can be used by all developers. 
              Approved proposals become part of the global standard library.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Data Point Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary ${
                    errors.name ? 'border-red-500' : 'border-input-border'
                  }`}
                  placeholder="e.g., Income Verification"
                  disabled={loading}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary"
                  disabled={loading}
                >
                  {Object.entries(DATA_POINT_CATEGORIES).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary ${
                  errors.description ? 'border-red-500' : 'border-input-border'
                }`}
                rows={3}
                placeholder="Describe what this data point verifies or collects"
                disabled={loading}
              />
              {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Data Type *
              </label>
              <select
                value={formData.dataType}
                onChange={(e) => handleInputChange('dataType', e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary"
                disabled={loading}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
                <option value="object">Object</option>
              </select>
            </div>

            {/* Required Fields */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Required Fields *
              </label>
              {formData.requiredFields.map((field, index) => (
                <div key={index} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={field}
                    onChange={(e) => handleArrayChange('requiredFields', index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-input-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary"
                    placeholder="Field name (e.g., income, documentType)"
                    disabled={loading}
                  />
                  {formData.requiredFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('requiredFields', index)}
                      className="px-2 py-2 text-red-600 hover:text-red-800"
                      disabled={loading}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('requiredFields')}
                className="text-primary hover:text-primary/80 text-sm"
                disabled={loading}
              >
                + Add Required Field
              </button>
              {errors.requiredFields && <p className="text-red-500 text-xs mt-1">{errors.requiredFields}</p>}
            </div>



            {/* Examples */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Use Cases/Examples *
              </label>
              {formData.examples.map((example, index) => (
                <div key={index} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={example}
                    onChange={(e) => handleArrayChange('examples', index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-input-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary"
                    placeholder="e.g., Loan applications, Credit checks"
                    disabled={loading}
                  />
                  {formData.examples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('examples', index)}
                      className="px-2 py-2 text-red-600 hover:text-red-800"
                      disabled={loading}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('examples')}
                className="text-primary hover:text-primary/80 text-sm"
                disabled={loading}
              >
                + Add Example
              </button>
              {errors.examples && <p className="text-red-500 text-xs mt-1">{errors.examples}</p>}
            </div>

            {/* Use Case */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Detailed Use Case *
              </label>
              <textarea
                value={formData.useCase}
                onChange={(e) => handleInputChange('useCase', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary ${
                  errors.useCase ? 'border-red-500' : 'border-input-border'
                }`}
                rows={4}
                placeholder="Explain why this data point is needed and how it will be used"
                disabled={loading}
              />
              {errors.useCase && <p className="text-red-500 text-xs mt-1">{errors.useCase}</p>}
            </div>

            {/* Submit Error */}
            {errors.submit && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-red-500 text-sm">{errors.submit}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-border">
              <button
                onClick={onClose}
                className="px-4 py-2 text-text-secondary border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors border border-blue-600"
              >
                {loading ? 'Submitting Proposal...' : 'Submit Proposal'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
