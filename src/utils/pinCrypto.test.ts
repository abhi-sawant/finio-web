import { describe, expect, it } from 'vitest';
import {
  derivePinHash,
  fromBase64Url,
  generateSalt,
  isValidPin,
  timingSafeEqualB64,
  toBase64Url,
  verifyPin,
} from './pinCrypto';

/** Tests use a low iteration count to stay fast; production uses PIN_HASH_ITERATIONS. */
const ITERATIONS = 1000;

describe('base64url', () => {
  it('round-trips at every padding boundary', () => {
    for (const length of [0, 1, 2, 3, 16, 32]) {
      const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37) % 256));
      expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('emits url-safe output with no padding', () => {
    // 0xfb 0xff would encode as "+/" in standard base64.
    const encoded = toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf, 0xfe]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('isValidPin', () => {
  it('accepts a run of 4 to 8 ASCII digits', () => {
    expect(isValidPin('0000')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
  });

  it('rejects anything too short or too long', () => {
    expect(isValidPin('')).toBe(false);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
  });

  it('rejects non-digits, including full-width digits', () => {
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('1234 ')).toBe(false);
    // A naive Number()-based check would accept this and then never match on unlock.
    expect(isValidPin('１２３４')).toBe(false);
  });
});

describe('generateSalt', () => {
  it('produces 16 random bytes', () => {
    expect(fromBase64Url(generateSalt())).toHaveLength(16);
  });

  it('does not repeat itself', () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('derivePinHash', () => {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA';

  it('is deterministic for the same pin, salt and iteration count', async () => {
    const a = await derivePinHash('1234', salt, ITERATIONS);
    const b = await derivePinHash('1234', salt, ITERATIONS);
    expect(a).toBe(b);
  });

  it('produces a 32-byte digest', async () => {
    expect(fromBase64Url(await derivePinHash('1234', salt, ITERATIONS))).toHaveLength(32);
  });

  it('changes with the pin, the salt, or the iteration count', async () => {
    const base = await derivePinHash('1234', salt, ITERATIONS);
    expect(await derivePinHash('4321', salt, ITERATIONS)).not.toBe(base);
    expect(await derivePinHash('1234', generateSalt(), ITERATIONS)).not.toBe(base);
    expect(await derivePinHash('1234', salt, ITERATIONS + 1)).not.toBe(base);
  });
});

describe('timingSafeEqualB64', () => {
  it('matches identical values', () => {
    const value = toBase64Url(new Uint8Array([1, 2, 3, 4]));
    expect(timingSafeEqualB64(value, value)).toBe(true);
  });

  it('rejects a different length', () => {
    expect(
      timingSafeEqualB64(toBase64Url(new Uint8Array([1, 2])), toBase64Url(new Uint8Array([1]))),
    ).toBe(false);
  });

  it('rejects a single flipped bit', () => {
    expect(
      timingSafeEqualB64(
        toBase64Url(new Uint8Array([1, 2, 3, 4])),
        toBase64Url(new Uint8Array([1, 2, 3, 5])),
      ),
    ).toBe(false);
  });
});

describe('verifyPin', () => {
  it('accepts the correct pin', async () => {
    const salt = generateSalt();
    const hash = await derivePinHash('1234', salt, ITERATIONS);
    expect(await verifyPin('1234', { salt, hash, iterations: ITERATIONS })).toBe(true);
  });

  it('rejects a wrong pin', async () => {
    const salt = generateSalt();
    const hash = await derivePinHash('1234', salt, ITERATIONS);
    expect(await verifyPin('4321', { salt, hash, iterations: ITERATIONS })).toBe(false);
  });

  it('rejects the right pin against a different salt', async () => {
    const hash = await derivePinHash('1234', generateSalt(), ITERATIONS);
    expect(await verifyPin('1234', { salt: generateSalt(), hash, iterations: ITERATIONS })).toBe(
      false,
    );
  });

  it('rejects a hash produced with a different iteration count', async () => {
    const salt = generateSalt();
    const hash = await derivePinHash('1234', salt, ITERATIONS);
    expect(await verifyPin('1234', { salt, hash, iterations: ITERATIONS * 2 })).toBe(false);
  });

  it('rejects a truncated or malformed stored hash instead of throwing', async () => {
    const salt = generateSalt();
    const hash = await derivePinHash('1234', salt, ITERATIONS);
    expect(await verifyPin('1234', { salt, hash: hash.slice(0, 10), iterations: ITERATIONS })).toBe(
      false,
    );
  });
});
