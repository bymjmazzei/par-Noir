import React from 'react';

interface LicenseFeaturesProps {
  licenseType: string;
}

export const LicenseFeatures: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const getFeatures = (type: string) => {
    switch (type) {
      case 'free':
        return [
          'Free non-commercial use',
          'Research and development',
          'Personal projects',
          'Community support'
        ];
      case 'perpetual':
        return [
          'Lifetime commercial use',
          'Commercial use rights',
          'Full access to protocol features',
          'No monthly fees'
        ];
      case 'annual':
        return [
          'Annual commercial use',
          'Commercial use rights',
          'Full access to protocol features',
          'All updates included'
        ];
      default:
        return [];
    }
  };

  const features = getFeatures(licenseType);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3 mb-4">
      <h4 className="font-medium mb-2 text-white">License Features</h4>
      <ul className="text-sm space-y-1">
        {features.map((feature, index) => (
          <li key={index} className="text-gray-300">• {feature}</li>
        ))}
      </ul>
    </div>
  );
};
