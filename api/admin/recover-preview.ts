import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getOne, putIfVersion } from '../_db.js';

const BRANCH = 'feature/owner-control-center-v1';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function base32(bytes: Buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function encrypt(secret: string) {
  const key = String(process.env.MALVIA_ADMIN_TOTP_ENCRYPTION_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('ADMIN_ENCRYPTION_KEY_MISSING');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return iv.toString('base64url') + '.' + cipher.getAuthTag().toString('base64url') + '.' + body.toString('base64url');
}
async function write(resource: string, data: unknown) {
  for (let i = 0; i < 8; i++) {
    const current = await getOne('_registry', resource);
    const next = await putIfVersion('_registry', resource, data, Number(current?.version || 0));
    if (next !== null) return next;
  }
  throw new Error('ADMIN_STORAGE_CONFLICT');
}

export default async function handler(req: any, res: any) {
  // This route is deliberately unusable outside the exact isolated Preview branch.
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== BRANCH) {
    return res.status(404).json({ code: 'NOT_FOUND' });
  }
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
  const origin = String(req.headers?.origin || '');
  if (!origin || new URL(origin).host !== String(req.headers?.host || '')) {
    return res.status(403).json({ code: 'ADMIN_CROSS_ORIGIN' });
  }

  const expected = String(process.env.MALVIA_ADMIN_PREVIEW_RECOVERY_TOKEN || '');
  const supplied = String(req.headers?.['x-malvia-preview-recovery'] || req.body?.recoveryToken || '');
  if (expected.length < 40 || !safeEqual(expected, supplied)) {
    return res.status(401).json({ code: 'PREVIEW_RECOVERY_UNAUTHORIZED' });
  }

  try {
    const used = await getOne('_registry', '_admin_preview_recovery');
    if (used?.data && (used.data as any).usedAt) {
      return res.status(409).json({ code: 'PREVIEW_RECOVERY_ALREADY_USED' });
    }
    // Consume the one-time capability before changing the account, preventing concurrent replay.
    const consumed = await putIfVersion('_registry', '_admin_preview_recovery', {
      usedAt: new Date().toISOString(), tokenHash: sha(expected),
    }, Number(used?.version || 0));
    if (consumed === null) return res.status(409).json({ code: 'PREVIEW_RECOVERY_ALREADY_USED' });

    const usersRow = await getOne('_registry', '_admin_users');
    const users = Array.isArray(usersRow?.data) ? usersRow!.data as any[] : [];
    const owners = users.filter(user => user?.role === 'SUPER_ADMIN' && !user?.disabled);
    if (owners.length !== 1 || !owners[0]?.passwordHash || !owners[0]?.username) {
      return res.status(409).json({ code: 'PREVIEW_OWNER_RECORD_INVALID' });
    }
    const secret = base32(randomBytes(20));
    const updatedUsers = users.map(user => user.username === owners[0].username
      ? { ...user, totpSecretEnc: encrypt(secret), totpEnabled: false }
      : user);
    await write('_admin_users', updatedUsers);
    await write('_admin_sessions', []);
    await write('_admin_audit', [
      ...((await getOne('_registry', '_admin_audit'))?.data as any[] || []),
      { at: new Date().toISOString(), actor: owners[0].username, action: 'ADMIN_PREVIEW_TOTP_RECOVERED' },
    ].slice(-2000));

    const uri = 'otpauth://totp/MALVIA:' + encodeURIComponent(owners[0].username) +
      '?secret=' + secret + '&issuer=MALVIA&algorithm=SHA1&digits=6&period=30';
    return res.status(200).json({
      setupRequired: true, username: owners[0].username, totpSecret: secret, otpauthUri: uri,
      passwordHashPreserved: true, environment: 'preview',
    });
  } catch (error: any) {
    console.error('[MALVIA_PREVIEW_RECOVERY_ERROR]', { code: error?.message || 'UNKNOWN' });
    return res.status(500).json({ code: 'PREVIEW_RECOVERY_FAILED' });
  }
}
