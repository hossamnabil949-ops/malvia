// سجل المحلات (التراخيص). القراءة/الكتابة الكاملة لصاحب المنظومة فقط عبر ADMIN_TOKEN.
import { getOne, putIfVersion } from './_db.js';

export default async function handler(req: any, res: any) {
  try {
    const token = String(req.headers['x-admin-token'] || '');
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.method === 'GET') {
      const cur = await getOne('_registry', 'licenses');
      return res.status(200).json({ licenses: cur?.data || [], version: cur?.version || 0 });
    }
    if (req.method === 'POST') {
      const { licenses, baseVersion } = req.body || {};
      if (!Array.isArray(licenses)) return res.status(400).json({ error: 'licenses مطلوبة' });
      const v = await putIfVersion('_registry', 'licenses', licenses, Number(baseVersion) || 0);
      if (v === null) return res.status(409).json({ conflict: true });
      return res.status(200).json({ version: v });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
