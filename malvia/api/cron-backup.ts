// النسخة اليومية التلقائية: يستدعيها Vercel Cron يومياً (انظر vercel.json) مع Authorization: Bearer CRON_SECRET.
// تنسخ كل محل تغيّرت بياناته منذ آخر نسخة، ثم تحذف القديم حسب سياسة الاحتفاظ.
import { backupAllChanged } from './_db.js';
import { ApiError, safeEqual, sendError } from './_security.js';

export default async function handler(req: any, res: any) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || !safeEqual(String(req.headers['authorization'] || ''), `Bearer ${secret}`)) throw new ApiError('ADMIN_UNAUTHORIZED');
    const n = await backupAllChanged();
    return res.status(200).json({ ok: true, backedUp: n, at: new Date().toISOString() });
  } catch (e) {
    return sendError(res, e);
  }
}
