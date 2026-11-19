import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { getOne, putIfVersion } from './_db.js';
import { ApiError } from './_security.js';

const COOKIE = 'malvia_admin_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const ITERATIONS = 310000;
type AdminUser = { username: string; passwordHash: string; totpSecretEnc: string; totpEnabled: boolean; role: 'SUPER_ADMIN' | 'SUPPORT'; disabled?: boolean; createdAt: string };
type AdminIdentity = { username: string; role: 'SUPER_ADMIN' | 'SUPPORT' };

function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function equal(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function makePasswordHash(password: string): string {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return 'pbkdf2$' + ITERATIONS + '$' + salt.toString('base64') + '$' + derived.toString('base64');
}
function checkPassword(password: string, encoded: string): boolean {
  try {
    const parts = encoded.split('$');
    const rounds = Number(parts[1]);
    const expected = Buffer.from(parts[3] || '', 'base64');
    if (parts[0] !== 'pbkdf2' || !Number.isInteger(rounds) || rounds < 200000 || rounds > 1000000 || expected.length !== 32) return false;
    const actual = pbkdf2Sync(password, Buffer.from(parts[2], 'base64'), rounds, 32, 'sha256');
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}
function keyBytes(): Buffer {
  const key = String(process.env.MALVIA_ADMIN_TOTP_ENCRYPTION_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('ADMIN_ENCRYPTION_KEY_MISSING');
  return Buffer.from(key, 'hex');
}
function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return iv.toString('base64url') + '.' + cipher.getAuthTag().toString('base64url') + '.' + body.toString('base64url');
}
function decryptSecret(value: string): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('ADMIN_SECRET_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(parts[0], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
}
function base32Encode(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('ADMIN_TOTP_SECRET_INVALID');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}
function totp(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
  return String(binary % 1000000).padStart(6, '0');
}
function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some(delta => equal(totp(secret, counter + delta), code));
}
async function readDoc<T>(resource: string, fallback: T): Promise<{ data: T; version: number }> {
  const row = await getOne('_registry', resource);
  return { data: (row?.data as T) ?? fallback, version: Number(row?.version || 0) };
}
async function mutateDoc<T>(resource: string, fallback: T, update: (current: T) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readDoc<T>(resource, fallback);
    const next = update(current.data);
    if (await putIfVersion('_registry', resource, next, current.version) !== null) return next;
  }
  throw new Error('ADMIN_STORAGE_CONFLICT');
}
async function appendAudit(actor: string, action: string, metadata: Record<string, unknown> = {}) {
  await mutateDoc<any[]>('_admin_audit', [], rows => [...rows, {
    at: new Date().toISOString(), actor: actor.slice(0, 80), action, metadata,
  }].slice(-2000));
}
async function persistentLimit(bucket: string, max: number, windowMs: number) {
  const now = Date.now();
  let blocked = false;
  await mutateDoc<any[]>('_admin_rate_limits', [], rows => {
    const active = rows.filter(item => Number(item.resetAt) > now && item.key !== bucket);
    const existing = rows.find(item => item.key === bucket && Number(item.resetAt) > now);
    const next = existing ? { ...existing, hits: Number(existing.hits) + 1 } : { key: bucket, hits: 1, resetAt: now + windowMs };
    blocked = Number(next.hits) > max;
    return [...active, next].slice(-1000);
  });
  if (blocked) throw new Error('RATE_LIMITED');
}
function cookieToken(req: any): string {
  const raw = String(req.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== COOKIE) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ''; }
  }
  return '';
}
function setCookie(res: any, token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + Math.max(0, Math.floor(maxAge / 1000)) + secure);
}
function clearCookie(res: any) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secure);
}
function assertSameOrigin(req: any) {
  const origin = String(req.headers?.origin || '');
  if (!origin) return;
  try {
    if (new URL(origin).host !== String(req.headers?.host || '')) throw new Error('ADMIN_CROSS_ORIGIN');
  } catch { throw new Error('ADMIN_CROSS_ORIGIN'); }
}
async function issueSession(username: string, res: any): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_MS;
  await mutateDoc<any[]>('_admin_sessions', [], rows => [
    ...rows.filter(item => item.username !== username && Number(item.expiresAt) > Date.now()),
    { tokenHash: sha(token), username, createdAt: Date.now(), expiresAt, revokedAt: null },
  ].slice(-5000));
  setCookie(res, token, SESSION_MS);
  return new Date(expiresAt).toISOString();
}
export async function getAdminIdentity(req: any): Promise<AdminIdentity | null> {
  try {
    const token = cookieToken(req);
    if (token.length < 40) return null;
    const sessions = (await readDoc<any[]>('_admin_sessions', [])).data;
    const session = sessions.find(item => item.tokenHash === sha(token) && !item.revokedAt && Number(item.expiresAt) > Date.now());
    if (!session) return null;
    const users = (await readDoc<AdminUser[]>('_admin_users', [])).data;
    const user = users.find(item => item.username === session.username && item.totpEnabled && !item.disabled);
    if (!user) return null;
    return { username: user.username, role: user.role };
  } catch { return null; }
}
export async function requireAdminIdentity(req: any): Promise<AdminIdentity> {
  const identity = await getAdminIdentity(req);
  if (!identity) throw new ApiError('ADMIN_UNAUTHORIZED');
  return identity;
}
export async function writeAdminAudit(actor: string, action: string, metadata: Record<string, unknown> = {}) {
  await appendAudit(actor, action, metadata);
}
export async function handleAdminAuth(req: any, res: any) {
  const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (req.method === 'GET') {
    const identity = await getAdminIdentity(req);
    const users = (await readDoc<AdminUser[]>('_admin_users', [])).data;
    return res.status(200).json({ authenticated: !!identity, admin: identity, bootstrapAvailable: users.length === 0 });
  }
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
  assertSameOrigin(req);
  const action = String(req.body?.action || '');
  await persistentLimit('admin-auth:' + ip, 25, 10 * 60 * 1000);
  if (action === 'bootstrap') {
    const configured = String(process.env.MALVIA_ADMIN_BOOTSTRAP_TOKEN || '');
    const supplied = String(req.body?.bootstrapToken || '');
    if (configured.length < 32 || !equal(configured, supplied)) return res.status(401).json({ code: 'ADMIN_BOOTSTRAP_UNAUTHORIZED', error: 'رمز التهيئة غير صحيح أو غير مضبوط.' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 14 || password.length > 200) return res.status(400).json({ code: 'ADMIN_SETUP_INVALID', error: 'اسم المستخدم غير صالح أو كلمة المرور يجب ألا تقل عن 14 حرفاً.' });
    const current = (await readDoc<AdminUser[]>('_admin_users', [])).data;
    if (current.length) return res.status(409).json({ code: 'ADMIN_ALREADY_BOOTSTRAPPED', error: 'تم إعداد حساب الإدارة بالفعل.' });
    const secret = base32Encode(randomBytes(20));
    const user: AdminUser = { username, passwordHash: makePasswordHash(password), totpSecretEnc: encryptSecret(secret), totpEnabled: false, role: 'SUPER_ADMIN', createdAt: new Date().toISOString() };
    await mutateDoc<AdminUser[]>('_admin_users', [], rows => rows.length ? rows : [user]);
    await appendAudit(username, 'ADMIN_BOOTSTRAP_STARTED');
    const uri = 'otpauth://totp/MALVIA:' + encodeURIComponent(username) + '?secret=' + secret + '&issuer=MALVIA&algorithm=SHA1&digits=6&period=30';
    return res.status(200).json({ setupRequired: true, username, totpSecret: secret, otpauthUri: uri });
  }
  if (action === 'confirm-setup') {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const code = String(req.body?.code || '');
    const users = (await readDoc<AdminUser[]>('_admin_users', [])).data;
    const user = users.find(item => item.username === username && !item.disabled);
    if (!user || user.totpEnabled || !verifyTotp(decryptSecret(user.totpSecretEnc), code)) return res.status(401).json({ code: 'ADMIN_TOTP_INVALID', error: 'رمز التحقق غير صحيح أو انتهت جلسة التهيئة.' });
    await mutateDoc<AdminUser[]>('_admin_users', [], rows => rows.map(item => item.username === username ? { ...item, totpEnabled: true } : item));
    const expiresAt = await issueSession(username, res);
    await appendAudit(username, 'ADMIN_TOTP_ENABLED');
    return res.status(200).json({ authenticated: true, admin: { username, role: user.role }, expiresAt });
  }
  if (action === 'login') {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const code = String(req.body?.code || '');
    await persistentLimit('admin-login:' + ip + ':' + username, 8, 10 * 60 * 1000);
    const users = (await readDoc<AdminUser[]>('_admin_users', [])).data;
    const user = users.find(item => item.username === username && !item.disabled);
    const validPassword = user ? checkPassword(password, user.passwordHash) : false;
    const validCode = user?.totpEnabled ? verifyTotp(decryptSecret(user.totpSecretEnc), code) : false;
    if (!user || !validPassword || !validCode) {
      await appendAudit(username || 'UNKNOWN', 'ADMIN_LOGIN_REJECTED');
      return res.status(401).json({ code: 'ADMIN_INVALID_CREDENTIALS', error: 'بيانات الدخول أو رمز التحقق غير صحيحة.' });
    }
    const expiresAt = await issueSession(username, res);
    await appendAudit(username, 'ADMIN_LOGIN_SUCCEEDED');
    return res.status(200).json({ authenticated: true, admin: { username, role: user.role }, expiresAt });
  }
  if (action === 'logout') {
    const token = cookieToken(req);
    if (token) await mutateDoc<any[]>('_admin_sessions', [], rows => rows.map(item => item.tokenHash === sha(token) ? { ...item, revokedAt: Date.now() } : item));
    clearCookie(res);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ code: 'ADMIN_ACTION_INVALID' });
}
