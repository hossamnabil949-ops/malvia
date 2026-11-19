// سجل المحلات (التراخيص). القراءة والكتابة تتطلب جلسة مسؤول MALVIA موثقة.
import { getOne, putIfVersion } from './_db.js';
import { ApiError, sendError } from './_security.js';
import { requireAdminIdentity } from './_admin.js';

async function appendOwnerAudit(entriesToAdd: any[]): Promise<boolean> {
  if (!entriesToAdd.length) return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const audit = await getOne('_registry', 'owner_audit');
    const existing = Array.isArray(audit?.data) ? audit.data : [];
    const next = [...existing, ...entriesToAdd].slice(-2000);
    const saved = await putIfVersion('_registry', 'owner_audit', next, Number(audit?.version) || 0);
    if (saved !== null) return true;
  }
  return false;
}

export default async function handler(req: any, res: any) {
  try {
    const admin = await requireAdminIdentity(req);
    if (req.method === 'GET') {
      const resource = String(req.query?.resource || 'licenses');
      if (!['licenses', 'owner_audit', 'plans'].includes(resource)) throw new ApiError('INVALID_BODY');
      const cur = await getOne('_registry', resource);
      const data = cur?.data || (resource === 'licenses' ? [] : []);
      return res.status(200).json({ [resource]: data, version: cur?.version || 0 });
    }
    if (req.method === 'POST') {
      const { resource = 'licenses', licenses, plans, baseVersion } = req.body || {};
      if (resource === 'plans') {
        if (!Array.isArray(plans) || plans.length > 100) throw new ApiError('INVALID_BODY');
        const ids = new Set<string>();
        const names = new Set<string>();
        for (const plan of plans) {
          if (!plan || typeof plan !== 'object' || !String(plan.id || '').trim() ||
              !String(plan.name || '').trim() || ids.has(String(plan.id))) throw new ApiError('INVALID_BODY');
          ids.add(String(plan.id));
          const normalizedName = String(plan.name).trim().toLocaleLowerCase();
          if (names.has(normalizedName)) throw new ApiError('INVALID_BODY');
          names.add(normalizedName);
          for (const field of ['monthlyPrice','annualPrice','maxEmployees','devicesLimit']) {
            if (!Number.isFinite(Number(plan[field])) || Number(plan[field]) < 0) throw new ApiError('INVALID_BODY');
          }
          if (!Number.isInteger(Number(plan.maxEmployees)) || Number(plan.maxEmployees) < 1 ||
              !Number.isInteger(Number(plan.devicesLimit)) || Number(plan.devicesLimit) < 1) throw new ApiError('INVALID_BODY');
          if (typeof plan.active !== 'boolean' || !plan.allowedFeatures || typeof plan.allowedFeatures !== 'object' || Array.isArray(plan.allowedFeatures)) throw new ApiError('INVALID_BODY');
          if (Object.values(plan.allowedFeatures).some(value => typeof value !== 'boolean')) throw new ApiError('INVALID_BODY');
        }
        const current = await getOne('_registry', 'plans');
        const oldPlans = Array.isArray(current?.data) ? current.data : [];
        const oldById = new Map(oldPlans.map((item: any) => [String(item.id), item]));
        const planChanges: any[] = [];
        for (const plan of plans) {
          const before: any = oldById.get(String(plan.id));
          if (!before) {
            planChanges.push({ action: 'PLAN_CREATED', planId: plan.id, planName: plan.name });
            continue;
          }
          const fields = ['name','monthlyPrice','annualPrice','maxEmployees','devicesLimit','active'];
          const changed = fields.filter(key => (before[key] ?? null) !== (plan[key] ?? null));
          const oldFeatures = before.allowedFeatures || {};
          const newFeatures = plan.allowedFeatures || {};
          const featureKeys = Array.from(new Set([...Object.keys(oldFeatures), ...Object.keys(newFeatures)]));
          const featureChanges = featureKeys.filter(key => oldFeatures[key] !== newFeatures[key]);
          if (changed.length || featureChanges.length) {
            planChanges.push({
              action: 'PLAN_UPDATED', planId: plan.id, planName: plan.name,
              fields: [...changed, ...featureChanges.map(key => 'allowedFeatures.' + key)],
              before: Object.fromEntries(changed.map(key => [key, before[key] ?? null])),
              after: Object.fromEntries(changed.map(key => [key, plan[key] ?? null])),
              featureChanges: featureChanges.map(key => ({ feature: key, from: oldFeatures[key] ?? null, to: newFeatures[key] ?? null })),
            });
          }
        }
        const newIds = new Set(plans.map((plan: any) => String(plan.id)));
        for (const before of oldPlans) {
          if (!newIds.has(String(before.id))) planChanges.push({ action: 'PLAN_REMOVED', planId: before.id, planName: before.name });
        }
        const version = await putIfVersion('_registry', 'plans', plans, Number(baseVersion) || 0);
        if (version === null) return res.status(409).json({ conflict: true });
        const auditSaved = await appendOwnerAudit(planChanges.map(change => ({
          at: new Date().toISOString(), actor: admin.username, ...change,
          previousVersion: current?.version || 0, newVersion: version,
        })));
        return res.status(200).json({ version, auditSaved, auditedChanges: planChanges.length });
      }
      if (resource !== 'licenses') throw new ApiError('INVALID_BODY');
      if (!Array.isArray(licenses) || licenses.length > 10000) throw new ApiError('INVALID_BODY');

      // Validate the complete registry before writing anything.
      const ids = new Set<string>();
      const tenantIds = new Set<string>();
      const keys = new Set<string>();
      for (const lic of licenses) {
        if (!lic || typeof lic !== 'object' || !String(lic.id || '').trim() ||
            !String(lic.tenantId || '').trim() || !String(lic.licenseKey || '').trim() ||
            !String(lic.companyName || '').trim() || !String(lic.ownerName || '').trim()) {
          throw new ApiError('INVALID_BODY');
        }
        const id = String(lic.id);
        const tenantId = String(lic.tenantId).trim();
        const key = String(lic.licenseKey).trim().toUpperCase();
        if (ids.has(id) || tenantIds.has(tenantId) || keys.has(key)) throw new ApiError('INVALID_BODY');
        ids.add(id); tenantIds.add(tenantId); keys.add(key);
        const start = String(lic.startDate || '');
        const end = String(lic.expiryDate || '');
        const validDate = (value: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
          new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
        if (!validDate(start) || !validDate(end) || end < start) throw new ApiError('INVALID_BODY');
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
          changes.push({ at: now, action: 'LICENSE_CREATED', tenantId: lic.tenantId, companyName: lic.companyName, actor: admin.username });
          continue;
        }
        const fields = ['companyName','ownerName','phone','city','plan','startDate','expiryDate','maxEmployees','devicesLimit','customPrice','status','notes'];
        const changed = fields.filter(key => (before[key] ?? null) !== (lic[key] ?? null));
        if (String(before.licenseKey || '') !== String(lic.licenseKey || '')) changed.push('licenseKey');
        const oldFeatures = before.allowedFeatures || {};
        const newFeatures = lic.allowedFeatures || {};
        const featureKeys = Array.from(new Set([...Object.keys(oldFeatures), ...Object.keys(newFeatures)]));
        const featureChanges = featureKeys.filter(key => oldFeatures[key] !== newFeatures[key]);
        if (changed.length || featureChanges.length) {
          changes.push({
            at: now, action: 'LICENSE_UPDATED', tenantId: lic.tenantId,
            companyName: lic.companyName, actor: admin.username,
            fields: [...changed, ...featureChanges.map(key => 'allowedFeatures.' + key)],
            before: Object.fromEntries(changed.filter(key => key !== 'licenseKey').map(key => [key, before[key] ?? null])),
            after: Object.fromEntries(changed.filter(key => key !== 'licenseKey').map(key => [key, lic[key] ?? null])),
            featureChanges: featureChanges.map(key => ({ feature: key, from: oldFeatures[key] ?? null, to: newFeatures[key] ?? null })),
          });
        }
      }
      for (const before of oldLicenses) {
        if (!ids.has(String(before.id))) changes.push({ at: now, action: 'LICENSE_REMOVED', tenantId: before.tenantId, companyName: before.companyName, actor: admin.username });
      }

      const v = await putIfVersion('_registry', 'licenses', licenses, Number(baseVersion) || 0);
      if (v === null) return res.status(409).json({ conflict: true });
      const auditSaved = await appendOwnerAudit(changes);
      return res.status(200).json({ version: v, auditedChanges: changes.length, auditSaved });
    }
    throw new ApiError('METHOD_NOT_ALLOWED');
  } catch (e) {
    return sendError(res, e);
  }
}
