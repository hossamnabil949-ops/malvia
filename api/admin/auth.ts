import { handleAdminAuth } from '../_admin.js';
export default async function handler(req: any, res: any) {
  try { return await handleAdminAuth(req, res); }
  catch (error: any) {
    const limited = error?.message === 'RATE_LIMITED';
    if (!limited) console.error('[MALVIA_ADMIN_AUTH_ERROR]', { name: error?.name || 'Error', code: error?.code || 'NO_CODE' });
    return res.status(limited ? 429 : 500).json({ code: limited ? 'RATE_LIMITED' : 'INTERNAL', error: limited ? 'محاولات كثيرة، حاول بعد قليل.' : 'تعذر إتمام عملية دخول الإدارة.' });
  }
}
