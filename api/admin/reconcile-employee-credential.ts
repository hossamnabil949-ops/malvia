import { getOne, putIfVersion } from '../_db.js';
import { ApiError, sendError } from '../_security.js';
import { requireAdminIdentity, writeAdminAudit } from '../_admin.js';
import { Buffer } from 'node:buffer';

function isValidPasswordHash(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256) return false;
  const parts = value.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 2000000) return false;
  const canonicalBase64 = (input: string) => {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) return false;
    return Buffer.from(input, 'base64').toString('base64') === input;
  };
  if (!canonicalBase64(parts[2]) || !canonicalBase64(parts[3])) return false;
  return Buffer.from(parts[2], 'base64').length === 16 &&
    Buffer.from(parts[3], 'base64').length === 32;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED');
    const admin = await requireAdminIdentity(req);
    if (admin.role !== 'SUPER_ADMIN') throw new ApiError('ADMIN_UNAUTHORIZED');

    if (req.method === 'GET') {
      const licenseId = String(req.query?.licenseId || '');
      const tenantId = String(req.query?.tenantId || '');
      if (!licenseId || !tenantId) throw new ApiError('INVALID_BODY');
      const registry = await getOne('_registry', 'licenses');
      const licenses = Array.isArray(registry?.data) ? registry.data : [];
      const license = licenses.find((item: any) => String(item.id) === licenseId && String(item.tenantId) === tenantId);
      if (!license) throw new ApiError('LICENSE_INVALID');
      const current = await getOne(tenantId, 'employees');
      const employees = Array.isArray(current?.data) ? current.data : [];
      return res.status(200).json({
        version: Number(current?.version || 0),
        employees: employees.map((item: any) => ({
          id: String(item?.id || ''), name: String(item?.name || ''),
          username: String(item?.username || ''), status: String(item?.status || 'نشط'),
        })).filter((item: any) => item.id),
      });
    }

    const { licenseId, tenantId, employeeId, passwordHash, baseVersion } = req.body || {};
    if (typeof licenseId !== 'string' || !licenseId.trim() ||
        typeof tenantId !== 'string' || !tenantId.trim() ||
        typeof employeeId !== 'string' || !employeeId.trim() ||
        !Number.isInteger(baseVersion) || baseVersion < 0 ||
        !isValidPasswordHash(passwordHash)) {
      throw new ApiError('INVALID_BODY');
    }

    const registry = await getOne('_registry', 'licenses');
    const licenses = Array.isArray(registry?.data) ? registry.data : [];
    const license = licenses.find((item: any) =>
      String(item.id) === licenseId && String(item.tenantId) === tenantId
    );
    if (!license) throw new ApiError('LICENSE_INVALID');

    const current = await getOne(tenantId, 'employees');
    const employees = Array.isArray(current?.data) ? current.data : [];
    const index = employees.findIndex((item: any) => String(item?.id) === employeeId);
    if (index < 0) throw new ApiError('INVALID_BODY');
    if (employees[index]?.status === 'معلق') throw new ApiError('INVALID_BODY');

    const next = employees.map((item: any, i: number) => {
      if (i !== index) return item;
      const { password: _legacyPlain, ...safeEmployee } = item;
      return { ...safeEmployee, passwordHash };
    });

    const savedVersion = await putIfVersion(tenantId, 'employees', next, baseVersion);
    if (savedVersion === null) {
      return res.status(409).json({ code: 'VERSION_CONFLICT', conflict: true, error: 'تغير سجل الموظفين منذ قراءته. أعد تحميل البيانات قبل المحاولة.' });
    }

    await writeAdminAudit(admin.username, 'EMPLOYEE_CREDENTIAL_RECONCILED', {
      tenantId, licenseId, employeeId, previousVersion: baseVersion, newVersion: savedVersion,
    });
    return res.status(200).json({ success: true, version: savedVersion });
  } catch (error) {
    return sendError(res, error);
  }
}
