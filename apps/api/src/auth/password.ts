import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt from Node's own crypto, so no extra dependency.
 * Cost N = 2^15, r = 8, p = 1 (about 32 MB and a few tens of milliseconds a
 * check), with a 16-byte random salt. Stored as "scrypt$N$r$p$salt$hash".
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_BYTES = 32;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize('NFC'),
      salt,
      KEY_BYTES,
      { ...options, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** True when the password matches the stored hash. Takes as long whether or not it does. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash to check against when there is no such user, so that both take the same time. */
export const DUMMY_HASH = await hashPassword(randomBytes(12).toString('base64'));
