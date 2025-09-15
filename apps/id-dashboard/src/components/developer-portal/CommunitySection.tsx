import React from 'react';

export const CommunitySection: React.FC = React.memo(() => {
  return (
    <section id="community" className="py-20">
      <div className="text-center mb-16">
        <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Join the Community</h2>
        <p className="text-xl text-text-secondary">Connect with developers building the future of digital identity.</p>
      </div>
      
      <div className="grid md:grid-cols-1 gap-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">GitHub</h3>
          <p className="text-text-secondary mb-4">Contribute to the protocol, report issues, and explore the source code.</p>
          <a 
            href="https://github.com/bymjmazzei/par-Noir" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
});

CommunitySection.displayName = 'CommunitySection';
