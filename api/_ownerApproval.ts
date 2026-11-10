import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

/** Server-side verification for owner-only operations. Never synthesizes a default password. */
export function verifyOwnerCredential(password: string, employee: any): boolean {
  if (!password || password.length > 200 || employee?.role !== 'مدير عام' || employee?.status !== 'نشط') return false;
  const stored = String(employee?.passwordHash || '');
  if (stored.startsWith('pbkdf2$')) {
    try {
      const [, iterationsText, saltB64, expectedB64] = stored.split('$');
      const iterations = Number(iterationsText);
      if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 2_000_000 || !saltB64 || !expectedB64) return false;
      const expected = Buffer.from(expectedB64, 'base64');
      if (expected.length !== 32) return false;
      const actual = pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iterations, expected.length, 'sha256');
      return timingSafeEqual(actual, expected);
    } catch { return false; }
  }
  // Legacy support is limited to a password explicitly stored on this active owner record.
  // No implicit/default password is accepted.
  return typeof employee?.password === 'string' && employee.password.length > 0 && employee.password === password;
}
