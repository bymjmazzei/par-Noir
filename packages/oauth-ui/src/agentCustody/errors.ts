import type { AgentCustodyErrorCode } from '@par-noir/standard-data-points';

/** Carries a fixed protocol code only; never a message built from identity material. */
export class AgentCustodyError extends Error {
  readonly code: AgentCustodyErrorCode;

  constructor(code: AgentCustodyErrorCode) {
    super(code);
    this.name = 'AgentCustodyError';
    this.code = code;
  }
}

export function custodyErrorCode(err: unknown): AgentCustodyErrorCode {
  return err instanceof AgentCustodyError ? err.code : 'unavailable';
}
