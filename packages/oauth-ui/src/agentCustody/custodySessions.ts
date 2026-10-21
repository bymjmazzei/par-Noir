/**
 * One owner approval per agent per hour. Whatever was unlocked for the agent lives only in
 * this map and is wiped when the hour ends, on revoke, or when Unlock quits.
 */

import { AGENT_CUSTODY_SESSION_MS } from '@par-noir/standard-data-points';
import { AgentCustodyError } from './errors';

/**
 * After the owner says no, stop asking for a while. The vault counts a cancelled Touch ID as a
 * failed attempt and clears itself after several, so an agent must not be able to re-prompt.
 */
export const AGENT_CUSTODY_DECLINE_COOLDOWN_MS = 10 * 60 * 1000;

type Live<T> = { value: T; expiresAt: number; timer: ReturnType<typeof setTimeout> };

export class AgentCustodySessions<T> {
  private readonly live = new Map<string, Live<T>>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly declinedUntil = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly wipe: (value: T) => void;

  constructor(opts: { wipe: (value: T) => void; ttlMs?: number; declineCooldownMs?: number; now?: () => number }) {
    this.wipe = opts.wipe;
    this.ttlMs = opts.ttlMs ?? AGENT_CUSTODY_SESSION_MS;
    this.cooldownMs = opts.declineCooldownMs ?? AGENT_CUSTODY_DECLINE_COOLDOWN_MS;
    this.now = opts.now ?? Date.now;
  }

  /** The live session for this agent, or one opened by `open` (which prompts the owner). */
  async acquire(agentPn: string, open: () => Promise<T>): Promise<T> {
    const live = this.live.get(agentPn);
    if (live) {
      if (live.expiresAt > this.now()) return live.value;
      this.end(agentPn);
    }
    const declined = this.declinedUntil.get(agentPn);
    if (declined !== undefined) {
      if (declined > this.now()) throw new AgentCustodyError('owner_declined');
      this.declinedUntil.delete(agentPn);
    }
    const inFlight = this.pending.get(agentPn);
    if (inFlight) return inFlight;

    const opening = (async () => {
      try {
        const value = await open();
        const timer = setTimeout(() => this.end(agentPn), this.ttlMs);
        this.live.set(agentPn, { value, expiresAt: this.now() + this.ttlMs, timer });
        return value;
      } catch (err) {
        if (err instanceof AgentCustodyError && err.code === 'owner_declined') {
          this.declinedUntil.set(agentPn, this.now() + this.cooldownMs);
        }
        throw err;
      } finally {
        this.pending.delete(agentPn);
      }
    })();
    this.pending.set(agentPn, opening);
    return opening;
  }

  has(agentPn: string): boolean {
    const live = this.live.get(agentPn);
    return Boolean(live && live.expiresAt > this.now());
  }

  end(agentPn: string): void {
    const live = this.live.get(agentPn);
    if (!live) return;
    clearTimeout(live.timer);
    this.live.delete(agentPn);
    this.wipe(live.value);
  }

  wipeAll(): void {
    for (const agentPn of [...this.live.keys()]) this.end(agentPn);
    this.declinedUntil.clear();
  }
}
