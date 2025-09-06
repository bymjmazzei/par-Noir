import React from 'react';

interface DeveloperPortalHeaderProps {
  licenseInfo: any;
  onShowLicenseModal: () => void;
  onShowProposalModal: () => void;
}

export const DeveloperPortalHeader: React.FC<DeveloperPortalHeaderProps> = React.memo(({ 
  licenseInfo, 
  onShowLicenseModal, 
  onShowProposalModal 
}) => {
  const getLicenseStatus = () => {
    if (!licenseInfo) return { status: 'Open Source', color: 'text-gray-400', bgColor: 'bg-gray-800', expiration: null };
    
    switch (licenseInfo.type) {
      case 'perpetual':
        return { status: 'Perpetual License', color: 'text-green-400', bgColor: 'bg-green-900', expiration: null };
      case 'annual':
        const expiration = new Date(licenseInfo.expirationDate);
        return { 
          status: 'Annual License', 
          color: 'text-blue-400', 
          bgColor: 'bg-blue-900', 
          expiration: expiration.toLocaleDateString() 
        };
      default:
        return { status: 'Unknown', color: 'text-gray-400', bgColor: 'bg-gray-800', expiration: null };
    }
  };

  const licenseStatus = getLicenseStatus();

  return (
    <section className="py-20 bg-gradient-to-br from-primary to-accent">
      <div className="text-center mb-16">
        <h1 className="text-4xl lg:text-6xl font-bold text-bg-primary mb-6">
          Developer Portal
        </h1>
        <p className="text-xl lg:text-2xl text-bg-primary text-opacity-90 mb-8">
          Build the future of digital identity with par Noir
        </p>
        
        {/* License Status */}
        <div className={`inline-flex items-center px-6 py-3 ${licenseStatus.bgColor} rounded-full mb-8`}>
          <span className={`text-lg font-semibold ${licenseStatus.color}`}>
            {licenseStatus.status}
          </span>
          {licenseStatus.expiration && (
            <span className={`ml-2 text-sm ${licenseStatus.color} opacity-75`}>
              (Expires: {licenseStatus.expiration})
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {!licenseInfo && (
            <button
              onClick={onShowLicenseModal}
              className="px-8 py-4 bg-bg-primary text-primary rounded-lg font-semibold text-lg hover:bg-opacity-90 transition-all transform hover:scale-105"
            >
              Get Commercial License
            </button>
          )}
          <button
            onClick={onShowProposalModal}
            className="px-8 py-4 bg-bg-primary bg-opacity-20 text-bg-primary border-2 border-bg-primary rounded-lg font-semibold text-lg hover:bg-opacity-30 transition-all transform hover:scale-105"
          >
            Propose Data Point
          </button>
        </div>
      </div>
    </section>
  );
});

DeveloperPortalHeader.displayName = 'DeveloperPortalHeader';
