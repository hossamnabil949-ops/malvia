import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { getOne, putIfVersion } from '../_db.js';
import { requireSuperAdminIdentity, writeAdminAudit } from '../_admin.js';
import { ApiError, sendError } from '../_security.js';

const TEST_BRANCH = 'feature/owner-control-center-v1';
const TEST_USERNAME = 'support.qa';

function base32Encode(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function passwordHash(password: string): string {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, 310000, 32, 'sha256');
  return 'pbkdf2$310000$' + salt.toString('base64') + '$' + derived.toString('base64');
}

function encryptTotpSecret(secret: string): string {
  const key = String(process.env.MALVIA_ADMIN_TOTP_ENCRYPTION_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('ADMIN_ENCRYPTION_KEY_MISSING');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return iv.toString('base64url') + '.' + cipher.getAuthTag().toString('base64url') + '.' + body.toString('base64url');
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
    const owner = await requireSuperAdminIdentity(req);
    if (process.env.VERCEL_ENV !== 'preview' ||
        process.env.VERCEL_GIT_COMMIT_REF !== TEST_BRANCH) {
      throw new ApiError('ADMIN_UNAUTHORIZED');
    }

    const existing = await getOne('_registry', '_admin_users');
    const users = Array.isArray(existing?.data) ? existing.data : [];
    if (users.some((user: any) => user.username === TEST_USERNAME)) {
      return res.status(409).json({ code: 'SUPPORT_TEST_ACCOUNT_EXISTS' });
    }

    const password = randomBytes(24).toString('base64url');
    const totpSecret = base32Encode(randomBytes(20));
    const user = {
      username: TEST_USERNAME,
      passwordHash: passwordHash(password),
      totpSecretEnc: encryptTotpSecret(totpSecret),
      totpEnabled: false,
      role: 'SUPPORT',
      createdAt: new Date().toISOString(),
    };

    const version = Number(existing?.version || 0);
    const saved = await putIfVersion('_registry', '_admin_users', [...users, user], version);
    if (saved === null) return res.status(409).json({ code: 'ADMIN_STORAGE_CONFLICT' });

    await writeAdminAudit(owner.username, 'SUPPORT_QA_ACCOUNT_CREATED', {
      username: TEST_USERNAME,
      role: 'SUPPORT',
      previewOnly: true,
    });

    const otpauthUri = 'otpauth://totp/MALVIA:' + encodeURIComponent(TEST_USERNAME) +
      '?secret=' + totpSecret + '&issuer=MALVIA&algorithm=SHA1&digits=6&period=30';
    return res.status(201).json({
      created: true,
      username: TEST_USERNAME,
      password,
      totpSecret,
      otpauthUri,
      note: 'Preview-only QA account. Save these credentials securely; they are shown once.',
    });
  } catch (error) {
    return sendError(res, error);
  }
}
