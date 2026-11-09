import { createHash } from 'node:crypto';
import { getAuthenticatedEmployee } from './_db.js';
import { ApiError, clientIp, findLicense, rateLimit, sendError } from './_security.js';
import { verifyOwnerCredential } from './_ownerApproval.js';

/** Re-authenticates the active server session and owner password before a purchase-invoice mutation flow. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
  try {
    const ip = clientIp(req);
    rateLimit(`purchase-invoice-owner-approval:${ip}`, 5, 10 * 60_000);
    const licenseKey = String(req.headers['x-license-key'] || '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!licenseKey || !bearer || !password || password.length > 200) throw new ApiError('INVALID_BODY');
    const license = await findLicense(licenseKey);
    if (!license) throw new ApiError('LICENSE_INVALID');
    if (license.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const tenant = String(license.tenantId || '');
    if (!tenant) throw new ApiError('LICENSE_INVALID');
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const employee = await getAuthenticatedEmployee(tenant, tokenHash);
    if (!employee || employee.role !== 'مدير عام' || employee.status !== 'نشط') {
      return res.status(403).json({ code: 'OWNER_REQUIRED', error: 'هذه العملية تتطلب جلسة مالك نشطة.' });
    }
    if (!verifyOwnerCredential(password, employee)) {
      rateLimit(`purchase-invoice-owner-password:${ip}:${employee.id}`, 5, 10 * 60_000);
      return res.status(403).json({ code: 'OWNER_PASSWORD_INVALID', error: 'كلمة مرور المالك غير صحيحة.' });
    }
    return res.status(200).json({ approved: true, ownerId: employee.id, ownerName: employee.name });
  } catch (error) {
    return sendError(res, error);
  }
}
