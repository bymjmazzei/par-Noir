import React, { useState } from 'react';

interface ComplianceField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'select' | 'checkbox' | 'textarea';
  required: boolean;
  description: string;
  options?: string[];
  validation?: RegExp;
}

interface ComplianceDataCollectionProps {
  platform: string;
  fields: ComplianceField[];
  consentText: string;
  dataUsage: string;
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
}

export const ComplianceDataCollection: React.FC<ComplianceDataCollectionProps> = ({
  platform,
  fields,
  consentText,
  dataUsage,
  onSubmit,
  onCancel
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // const [error, setError] = useState<string | null>(null);
  // const [isSubmitted, setIsSubmitted] = useState(false);

  const handleInputChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    
    // Clear error when user starts typing
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  // const validateField = (field: ComplianceField, value: any): string => {
  //   if (field.required && (!value || value.toString().trim() === '')) {
  //     return `${field.label} is required`;
  //   }

  //   if (value && field.validation && !field.validation.test(value.toString())) {
  //     return `${field.label} format is invalid`;
  //   }

  //   return '';
  // };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      // setError(null);
      
      await onSubmit(formData);
              // setIsSubmitted(true);
    } catch (error) {
      // setError('Failed to submit compliance data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: ComplianceField) => {
    const value = formData[field.key] || '';
    const error = errors[field.key];

    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <input
            type={field.type}
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder={field.description}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => handleInputChange(field.key, e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 text-sm text-gray-700">{field.description}</label>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            rows={3}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder={field.description}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Additional Information Required
        </h2>
        <p className="text-gray-600">
          {platform} requires additional information to complete your account setup.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {fields.map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {renderField(field)}
            {errors[field.key] && (
              <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
            )}
            {field.description && !field.type.includes('checkbox') && (
              <p className="mt-1 text-xs text-gray-500">{field.description}</p>
            )}
          </div>
        ))}

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Data Usage</h3>
          <p className="text-sm text-blue-800 mb-4">{dataUsage}</p>
          
          <div className="flex items-start">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
            />
            <label className="ml-2 text-sm text-blue-800">
              {consentText}
            </label>
          </div>
          {errors.consent && (
            <p className="mt-1 text-sm text-red-600">{errors.consent}</p>
          )}
        </div>

        <div className="flex space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ComplianceDataCollection;