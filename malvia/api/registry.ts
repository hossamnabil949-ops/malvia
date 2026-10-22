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
      if (!Array.isArray(licenses)) throw new ApiError('INVALID_BODY');
      const v = await putIfVersion('_registry', 'licenses', licenses, Number(baseVersion) || 0);
      if (v === null) return res.status(409).json({ conflict: true });
      return res.status(200).json({ version: v });
    }
    throw new ApiError('METHOD_NOT_ALLOWED');
  } catch (e) {
    return sendError(res, e);
  }
}
