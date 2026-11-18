// سجل المحلات (التراخيص). القراءة/الكتابة الكاملة لصاحب المنظومة فقط عبر ADMIN_TOKEN.
import { getOne, putIfVersion } from './_db.js';
import { ApiError, clientIp, rateLimit, safeEqual, sendError } from './_security.js';

export default async function handler(req: any, res: any) {
  try {
    const token = String(req.headers['x-admin-token'] || '');
    rateLimit(`admin:${clientIp(req)}`, 30, 10 * 60_000);
    if (!process.env.ADMIN_TOKEN || !safeEqual(token, process.env.ADMIN_TOKEN)) throw new ApiError('ADMIN_UNAUTHORIZED');
    if (req.method === 'GET') {
      const cur = await getOne('_registry', 'licenses');
      return res.status(200).json({ licenses: cur?.data || [], version: cur?.version || 0 });
    }
    if (req.method === 'POST') {
      const { licenses, baseVersion } = req.body || {};
      if (!Array.isArray(licenses) || licenses.length > 10000) throw new ApiError('INVALID_BODY');

      // Validate the complete registry before writing anything.
      const ids = new Set<string>();
      const keys = new Set<string>();
      for (const lic of licenses) {
        if (!lic || typeof lic !== 'object' || !String(lic.id || '').trim() ||
            !String(lic.tenantId || '').trim() || !String(lic.licenseKey || '').trim() ||
            !String(lic.companyName || '').trim() || !String(lic.ownerName || '').trim()) {
          throw new ApiError('INVALID_BODY');
        }
        const id = String(lic.id);
        const key = String(lic.licenseKey).trim().toUpperCase();
        if (ids.has(id) || keys.has(key)) throw new ApiError('INVALID_BODY');
        ids.add(id); keys.add(key);
        const start = String(lic.startDate || '');
        const end = String(lic.expiryDate || '');
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(start) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(end) ||
            Number.isNaN(Date.parse(start + 'T00:00:00Z')) || Number.isNaN(Date.parse(end + 'T00:00:00Z')) ||
            end < start) throw new ApiError('INVALID_BODY');
        if (!Number.isInteger(Number(lic.maxEmployees)) || Number(lic.maxEmployees) < 1) throw new ApiError('INVALID_BODY');
        if (lic.customPrice != null && (!Number.isFinite(Number(lic.customPrice)) || Number(lic.customPrice) < 0)) throw new ApiError('INVALID_BODY');
        if (lic.devicesLimit != null && (!Number.isInteger(Number(lic.devicesLimit)) || Number(lic.devicesLimit) < 1)) throw new ApiError('INVALID_BODY');
      }

      const previous = await getOne('_registry', 'licenses');
      const oldLicenses = Array.isArray(previous?.data) ? previous.data : [];
      const oldById = new Map(oldLicenses.map((item: any) => [String(item.id), item]));
      const changes: any[] = [];
      const now = new Date().toISOString();
      for (const lic of licenses) {
        const before: any = oldById.get(String(lic.id));
        if (!before) {
          changes.push({ at: now, action: 'LICENSE_CREATED', tenantId: lic.tenantId, companyName: lic.companyName, actor: 'OWNER_ADMIN' });
          continue;
        }
        const fields = ['companyName','ownerName','phone','city','plan','startDate','expiryDate','maxEmployees','devicesLimit','customPrice','status','notes'];
        const changed = fields.filter(key => (before[key] ?? null) !== (lic[key] ?? null));
        const oldFeatures = before.allowedFeatures || {};
        const newFeatures = lic.allowedFeatures || {};
        const featureKeys = Array.from(new Set([...Object.keys(oldFeatures), ...Object.keys(newFeatures)]));
        const featureChanges = featureKeys.filter(key => oldFeatures[key] !== newFeatures[key]);
        if (changed.length || featureChanges.length) {
          changes.push({
            at: now, action: 'LICENSE_UPDATED', tenantId: lic.tenantId,
            companyName: lic.companyName, actor: 'OWNER_ADMIN',
            fields: [...changed, ...featureChanges.map(key => 'allowedFeatures.' + key)],
            before: Object.fromEntries(changed.map(key => [key, before[key] ?? null])),
            after: Object.fromEntries(changed.map(key => [key, lic[key] ?? null])),
            featureChanges: featureChanges.map(key => ({ feature: key, from: oldFeatures[key] ?? null, to: newFeatures[key] ?? null })),
          });
        }
      }
      for (const before of oldLicenses) {
        if (!ids.has(String(before.id))) changes.push({ at: now, action: 'LICENSE_REMOVED', tenantId: before.tenantId, companyName: before.companyName, actor: 'OWNER_ADMIN' });
      }

      const v = await putIfVersion('_registry', 'licenses', licenses, Number(baseVersion) || 0);
      if (v === null) return res.status(409).json({ conflict: true });
      if (changes.length) {
        const audit = await getOne('_registry', 'owner_audit');
        const entries = [...(Array.isArray(audit?.data) ? audit.data : []), ...changes].slice(-2000);
        await putIfVersion('_registry', 'owner_audit', entries, Number(audit?.version) || 0);
      }
      return res.status(200).json({ version: v, auditedChanges: changes.length });
    }
    throw new ApiError('METHOD_NOT_ALLOWED');
  } catch (e) {
    return sendError(res, e);
  }
}
