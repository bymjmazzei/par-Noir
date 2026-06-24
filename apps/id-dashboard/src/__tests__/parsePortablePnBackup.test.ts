import { parsePortablePnBackup } from '../utils/parsePortablePnBackup';

describe('parsePortablePnBackup', () => {
  const encrypted = {
    publicKey: 'pk-test',
    encryptedData: 'cipher',
    iv: 'iv',
    salt: 'salt',
  };

  it('parses backup wrapper format', () => {
    const parsed = parsePortablePnBackup({
      version: '1.0',
      identities: [encrypted],
    });
    expect(parsed.publicKey).toBe('pk-test');
  });

  it('parses bare encrypted identity', () => {
    expect(parsePortablePnBackup(encrypted).encryptedData).toBe('cipher');
  });

  it('rejects missing payload', () => {
    expect(() => parsePortablePnBackup({ identities: [{}] })).toThrow(/missing encrypted payload/);
  });
});
