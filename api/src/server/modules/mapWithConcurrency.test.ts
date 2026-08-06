/**
 * @jest-environment node
 */

import { mapWithConcurrency } from './googleApiRetry';

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (n) => {
      await new Promise((r) => setTimeout(r, (6 - n) * 5));
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('caps in-flight work at the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await mapWithConcurrency(items, 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBe(3);
  });

  it('rejects on first failure and stops starting new work', async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
        started.push(n);
        await new Promise((r) => setTimeout(r, 10));
        if (n === 2) throw new Error('boom');
        return n;
      })
    ).rejects.toThrow('boom');

    // Workers already in flight may finish starting, but we should not run all five.
    expect(started.length).toBeLessThan(5);
    expect(started).toContain(2);
  });

  it('returns empty array for empty input', async () => {
    const results = await mapWithConcurrency([], 4, async (n) => n);
    expect(results).toEqual([]);
  });
});
