import { 
  DataPointProposal, 
  ProposalResponse, 
  VoteResponse 
} from '../types/standardDataPoints';
import { STANDARD_DATA_POINTS } from '../constants/dataPointRegistry';

export class DataPointProposalManager {
  /**
   * Propose a new standard data point
   */
  static async proposeDataPoint(proposal: Omit<DataPointProposal, 'id' | 'proposedAt' | 'status' | 'votes'>): Promise<ProposalResponse> {
    try {
      // Validate proposal
      if (!proposal.name || !proposal.description || !proposal.useCase) {
        return { success: false, error: 'Missing required fields' };
      }

      // Check if data point already exists
      const existingDataPoint = Object.values(STANDARD_DATA_POINTS).find(
        dp => dp.name.toLowerCase() === proposal.name.toLowerCase()
      );
      if (existingDataPoint) {
        return { success: false, error: 'Data point already exists' };
      }

      // Generate proposal ID
      const proposalId = `proposal_${Date.now()}_${this.generateRandomId(9)}`;
      
      return { success: true, proposalId };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to propose data point' 
      };
    }
  }

  /**
   * Vote on a data point proposal
   */
  static async voteOnProposal(
    proposalId: string, 
    voterId: string, 
    vote: 'upvote' | 'downvote'
  ): Promise<VoteResponse> {
    try {
      // In a real implementation, this would update the proposal in storage
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to vote on proposal' 
      };
    }
  }

  /**
   * Get pending proposals
   */
  static getPendingProposals(): DataPointProposal[] {
    // In a real implementation, this would fetch from storage
    return [];
  }

  /**
   * Get proposal by ID
   */
  static getProposal(proposalId: string): DataPointProposal | undefined {
    // In a real implementation, this would fetch from storage
    return undefined;
  }

  /**
   * Get all available data points
   */
  static getAvailableDataPoints(): any[] {
    return Object.values(STANDARD_DATA_POINTS);
  }

  /**
   * Get data points by category
   */
  static getDataPointsByCategory(category: string): any[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.category === category);
  }

  /**
   * Get data point by ID
   */
  static getDataPoint(id: string): any {
    return STANDARD_DATA_POINTS[id];
  }

  /**
   * Search data points by name or description
   */
  static searchDataPoints(query: string): any[] {
    const lowerQuery = query.toLowerCase();
    return Object.values(STANDARD_DATA_POINTS).filter(dp => 
      dp.name.toLowerCase().includes(lowerQuery) ||
      dp.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get data points by ZKP type
   */
  static getDataPointsByZKPType(zkpType: string): any[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.zkpType === zkpType);
  }

  /**
   * Get data points by privacy level
   */
  static getDataPointsByPrivacyLevel(privacyLevel: string): any[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.defaultPrivacy === privacyLevel);
  }

  /**
   * Generate random ID
   */
  private static generateRandomId(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(crypto.getRandomValues(new Uint8Array(1))[0] / 255 * chars.length));
    }
    return result;
  }
}
