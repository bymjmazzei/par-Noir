/**
 * DMCA Policy – par Noir
 * Designated agent and index-only takedown policy. We do not host content.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface DmcaPolicyProps {
  onClose?: () => void;
}

const DmcaPolicy: React.FC<DmcaPolicyProps> = ({ onClose }) => {
  const handleBack = () => {
    if (onClose) onClose();
    else window.history.back();
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
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
            <h1 className="text-xl font-semibold text-text-primary">DMCA Policy</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-modal-bg rounded-lg shadow-lg p-6 sm:p-8">
          <div className="prose prose-invert max-w-none">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-text-primary mb-2">DMCA Policy</h1>
              <p className="text-text-secondary">
                <strong>Last Updated:</strong> February 2025
              </p>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">What We Do and Do Not Do</h2>
              <p className="text-text-secondary mb-4">
                par Noir <strong>does not host content</strong>. We provide an indexing and discovery layer; content stays in users&apos; own storage (e.g. Google Drive). A &quot;takedown&quot; means we <strong>remove the content from our index and from third-party indexes</strong>—we stop listing it in discovery and feeds. We <strong>cannot</strong> physically delete the file from the user&apos;s Google Drive.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">Designated Agent</h2>
              <p className="text-text-secondary mb-2">
                To send a DMCA takedown notice or counter-notice, contact our designated agent:
              </p>
              <p className="text-text-secondary mb-2">
                <strong>Email:</strong> dmca@parnoir.com<br />
                <strong>Mailing address:</strong> [Designated agent physical address to be added]
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">Takedown Notices</h2>
              <p className="text-text-secondary mb-4">
                To submit a valid DMCA takedown notice under 17 U.S.C. § 512(c)(3), your notice must include:
              </p>
              <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
                <li>Your name and contact information</li>
                <li>Identification of the copyrighted work you believe has been infringed</li>
                <li>Identification of the material you claim is infringing (e.g. file ID or URL on our index)</li>
                <li>A statement that you have a good-faith belief that use of the material is not authorized</li>
                <li>A statement that the information in the notice is accurate and, under penalty of perjury, that you are authorized to act on behalf of the copyright owner</li>
                <li>Your physical or electronic signature</li>
              </ul>
              <p className="text-text-secondary">
                Upon acceptance of a valid notice, we will remove the material from our index and from third-party indexes only. We do not host or delete files from users&apos; storage.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">Counter-Notice</h2>
              <p className="text-text-secondary mb-4">
                If your content was removed due to a takedown notice and you believe it was mistaken or misidentified, you may submit a counter-notice. We will forward it to the original claimant. If no legal action (e.g. court order) is received within 10–14 business days, we may re-list the content on the index. The file was never deleted from your storage—only delisted.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-text-primary mb-4">Repeat Infringer Policy</h2>
              <p className="text-text-secondary">
                Accounts that repeatedly make content available that is the subject of upheld takedowns or Prism denials may be restricted or terminated in accordance with our repeat infringer policy.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DmcaPolicy;
