import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

@Injectable()
export class RefreshTokenHasher {
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  verify(token: string, tokenHash: string): boolean {
    const presented = createHash('sha256').update(token).digest('hex');
    const expected = Buffer.from(tokenHash, 'utf8');
    const actual = Buffer.from(presented, 'utf8');
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  }
}
