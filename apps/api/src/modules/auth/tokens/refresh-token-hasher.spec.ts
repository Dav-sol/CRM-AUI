import { RefreshTokenHasher } from './refresh-token-hasher';

describe('RefreshTokenHasher', () => {
  let hasher: RefreshTokenHasher;

  beforeEach(() => {
    hasher = new RefreshTokenHasher();
  });

  it('hashes a token to a sha256 hex string', () => {
    const hash = hasher.hash('opaque-refresh-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies a matching token', () => {
    const token = 'opaque-refresh-token';
    expect(hasher.verify(token, hasher.hash(token))).toBe(true);
  });

  it('rejects a different token', () => {
    expect(hasher.verify('other-token', hasher.hash('original-token'))).toBe(
      false,
    );
  });

  it('never stores the raw token', () => {
    const token = 'super-secret-token-value';
    const hash = hasher.hash(token);
    expect(hash).not.toContain(token);
  });
});
