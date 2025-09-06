import { 
  StandardDataPoint, 
  ZKPGenerationRequest, 
  ZKPProof,
  DataPointProposal,
  ProposalResponse,
  VoteResponse
} from '../types/standardDataPoints';
import { STANDARD_DATA_POINTS } from '../constants/dataPointRegistry';
import { ZKPGenerator } from './zkpGenerator';
import { DataPointProposalManager } from './dataPointProposalManager';

export class StandardDataPoints {
  /**
   * Get all available data points
   */
  static getAvailableDataPoints(): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS);
  }

  /**
   * Get data points by category
   */
  static getDataPointsByCategory(category: string): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.category === category);
  }

  /**
   * Get data point by ID
   */
  static getDataPoint(id: string): StandardDataPoint | undefined {
    return STANDARD_DATA_POINTS[id];
  }

  /**
   * Search data points by name or description
   */
  static searchDataPoints(query: string): StandardDataPoint[] {
    const lowerQuery = query.toLowerCase();
    return Object.values(STANDARD_DATA_POINTS).filter(dp => 
      dp.name.toLowerCase().includes(lowerQuery) ||
      dp.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get data points by ZKP type
   */
  static getDataPointsByZKPType(zkpType: string): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.zkpType === zkpType);
  }

  /**
   * Get data points by privacy level
   */
  static getDataPointsByPrivacyLevel(privacyLevel: string): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.defaultPrivacy === privacyLevel);
  }

  /**
   * Generate ZKP for a standard data point
   */
  static async generateZKP(request: ZKPGenerationRequest): Promise<ZKPProof> {
    return ZKPGenerator.generateZKP(request);
  }

  /**
   * Propose a new standard data point
   */
  static async proposeDataPoint(proposal: Omit<DataPointProposal, 'id' | 'proposedAt' | 'status' | 'votes'>): Promise<ProposalResponse> {
    return DataPointProposalManager.proposeDataPoint(proposal);
  }

  /**
   * Vote on a data point proposal
   */
  static async voteOnProposal(
    proposalId: string, 
    voterId: string, 
    vote: 'upvote' | 'downvote'
  ): Promise<VoteResponse> {
    return DataPointProposalManager.voteOnProposal(proposalId, voterId, vote);
  }

  /**
   * Get pending proposals
   */
  static getPendingProposals(): DataPointProposal[] {
    return DataPointProposalManager.getPendingProposals();
  }

  /**
   * Get proposal by ID
   */
  static getProposal(proposalId: string): DataPointProposal | undefined {
    return DataPointProposalManager.getProposal(proposalId);
  }

  /**
   * Get data point statistics
   */
  static getDataPointStats(): {
    total: number;
    byCategory: Record<string, number>;
    byZKPType: Record<string, number>;
    byPrivacyLevel: Record<string, number>;
  } {
    const allDataPoints = Object.values(STANDARD_DATA_POINTS);
    
    const byCategory: Record<string, number> = {};
    const byZKPType: Record<string, number> = {};
    const byPrivacyLevel: Record<string, number> = {};

    for (const dp of allDataPoints) {
      // Count by category
      byCategory[dp.category] = (byCategory[dp.category] || 0) + 1;
      
      // Count by ZKP type
      byZKPType[dp.zkpType] = (byZKPType[dp.zkpType] || 0) + 1;
      
      // Count by privacy level
      byPrivacyLevel[dp.defaultPrivacy] = (byPrivacyLevel[dp.defaultPrivacy] || 0) + 1;
    }

    return {
      total: allDataPoints.length,
      byCategory,
      byZKPType,
      byPrivacyLevel
    };
  }

  /**
   * Validate data point request
   */
  static validateDataPointRequest(dataPointId: string): boolean {
    return !!STANDARD_DATA_POINTS[dataPointId];
  }

  /**
   * Get data point metadata
   */
  static getDataPointMetadata(dataPointId: string): StandardDataPoint | undefined {
    return STANDARD_DATA_POINTS[dataPointId];
  }

  /**
   * Get ZKP generator
   */
  static getZKPGenerator(): typeof ZKPGenerator {
    return ZKPGenerator;
  }

  /**
   * Get proposal manager
   */
  static getProposalManager(): typeof DataPointProposalManager {
    return DataPointProposalManager;
  }
}
