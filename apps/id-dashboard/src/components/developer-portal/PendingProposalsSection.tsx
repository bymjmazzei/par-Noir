import React from 'react';

interface Proposal {
  id: string;
  name: string;
  description: string;
  proposedBy: string;
  category: string;
  votes: {
    upvotes: number;
    downvotes: number;
  };
}

interface PendingProposalsSectionProps {
  pendingProposals: Proposal[];
}

export const PendingProposalsSection: React.FC<PendingProposalsSectionProps> = React.memo(({ 
  pendingProposals 
}) => {
  return (
    <section className="py-20">
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {/* View Pending Proposals */}
        <div className="bg-secondary rounded-lg p-8">
          <div className="w-16 h-16 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-text-primary mb-4">Pending Proposals</h3>
          <p className="text-text-secondary mb-6">
            Review and vote on data point proposals from the community. 
            Help shape the future of standardized data collection.
          </p>
          <div className="text-center">
            <div className="text-3xl font-bold text-text-primary mb-2">{pendingProposals.length}</div>
            <div className="text-text-secondary">Pending Proposals</div>
          </div>
        </div>
      </div>

      {/* Pending Proposals List */}
      {pendingProposals.length > 0 && (
        <div className="bg-secondary rounded-lg p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Recent Proposals</h3>
          <div className="space-y-4">
            {pendingProposals.slice(0, 3).map((proposal) => (
              <div key={proposal.id} className="bg-bg-primary rounded-lg p-4 border border-border">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-text-primary mb-1">{proposal.name}</h4>
                    <p className="text-sm text-text-secondary mb-2">{proposal.description}</p>
                    <div className="flex items-center space-x-4 text-xs text-text-secondary">
                      <span>Proposed by: {proposal.proposedBy}</span>
                      <span>Category: {proposal.category}</span>
                      <span>Votes: {proposal.votes.upvotes - proposal.votes.downvotes}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600">
                      Vote
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pendingProposals.length > 3 && (
            <div className="text-center mt-4">
              <button className="text-primary hover:text-accent font-medium">
                View All {pendingProposals.length} Proposals →
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
});

PendingProposalsSection.displayName = 'PendingProposalsSection';
