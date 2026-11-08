import { createHash } from 'node:crypto';
import { getAuthenticatedEmployee, listSyncRejections } from './_db.js';
import { ApiError, clientIp, findLicense, rateLimit, sendError } from './_security.js';

/** Durable sync rejection history is visible to tenant owners/general managers only. */
export default async function handler(req: any, res: any) {
  let phase = 'request_validation';
  try {
    if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) throw new ApiError('LICENSE_REQUIRED');
    rateLimit(`sync-notifications:${clientIp(req)}`, 90, 60_000);

    phase = 'license_lookup';
    const license = await findLicense(key);
    if (!license) throw new ApiError('LICENSE_INVALID');
    if (license.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const tenant = String(license.tenantId);

    phase = 'employee_authentication';
    const bearer = String(req.headers.authorization || '').match(/^Bearer\\s+(.+)$/i)?.[1] || '';
    if (!bearer) return res.status(401).json({ code: 'EMPLOYEE_SESSION_REQUIRED', error: 'يلزم تسجيل الدخول لعرض إشعارات المزامنة.' });
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const employee = await getAuthenticatedEmployee(tenant, tokenHash);
    if (!employee) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'جلسة الموظف غير صالحة أو انتهت.' });

    const role = String(employee.role || '').trim().toUpperCase();
    // Notifications are restricted to an explicit administrator role. A username or
    // wildcard permission alone must never grant access to sensitive audit history.
    const isGeneralManager = ['مدير عام', 'ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(role);
    if (!isGeneralManager) return res.status(403).json({ code: 'SYNC_NOTIFICATIONS_FORBIDDEN', error: 'عرض إشعارات رفض المزامنة متاح للمدير العام فقط.' });

    phase = 'load_notifications';
    const rawLimit = Number(req.query?.limit || 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 50;
    const notifications = await listSyncRejections(tenant, limit);
    return res.status(200).json({ notifications });
  } catch (error: any) {
    console.error('[MALVIA_SYNC_NOTIFICATIONS_FAILURE]', {
      phase,
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: typeof error?.code === 'string' || typeof error?.code === 'number' ? String(error.code).slice(0, 80) : undefined,
    });
    return sendError(res, error);
  }
}
