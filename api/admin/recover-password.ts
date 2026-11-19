import { handleAdminPasswordRecovery } from '../_admin.js';
export default async function handler(req: any, res: any) {
  try { return await handleAdminPasswordRecovery(req, res); }
  catch (error: any) {
    const limited = error?.message === 'RATE_LIMITED';
    if (!limited) console.error('[MALVIA_ADMIN_RECOVERY_ERROR]', { name: error?.name || 'Error', code: error?.code || 'NO_CODE' });
    return res.status(limited ? 429 : 500).json({ code: limited ? 'RATE_LIMITED' : 'INTERNAL', error: limited ? 'محاولات كثيرة، حاول بعد قليل.' : 'تعذر إتمام استرداد كلمة المرور.' });
  }
}
