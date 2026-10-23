// نقطة المزامنة: GET يرجّع كل بيانات المحل، POST يكتب مورد واحد بشرط الإصدار.
// الاعتماد: مفتاح الترخيص (x-license-key). سجل التراخيص محفوظ كمورد داخل tenant "_registry".
// التحقق من المدخلات وحد المعدل وأكواد الأخطاء في _security.ts.
import { getAll, getOne, putIfVersion } from './_db.js';
import { ApiError, clientIp, findLicense, rateLimit, sendError, validateSyncBody } from './_security.js';

export default async function handler(req: any, res: any) {
  try {
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) throw new ApiError('LICENSE_REQUIRED');
    const ip = clientIp(req);
    rateLimit(`sync:${ip}`, 300, 60_000);
    const lic = await findLicense(key);
    if (!lic) { rateLimit(`bad-key:${ip}`, 10, 10 * 60_000); throw new ApiError('LICENSE_INVALID'); }
    if (lic.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const tenant = String(lic.tenantId);

    if (req.method === 'GET') {
      return res.status(200).json({ tenant: lic, docs: await getAll(tenant) });
    }
    if (req.method === 'POST') {
      const { resource, data, baseVersion } = validateSyncBody(req.body);
      const v = await putIfVersion(tenant, resource, data, baseVersion);
      if (v === null) {
        return res.status(409).json({ conflict: true, code: 'VERSION_CONFLICT', current: await getOne(tenant, resource) });
      }
      return res.status(200).json({ version: v });
    }
    throw new ApiError('METHOD_NOT_ALLOWED');
  } catch (e) {
    return sendError(res, e);
  }
}
