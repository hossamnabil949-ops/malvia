// النسخة اليومية التلقائية: يستدعيها Vercel Cron يومياً (انظر vercel.json) مع Authorization: Bearer CRON_SECRET.
// تنسخ كل محل تغيّرت بياناته منذ آخر نسخة، ثم تحذف القديم حسب سياسة الاحتفاظ.
import { backupAllChanged } from './_db.js';

export default async function handler(req: any, res: any) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    const n = await backupAllChanged();
    return res.status(200).json({ ok: true, backedUp: n, at: new Date().toISOString() });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
