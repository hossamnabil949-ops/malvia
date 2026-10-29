// النسخ الاحتياطي واسترجاع بيانات المحلات.
//  - النسخة اليومية التلقائية: ملف api/cron-backup.ts (Vercel Cron)
//  - العميل (ترخيصه):    GET  /api/backup?action=export     (x-license-key)  ملف نسخة لبياناته الحالية
//  - صاحب المنظومة:      (x-admin-token)  GET ?tenant=ID قائمة النسخ | GET ?id=N تفاصيل النسخة (تنزيل)
//                        POST {action:'create', tenant} نسخة الآن | POST {action:'restore', tenant, id} استرجاع
import { backupAllChanged, createBackup, getAll, getBackup, getOne, listBackups, restoreBackup } from './_db.js';
import { ApiError, assertLicenseUsable, clientIp, findLicense, rateLimit, safeEqual, sendError } from './_security.js';

// رسائل الاسترجاع المقصودة للمالك (أي خطأ آخر لا يُسرَّب)
const SAFE_MESSAGES = new Set(['النسخة غير موجودة', 'هذه النسخة تخص محلاً آخر']);

export default async function handler(req: any, res: any) {
  try {
    const q = req.query || {};

    // ---- 2) تنزيل نسخة من بيانات المحل الحالية (للعميل) ----
    if (req.method === 'GET' && q.action === 'export') {
      const key = String(req.headers['x-license-key'] || '').trim();
      if (!key) throw new ApiError('LICENSE_REQUIRED');
      rateLimit(`export:${clientIp(req)}`, 20, 10 * 60_000);
      const lic = await findLicense(key);
      if (!lic) throw new ApiError('LICENSE_INVALID');
      assertLicenseUsable(lic);
      const docs = await getAll(String(lic.tenantId));
      return res.status(200).json({
        app: 'MALVIA', format: 1, exportedAt: new Date().toISOString(),
        company: lic.companyName, tenantId: lic.tenantId, docs,
      });
    }

    // ---- 3) صاحب المنظومة فقط ----
    const token = String(req.headers['x-admin-token'] || '');
    rateLimit(`admin:${clientIp(req)}`, 30, 10 * 60_000);
    if (!process.env.ADMIN_TOKEN || !safeEqual(token, process.env.ADMIN_TOKEN)) throw new ApiError('ADMIN_UNAUTHORIZED');

    if (req.method === 'GET') {
      if (q.id) {
        const b = await getBackup(Number(q.id));
        if (!b) return res.status(404).json({ error: 'النسخة غير موجودة' });
        return res.status(200).json({ app: 'MALVIA', format: 1, backupId: Number(q.id), ...b });
      }
      const tenant = String(q.tenant || '');
      if (!tenant) return res.status(400).json({ error: 'tenant مطلوب' });
      return res.status(200).json({ backups: await listBackups(tenant) });
    }

    if (req.method === 'POST') {
      const { action, tenant, id } = req.body || {};
      if (action === 'create_all') {
        return res.status(200).json({ ok: true, backedUp: await backupAllChanged() });
      }
      if (!tenant || typeof tenant !== 'string') return res.status(400).json({ error: 'tenant مطلوب' });
      if (action === 'create') {
        const newId = await createBackup(tenant, 'manual');
        if (newId === null) return res.status(404).json({ error: 'لا توجد بيانات لهذا المحل' });
        return res.status(200).json({ ok: true, id: newId });
      }
      if (action === 'restore') {
        if (!id) return res.status(400).json({ error: 'id مطلوب' });
        const r = await restoreBackup(Number(id), tenant);
        return res.status(200).json({ ok: true, ...r });
      }
      return res.status(400).json({ error: 'إجراء غير معروف' });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (SAFE_MESSAGES.has(msg)) return res.status(400).json({ error: msg });
    return sendError(res, e);
  }
}
