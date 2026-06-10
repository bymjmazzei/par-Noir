import { replaceInCell } from './driveMigrationSheetsService';

describe('replaceInCell', () => {
  const pred = 'pn-aaaaaaaaaaaa';
  const succ = 'pn-bbbbbbbbbbbb';
  const predDid = 'did:key:pred';
  const succDid = 'did:key:succ';

  it('replaces full pn identifier', () => {
    expect(replaceInCell('owner pn-aaaaaaaaaaaa file', pred, succ)).toBe('owner pn-bbbbbbbbbbbb file');
  });

  it('replaces short pn hash segment', () => {
    expect(replaceInCell('aaaaaaaaaaaa', pred, succ)).toBe('bbbbbbbbbbbb');
  });

  it('replaces did when provided', () => {
    expect(replaceInCell(predDid, pred, succ, predDid, succDid)).toBe(succDid);
  });

  it('returns empty unchanged', () => {
    expect(replaceInCell('', pred, succ)).toBe('');
  });
});
