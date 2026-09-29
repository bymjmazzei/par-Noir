import { describe, expect, it } from '@jest/globals';
import { cacheActorId } from './cacheActor';

describe('cacheActorId', () => {
  it('does not store the person key, so a dump cannot join it to a session did', () => {
    const did = 'did:pn:person-1';
    const actor = cacheActorId(did);
    expect(actor).not.toBe(did);
    expect(actor).not.toContain('person-1');
    expect(actor).toBe(cacheActorId(did));
    expect(cacheActorId('did:pn:other')).not.toBe(actor);
  });
});
