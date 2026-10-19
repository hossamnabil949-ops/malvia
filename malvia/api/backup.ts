// النسخ الاحتياطي واسترجاع بيانات المحلات.
//  - النسخة اليومية التلقائية: ملف api/cron-backup.ts (Vercel Cron)
//  - العميل (ترخيصه):    GET  /api/backup?action=export     (x-license-key)  ملف نسخة لبياناته الحالية
//  - صاحب المنظومة:      (x-admin-token)  GET ?tenant=ID قائمة النسخ | GET ?id=N تفاصيل النسخة (تنزيل)
//                        POST {action:'create', tenant} نسخة الآن | POST {action:'restore', tenant, id} استرجاع
import { backupAllChanged, createBackup, getAll, getBackup, getOne, listBackups, restoreBackup } from './_db.js';

async function findLicense(key: string) {
  const reg = await getOne('_registry', 'licenses');
  const list = (reg?.data as any[]) || [];
  return list.find(l => String(l.licenseKey).toUpperCase() === key.toUpperCase()) || null;
}

export default async function handler(req: any, res: any) {
  try {
    const q = req.query || {};

    // ---- 2) تنزيل نسخة من بيانات المحل الحالية (للعميل) ----
    if (req.method === 'GET' && q.action === 'export') {
      const key = String(req.headers['x-license-key'] || '').trim();
      if (!key) return res.status(401).json({ error: 'مفتاح الترخيص مطلوب' });
      const lic = await findLicense(key);
      if (!lic) return res.status(403).json({ error: 'مفتاح غير مسجل' });
      const docs = await getAll(String(lic.tenantId));
      return res.status(200).json({
        app: 'MALVIA', format: 1, exportedAt: new Date().toISOString(),
        company: lic.companyName, tenantId: lic.tenantId, docs,
      });
    }

    // ---- 3) صاحب المنظومة فقط ----
    const token = String(req.headers['x-admin-token'] || '');
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'غير مصرح' });
    }

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
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
