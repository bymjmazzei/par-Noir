import { DataPointProposal } from '../types/DataPointTypes';
import { SecureMetadataStorage } from './secureMetadataStorage';
import { DataPointProposal as MetadataDataPointProposal } from './secureMetadata';
import { SecureRandom } from './secureRandom';

// Data Point Proposal Management
export class DataPointProposalManager {
  /**
   * Propose a new standard data point
   */
  static async proposeDataPoint(
    proposal: Omit<DataPointProposal, 'id' | 'proposedAt' | 'status' | 'votes'>,
    identityId: string,
    pnName: string,
    passcode: string
  ): Promise<{ success: boolean; proposalId?: string; error?: string }> {
    try {
      // Validate proposal
      if (!proposal.name || !proposal.description || !proposal.useCase) {
        return { success: false, error: 'Missing required fields' };
      }

      // Generate proposal ID
      const proposalId = `proposal_${Date.now()}_${SecureRandom.generateId(9)}`;
      
      // Create proposal
      const newProposal: MetadataDataPointProposal = {
        ...proposal,
        id: proposalId,
        proposedAt: new Date().toISOString(),
        status: 'pending',
        votes: {
          upvotes: 0,
          downvotes: 0,
          voters: []
        }
      };

      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(identityId);
      
      if (!currentMetadata) {
        return { success: false, error: 'Failed to retrieve metadata' };
      }

      // Add proposal to metadata
      if (!currentMetadata.dataPointProposals) {
        currentMetadata.dataPointProposals = [];
      }
      
      currentMetadata.dataPointProposals.push(newProposal);

      // Save updated metadata
      await SecureMetadataStorage.saveMetadata(identityId, currentMetadata, pnName, passcode);

      return { success: true, proposalId };
    } catch (error) {
      // Console statement removed for production
      return { success: false, error: 'Failed to propose data point' };
    }
  }

  /**
   * Vote on a data point proposal
   */
  static async voteOnProposal(
    proposalId: string,
    vote: 'upvote' | 'downvote',
    identityId: string,
    pnName: string,
    passcode: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current metadata
      const currentMetadata = await SecureMetadataStorage.getMetadata(identityId);
      
      if (!currentMetadata || !currentMetadata.dataPointProposals) {
        return { success: false, error: 'No proposals found' };
      }

      // Find the proposal
      const proposal = currentMetadata.dataPointProposals.find(p => p.id === proposalId);
      if (!proposal) {
        return { success: false, error: 'Proposal not found' };
      }

      // Check if user already voted
      if (proposal.votes.voters.includes(identityId)) {
        return { success: false, error: 'Already voted on this proposal' };
      }

      // Update vote counts
      if (vote === 'upvote') {
        proposal.votes.upvotes++;
      } else {
        proposal.votes.downvotes++;
      }
      
      proposal.votes.voters.push(identityId);

      // Save updated metadata
      await SecureMetadataStorage.saveMetadata(identityId, currentMetadata, pnName, passcode);

      return { success: true };
    } catch (error) {
      // Console statement removed for production
      return { success: false, error: 'Failed to vote on proposal' };
    }
  }

  /**
   * Get all proposals for an identity
   */
  static async getProposals(identityId: string): Promise<DataPointProposal[]> {
    try {
      const metadata = await SecureMetadataStorage.getMetadata(identityId);
      return metadata?.dataPointProposals || [];
    } catch (error) {
      // Console statement removed for production
      return [];
    }
  }

  /**
   * Get proposal by ID
   */
  static async getProposal(proposalId: string, identityId: string): Promise<DataPointProposal | null> {
    try {
      const proposals = await this.getProposals(identityId);
      return proposals.find(p => p.id === proposalId) || null;
    } catch (error) {
      // Console statement removed for production
      return null;
    }
  }
}
