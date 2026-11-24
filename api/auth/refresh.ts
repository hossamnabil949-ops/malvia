import { createHash } from 'node:crypto';
import { extendEmployeeSession, getAuthenticatedEmployee } from '../_db.js';
import { clientIp, findLicense, rateLimit } from '../_security.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
  try {
    const ip = clientIp(req);
    rateLimit(`employee-session-refresh:${ip}`, 60, 10 * 60_000);

    const licenseKey = String(req.headers['x-license-key'] || '').trim();
    if (!licenseKey) return res.status(400).json({ code: 'LICENSE_REQUIRED', error: 'مفتاح الترخيص مطلوب.' });
    const license = await findLicense(licenseKey);
    if (!license) return res.status(403).json({ code: 'LICENSE_INVALID', error: 'مفتاح الترخيص غير صالح.' });
    if (license.status === 'معلق مؤقتاً') return res.status(403).json({ code: 'LICENSE_SUSPENDED', error: 'الترخيص معلق.' });
    if (license.expiryDate && String(license.expiryDate) < new Date().toISOString().slice(0, 10)) {
      return res.status(403).json({ code: 'LICENSE_EXPIRED', error: 'انتهت صلاحية ترخيص المحل.' });
    }

    const bearer = String(req.headers.authorization || '').match(/^Bearer\\s+(.+)$/i)?.[1] || '';
    if (!bearer) return res.status(401).json({ code: 'EMPLOYEE_SESSION_REQUIRED', error: 'جلسة الموظف مطلوبة.' });
    const tenant = String(license.tenantId || '');
    if (!tenant) return res.status(403).json({ code: 'LICENSE_INVALID', error: 'بيانات الترخيص غير مكتملة.' });

    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const employee = await getAuthenticatedEmployee(tenant, tokenHash);
    if (!employee) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'انتهت جلسة الموظف. سجّل الدخول مجدداً.' });

    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const extended = await extendEmployeeSession(tenant, tokenHash, expiresAt);
    if (!extended) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'انتهت جلسة الموظف. سجّل الدخول مجدداً.' });

    return res.status(200).json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Employee session refresh failed:', error);
    return res.status(500).json({ code: 'SESSION_REFRESH_FAILED', error: 'تعذّر تجديد جلسة الموظف حالياً.' });
  }
}
