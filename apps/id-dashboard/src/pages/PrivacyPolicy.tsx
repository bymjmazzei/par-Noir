import React from 'react';
import { ArrowLeft } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
  const handleBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <div className="bg-modal-bg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <button
              onClick={handleBack}
              className="flex items-center text-text-secondary hover:text-primary transition-colors mr-4"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back
            </button>
            <h1 className="text-xl font-semibold text-text-primary">Privacy Policy</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-modal-bg rounded-lg shadow-lg p-6 sm:p-8">
          <div className="prose prose-invert max-w-none">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-text-primary mb-2">Privacy Policy - Identity Protocol</h1>
              <p className="text-text-secondary">
                <strong>Last Updated:</strong> December 2024<br />
                <strong>Effective Date:</strong> December 2024
              </p>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🎯 Our Privacy Commitment</h2>
              <p className="text-text-secondary mb-4">
                Identity Protocol is built on the principle of <strong>privacy by design</strong>. We believe that your personal information belongs to you, 
                and we are committed to protecting your privacy while providing a secure, decentralized identity management system.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">📋 Information We Do NOT Collect</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">No Personal Data Collection</h3>
              <p className="text-text-secondary mb-4">
                We do not collect, store, or process your personal information, including:
              </p>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Identity Data:</strong> Your pN names, passcodes, or identity details</li>
                <li><strong>Personal Information:</strong> Names, addresses, phone numbers, or email addresses</li>
                <li><strong>Usage Data:</strong> How you use the service or which features you access</li>
                <li><strong>Device Information:</strong> Device identifiers, IP addresses, or location data</li>
                <li><strong>Biometric Data:</strong> Fingerprint, face, or other biometric information</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">No Tracking or Analytics</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>No Cookies:</strong> We do not use tracking cookies</li>
                <li><strong>No Analytics:</strong> We do not track user behavior or analytics</li>
                <li><strong>No Profiling:</strong> We do not create user profiles or behavioral analysis</li>
                <li><strong>No Third-Party Tracking:</strong> We do not allow third-party tracking</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🔐 How Your Data is Handled</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Local Storage Only</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Device Storage:</strong> All your data is stored locally on your devices</li>
                <li><strong>No Cloud Storage:</strong> We do not store your data on our servers</li>
                <li><strong>User Control:</strong> You have complete control over your data</li>
                <li><strong>Encryption:</strong> All data is encrypted with military-grade encryption</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Decentralized Processing</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Local Processing:</strong> All data processing happens on your devices</li>
                <li><strong>No Server Processing:</strong> We do not process your data on our servers</li>
                <li><strong>Peer-to-Peer:</strong> Direct communication between users when needed</li>
                <li><strong>IPFS Integration:</strong> Optional decentralized metadata storage</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Data Ownership</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Your Ownership:</strong> You own 100% of your identity data</li>
                <li><strong>No License:</strong> We do not claim any rights to your data</li>
                <li><strong>Export Rights:</strong> You can export your data at any time</li>
                <li><strong>Deletion Rights:</strong> You can delete your data completely</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🔄 Data Sharing and Third Parties</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Your Control Over Sharing</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Granular Permissions:</strong> You control exactly what data is shared</li>
                <li><strong>Revocation Rights:</strong> You can revoke access at any time</li>
                <li><strong>Audit Trail:</strong> Complete history of data sharing</li>
                <li><strong>No Automatic Sharing:</strong> Nothing is shared without your explicit consent</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Third-Party Integrations</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Optional Services:</strong> Third-party integrations are completely optional</li>
                <li><strong>Your Choice:</strong> You choose which integrations to use</li>
                <li><strong>Separate Privacy:</strong> Third-party services have their own privacy policies</li>
                <li><strong>No Data Transfer:</strong> We do not transfer your data to third parties</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🛡️ Security Measures</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Encryption Standards</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Military-Grade:</strong> AES-256 encryption for all data</li>
                <li><strong>End-to-End:</strong> Encryption from device to device</li>
                <li><strong>Key Management:</strong> Secure key generation and storage</li>
                <li><strong>No Backdoors:</strong> We cannot access your encrypted data</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Security Practices</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Regular Updates:</strong> Security updates and patches</li>
                <li><strong>Vulnerability Disclosure:</strong> Prompt disclosure of security issues</li>
                <li><strong>Security Audits:</strong> Regular security assessments</li>
                <li><strong>Best Practices:</strong> Following industry security standards</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🔍 Your Privacy Rights</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Right to Access</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Your Data:</strong> You have complete access to your data</li>
                <li><strong>Export Rights:</strong> You can export your data at any time</li>
                <li><strong>Transparency:</strong> Complete transparency about data handling</li>
                <li><strong>No Barriers:</strong> No barriers to accessing your data</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Right to Deletion</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Complete Deletion:</strong> You can delete all your data</li>
                <li><strong>No Retention:</strong> We do not retain deleted data</li>
                <li><strong>Immediate Effect:</strong> Deletion takes effect immediately</li>
                <li><strong>No Recovery:</strong> Deleted data cannot be recovered</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Right to Portability</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Data Export:</strong> Export your data in standard formats</li>
                <li><strong>No Restrictions:</strong> No restrictions on data export</li>
                <li><strong>Multiple Formats:</strong> Export in various formats</li>
                <li><strong>Complete Data:</strong> Export all your data, not just portions</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">📞 Privacy Inquiries and Requests</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Contact Information</h3>
              <ul className="list-none text-text-secondary mb-6 space-y-2">
                <li><strong>Privacy Officer:</strong> privacy@identityprotocol.com</li>
                <li><strong>General Support:</strong> support@identityprotocol.com</li>
                <li><strong>Legal Matters:</strong> legal@identityprotocol.com</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Response Time</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Prompt Response:</strong> We respond to privacy inquiries promptly</li>
                <li><strong>30 Days:</strong> Maximum response time for formal requests</li>
                <li><strong>No Fees:</strong> No fees for privacy-related requests</li>
                <li><strong>Clear Communication:</strong> Clear, understandable responses</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🎯 Privacy Principles</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Privacy by Design</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Built-In Privacy:</strong> Privacy is built into the system design</li>
                <li><strong>Default Privacy:</strong> Privacy is the default setting</li>
                <li><strong>Minimal Data:</strong> Only minimal data is collected (none in our case)</li>
                <li><strong>User Control:</strong> Users have complete control over their data</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Transparency</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Clear Communication:</strong> Clear, understandable privacy information</li>
                <li><strong>No Hidden Practices:</strong> No hidden data collection or processing</li>
                <li><strong>Open Source:</strong> Source code is available for review</li>
                <li><strong>Regular Updates:</strong> Regular updates on privacy practices</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">📝 Privacy Policy Summary</h2>
              <ol className="list-decimal list-inside text-text-secondary space-y-2">
                <li><strong>No Data Collection:</strong> We do not collect your personal information</li>
                <li><strong>Local Storage:</strong> All data is stored locally on your devices</li>
                <li><strong>Your Ownership:</strong> You own 100% of your data</li>
                <li><strong>Your Control:</strong> You control what data is shared</li>
                <li><strong>Strong Encryption:</strong> Military-grade encryption protects your data</li>
                <li><strong>No Tracking:</strong> No tracking, analytics, or profiling</li>
                <li><strong>Privacy Rights:</strong> You have all standard privacy rights</li>
                <li><strong>Transparency:</strong> Complete transparency about data handling</li>
              </ol>
            </section>

            <div className="text-center mt-12 pt-8 border-t border-border">
              <p className="text-text-secondary">
                <strong>This Privacy Policy explains how Identity Protocol protects your privacy in our decentralized identity management system.</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
