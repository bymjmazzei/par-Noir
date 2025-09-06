import React from 'react';

export const DocumentationSection: React.FC = React.memo(() => {
  return (
    <section id="docs" className="py-20 bg-secondary rounded-lg">
      <div className="text-center mb-16">
        <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Documentation</h2>
        <p className="text-xl text-text-secondary">Everything you need to build with par Noir.</p>
      </div>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="bg-bg-primary rounded-lg p-6">
          <div className="w-12 h-12 bg-primary bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">API Reference</h3>
          <p className="text-text-secondary mb-4">Complete API documentation with examples for every endpoint and method.</p>
          <a href="https://bymjmazzei.github.io/par-Noir/#authentication" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">View API Docs →</a>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-6">
          <div className="w-12 h-12 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Zero-Knowledge Proofs</h3>
          <p className="text-text-secondary mb-4">Learn how to implement privacy-preserving features with cryptographic proofs.</p>
          <a href="https://bymjmazzei.github.io/par-Noir/#zero-knowledge-proofs" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">ZKP Guide →</a>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-6">
          <div className="w-12 h-12 bg-purple-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Social Recovery</h3>
          <p className="text-text-secondary mb-4">Implement secure identity recovery through trusted networks.</p>
          <a href="https://bymjmazzei.github.io/par-Noir/#social-recovery" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Recovery Guide →</a>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-6">
          <div className="w-12 h-12 bg-red-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Security Best Practices</h3>
          <p className="text-text-secondary mb-4">Learn security best practices for building production-ready identity applications.</p>
          <a href="https://bymjmazzei.github.io/par-Noir/#security" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Security Guide →</a>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-6">
          <div className="w-12 h-12 bg-yellow-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Performance Optimization</h3>
          <p className="text-text-secondary mb-4">Optimize your application for speed and scalability.</p>
          <a href="https://bymjmazzei.github.io/par-Noir/#performance" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Performance Guide →</a>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-6">
          <div className="w-12 h-12 bg-indigo-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Deployment Guide</h3>
          <p className="text-text-secondary mb-4">Deploy your identity application to production environments.</p>
          <a href="https://bymjmazzei.github.io/par-Noir/#deployment" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Deployment Guide →</a>
        </div>
      </div>
    </section>
  );
});

DocumentationSection.displayName = 'DocumentationSection';
