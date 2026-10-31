// تجزئة كلمات المرور بـ PBKDF2-SHA256 (WebCrypto) مع salt عشوائي لكل كلمة.
// الصيغة المخزنة: pbkdf2$<iterations>$<saltBase64>$<hashBase64>
// تعمل بدون إنترنت (النظام يعمل Offline)، وتمنع تخزين كلمة المرور كنص في الداتا المتزامنة والنسخ الاحتياطية.

const ITERATIONS = 150_000;
const PREFIX = 'pbkdf2';

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
};
const fromB64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
}

export const isHashed = (stored?: string): boolean => !!stored && stored.startsWith(`${PREFIX}$`);

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(plain, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!isHashed(stored)) return false;
  const [, iterStr, saltB64, hashB64] = stored.split('$');
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1000 || !saltB64 || !hashB64) return false;
  const expected = fromB64(hashB64);
  const actual = new Uint8Array(await derive(plain, fromB64(saltB64), iterations));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]; // مقارنة بزمن ثابت
  return diff === 0;
}

/** كلمات المرور الافتراضية المعروفة: نحذّر المستخدم لتغييرها. */
export const DEFAULT_PASSWORDS = ['123456', '1234'];
