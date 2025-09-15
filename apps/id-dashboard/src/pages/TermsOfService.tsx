import React from 'react';
import { ArrowLeft } from 'lucide-react';

const TermsOfService: React.FC = () => {
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
            <h1 className="text-xl font-semibold text-text-primary">Terms of Service</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-modal-bg rounded-lg shadow-lg p-6 sm:p-8">
          <div className="prose prose-invert max-w-none">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-text-primary mb-2">Terms of Service - Identity Protocol</h1>
              <p className="text-text-secondary">
                <strong>Last Updated:</strong> December 2024<br />
                <strong>Effective Date:</strong> December 2024
              </p>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🎯 Agreement to Terms</h2>
              <p className="text-text-secondary mb-4">
                By accessing or using the Identity Protocol ("Service"), you agree to be bound by these Terms of Service ("Terms"). 
                If you disagree with any part of these terms, you may not access the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">📋 Service Description</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">What We Provide</h3>
              <p className="text-text-secondary mb-4">
                Identity Protocol is a decentralized identity management system that enables users to:
              </p>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li>Create and manage their own digital identities</li>
                <li>Control access to their personal information</li>
                <li>Recover access through custodian-based recovery</li>
                <li>Synchronize identities across multiple devices</li>
                <li>Integrate with third-party applications</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Decentralized Nature</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>No Central Control:</strong> We do not control or manage your identity data</li>
                <li><strong>User Ownership:</strong> You own and control all your identity information</li>
                <li><strong>Local Storage:</strong> Data is stored locally on your devices</li>
                <li><strong>Peer-to-Peer:</strong> Direct communication between users</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">👤 User Accounts and Responsibilities</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Account Creation</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Self-Service:</strong> You create your own identity without our involvement</li>
                <li><strong>No Registration:</strong> No traditional account registration required</li>
                <li><strong>Local Setup:</strong> Identity creation happens on your device</li>
                <li><strong>No Verification:</strong> We do not verify your identity information</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Your Responsibilities</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Secure Devices:</strong> Keep your devices secure and updated</li>
                <li><strong>Strong Passcodes:</strong> Use strong, unique passcodes</li>
                <li><strong>Backup Management:</strong> Maintain secure backups of your data</li>
                <li><strong>Custodian Management:</strong> Keep recovery custodians active</li>
                <li><strong>Legal Compliance:</strong> Use the service in compliance with applicable laws</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Prohibited Uses</h3>
              <p className="text-text-secondary mb-3">You agree not to:</p>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Illegal Activities:</strong> Use the service for illegal purposes</li>
                <li><strong>Fraud:</strong> Create false or misleading identities</li>
                <li><strong>Harassment:</strong> Use identities to harass or harm others</li>
                <li><strong>Impersonation:</strong> Impersonate others without authorization</li>
                <li><strong>Security Attacks:</strong> Attempt to compromise the system</li>
                <li><strong>Spam:</strong> Use the service for spam or unwanted communications</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🔐 Security and Privacy</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Your Security Responsibilities</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Device Security:</strong> Secure your devices against unauthorized access</li>
                <li><strong>Passcode Management:</strong> Use strong, unique passcodes</li>
                <li><strong>Recovery Setup:</strong> Maintain active recovery custodians</li>
                <li><strong>Backup Security:</strong> Secure your encrypted backups</li>
                <li><strong>Third-Party Security:</strong> Secure third-party integrations</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Our Security Commitments</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Encryption:</strong> Military-grade encryption for all data</li>
                <li><strong>No Backdoors:</strong> We cannot access your encrypted data</li>
                <li><strong>Security Updates:</strong> Regular security improvements</li>
                <li><strong>Vulnerability Disclosure:</strong> Prompt disclosure of security issues</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🛡️ Intellectual Property</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Open Source License</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>MIT License:</strong> The Identity Protocol software is licensed under MIT License</li>
                <li><strong>Source Code:</strong> Source code is available for review and modification</li>
                <li><strong>Contributions:</strong> Community contributions are welcome</li>
                <li><strong>Attribution:</strong> Proper attribution is required for modifications</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Your Content</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>Your Ownership:</strong> You retain ownership of your identity data</li>
                <li><strong>No License Grant:</strong> You do not grant us rights to your data</li>
                <li><strong>Export Rights:</strong> You can export your data at any time</li>
                <li><strong>Deletion Rights:</strong> You can delete your data at any time</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🚨 Disclaimers and Limitations</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">Service Disclaimers</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>As-Is Service:</strong> Service is provided "as is" without warranties</li>
                <li><strong>No Guarantees:</strong> We do not guarantee service availability or performance</li>
                <li><strong>User Responsibility:</strong> Users are responsible for their own security</li>
                <li><strong>Third-Party Risks:</strong> Third-party services carry their own risks</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Limitation of Liability</h3>
              <ul className="list-disc list-inside text-text-secondary mb-6 space-y-2">
                <li><strong>No Consequential Damages:</strong> We are not liable for consequential damages</li>
                <li><strong>Limited Liability:</strong> Liability is limited to the extent permitted by law</li>
                <li><strong>Force Majeure:</strong> We are not liable for events beyond our control</li>
                <li><strong>User Indemnification:</strong> Users indemnify us against certain claims</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">📞 Contact Information</h2>
              
              <h3 className="text-xl font-semibold text-text-primary mb-3">General Inquiries</h3>
              <ul className="list-none text-text-secondary mb-6 space-y-2">
                <li><strong>Email:</strong> support@identityprotocol.com</li>
                <li><strong>Documentation:</strong> docs.identityprotocol.com</li>
                <li><strong>Community:</strong> community.identityprotocol.com</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mb-3">Legal Matters</h3>
              <ul className="list-none text-text-secondary mb-6 space-y-2">
                <li><strong>Legal:</strong> legal@identityprotocol.com</li>
                <li><strong>Privacy:</strong> privacy@identityprotocol.com</li>
                <li><strong>Security:</strong> security@identityprotocol.com</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">🎯 Key Terms Summary</h2>
              <ol className="list-decimal list-inside text-text-secondary space-y-2">
                <li><strong>Decentralized Service:</strong> No central control over your data</li>
                <li><strong>User Ownership:</strong> You own and control your identity data</li>
                <li><strong>Security Responsibility:</strong> You are responsible for your security</li>
                <li><strong>Open Source:</strong> Software is open source under MIT license</li>
                <li><strong>Privacy First:</strong> No collection of personal information</li>
                <li><strong>Legal Compliance:</strong> Use must comply with applicable laws</li>
                <li><strong>Limited Liability:</strong> We have limited liability for damages</li>
                <li><strong>Termination Rights:</strong> You can terminate use at any time</li>
              </ol>
            </section>

            <div className="text-center mt-12 pt-8 border-t border-border">
              <p className="text-text-secondary">
                <strong>These Terms of Service govern your use of the Identity Protocol decentralized identity management system.</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
