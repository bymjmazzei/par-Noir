import { IdentityOperation } from './types/distributedIdentityManager';

export class OperationLogger {
  private operations: IdentityOperation[] = [];
  private maxOperations: number = 100;

  constructor(maxOperations: number = 100) {
    this.maxOperations = maxOperations;
  }

  /**
   * Log operation for audit trail
   */
  logOperation(
    type: IdentityOperation['type'],
    did: string,
    success: boolean,
    error?: string
  ): void {
    const operation: IdentityOperation = {
      type,
      did,
      timestamp: new Date().toISOString(),
      success,
      error
    };

    this.operations.push(operation);

    // Keep only last N operations
    if (this.operations.length > this.maxOperations) {
      this.operations = this.operations.slice(-this.maxOperations);
    }
  }

  /**
   * Get all operations
   */
  getOperations(): IdentityOperation[] {
    return [...this.operations];
  }

  /**
   * Get operations by type
   */
  getOperationsByType(type: IdentityOperation['type']): IdentityOperation[] {
    return this.operations.filter(op => op.type === type);
  }

  /**
   * Get operations by DID
   */
  getOperationsByDID(did: string): IdentityOperation[] {
    return this.operations.filter(op => op.did === did);
  }

  /**
   * Get successful operations
   */
  getSuccessfulOperations(): IdentityOperation[] {
    return this.operations.filter(op => op.success);
  }

  /**
   * Get failed operations
   */
  getFailedOperations(): IdentityOperation[] {
    return this.operations.filter(op => !op.success);
  }

  /**
   * Get operation count
   */
  getOperationCount(): number {
    return this.operations.length;
  }

  /**
   * Get last operation
   */
  getLastOperation(): IdentityOperation | undefined {
    return this.operations[this.operations.length - 1];
  }

  /**
   * Get operations in time range
   */
  getOperationsInRange(startTime: Date, endTime: Date): IdentityOperation[] {
    return this.operations.filter(op => {
      const opTime = new Date(op.timestamp);
      return opTime >= startTime && opTime <= endTime;
    });
  }

  /**
   * Clear all operations
   */
  clearOperations(): void {
    this.operations = [];
  }

  /**
   * Export operations for audit
   */
  exportOperations(): string {
    return JSON.stringify(this.operations, null, 2);
  }

  /**
   * Get operation statistics
   */
  getOperationStats(): {
    total: number;
    successful: number;
    failed: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    
    this.operations.forEach(op => {
      byType[op.type] = (byType[op.type] || 0) + 1;
    });

    return {
      total: this.operations.length,
      successful: this.getSuccessfulOperations().length,
      failed: this.getFailedOperations().length,
      byType
    };
  }

  /**
   * Update max operations limit
   */
  setMaxOperations(max: number): void {
    this.maxOperations = max;
    
    // Trim if current count exceeds new limit
    if (this.operations.length > this.maxOperations) {
      this.operations = this.operations.slice(-this.maxOperations);
    }
  }

  /**
   * Get max operations limit
   */
  getMaxOperations(): number {
    return this.maxOperations;
  }
}
