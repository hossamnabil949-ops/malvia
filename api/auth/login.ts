import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { getOne, createEmployeeSession } from '../_db.js';
import { ApiError, clientIp, findLicense, rateLimit, sendError } from '../_security.js';

function verifyStoredPassword(password: string, employee: any): boolean {
  const stored = String(employee?.passwordHash || '');
  if (stored.startsWith('pbkdf2$')) {
    try {
      const [, iterationsText, saltB64, expectedB64] = stored.split('$');
      const iterations = Number(iterationsText);
      if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 2_000_000) return false;
      const expected = Buffer.from(expectedB64, 'base64');
      const actual = pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iterations, expected.length, 'sha256');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  }
  // Backward compatibility only for explicitly stored legacy passwords; never synthesize a default password.
  const legacy = typeof employee?.password === 'string' ? employee.password : null;
  return legacy !== null && legacy.length > 0 && legacy === password;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
  try {
    const ip = clientIp(req);
    rateLimit(`employee-login:${ip}`, 12, 10 * 60_000);
    const licenseKey = String(req.headers['x-license-key'] || req.body?.licenseKey || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!licenseKey || !username || !password || password.length > 200) throw new ApiError('INVALID_BODY');
    const license = await findLicense(licenseKey);
    if (!license) throw new ApiError('LICENSE_INVALID');
    if (license.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    if (license.expiryDate && String(license.expiryDate) < new Date().toISOString().slice(0, 10)) return res.status(403).json({ code: 'LICENSE_EXPIRED', error: 'انتهت صلاحية ترخيص المحل.' });
    const tenant = String(license.tenantId || '');
    if (!tenant) throw new ApiError('LICENSE_INVALID');
    const row = await getOne(tenant, 'employees');
    const employees = Array.isArray(row?.data) ? row!.data as any[] : [];
    const employee = employees.find((e) => e && e.status !== 'معلق' && (
      String(e.username || '').toLowerCase() === username ||
      String(e.phone || '').toLowerCase() === username ||
      String(e.name || '').toLowerCase() === username
    ));
    if (!employee || !verifyStoredPassword(password, employee)) {
      rateLimit(`employee-login-fail:${ip}`, 8, 10 * 60_000);
      return res.status(401).json({ code: 'EMPLOYEE_INVALID_CREDENTIALS', error: 'اسم المستخدم أو كلمة المرور غير صحيحة، أو أن بيانات الموظف غير متاحة على الخادم.' });
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await createEmployeeSession(tenant, String(employee.id), tokenHash, expiresAt);
    return res.status(200).json({
      token, expiresAt: expiresAt.toISOString(),
      employee: { id: employee.id, name: employee.name, role: employee.role, permissions: employee.permissions },
      tenantId: tenant, license,
    });
  } catch (e) { return sendError(res, e); }
}
