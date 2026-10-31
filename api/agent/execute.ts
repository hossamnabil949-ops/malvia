import { createHash } from 'node:crypto';
import { executeAgentOperation } from '../_db.js';
import { ApiError, clientIp, findLicense, rateLimit, sendError } from '../_security.js';

const ALLOWED = new Set(['EXECUTE_SALE', 'ADD_EXPENSE', 'RESTOCK_ITEM', 'SETTLE_SUPPLIER', 'COLLECT_CUSTOMER', 'ADD_PURCHASE']);
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
  try {
    const ip = clientIp(req);
    rateLimit(`agent-execute-ip:${ip}`, 40, 60_000);
    const licenseKey = String(req.headers['x-license-key'] || '').trim();
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!licenseKey) throw new ApiError('LICENSE_REQUIRED');
    if (!bearer || bearer.length < 32) return res.status(401).json({ code: 'AGENT_UNAUTHENTICATED', error: 'يجب تسجيل دخول الموظف على الخادم قبل تنفيذ أي عملية مالية.' });
    const license = await findLicense(licenseKey);
    if (!license) throw new ApiError('LICENSE_INVALID');
    if (license.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const action = String(req.body?.action || '');
    if (!ALLOWED.has(action)) return res.status(400).json({ code: 'AGENT_ACTION_NOT_ALLOWED', error: 'نوع العملية غير مسموح.' });
    const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '');
    if (!/^[A-Za-z0-9._:-]{12,120}$/.test(idempotencyKey)) return res.status(400).json({ code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'معرّف فريد للعملية مطلوب لمنع التكرار.' });
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    rateLimit(`agent-execute-tenant:${license.tenantId}`, 80, 60_000);
    const result = await executeAgentOperation(String(license.tenantId), tokenHash, idempotencyKey, action, req.body?.payload || {});
    return res.status(200).json(result);
  } catch (e: any) {
    const msg = String(e?.message || '');
    const mapped: Record<string, [number, string]> = {
      AGENT_UNAUTHENTICATED: [401, 'جلسة الموظف غير صالحة أو انتهت. سجّل الدخول مرة أخرى.'],
      AGENT_EMPLOYEE_DISABLED: [403, 'حساب الموظف غير نشط.'],
      AGENT_PERMISSION_DENIED: [403, 'ليس لديك صلاحية تنفيذ هذه العملية.'],
      AGENT_ACTION_NOT_ALLOWED: [403, 'نوع العملية غير مسموح.'],
      AGENT_INVALID_QUANTITY: [400, 'الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر.'],
      AGENT_INVALID_AMOUNT: [400, 'المبلغ يجب أن يكون أكبر من صفر.'],
      AGENT_PART_NOT_FOUND: [404, 'الصنف غير موجود على الخادم.'],
      AGENT_OUT_OF_STOCK: [409, 'الكمية المتاحة غير كافية؛ لم يتم حفظ البيع.'],
      AGENT_INVALID_PRICE: [400, 'سعر الصنف غير صالح.'],
      AGENT_SHIFT_REQUIRED: [409, 'يجب فتح وردية على الخادم قبل البيع وفق إعدادات المحل. لم يتم حفظ الفاتورة.'],
      AGENT_TRACKING_REQUIRES_MANUAL: [409, 'هذا الصنف يتطلب تتبع دفعات أو أرقام تسلسلية؛ نفّذ البيع من شاشة نقطة البيع للتحقق من بيانات التتبع.'],
      AGENT_SUPPLIER_NOT_FOUND: [404, 'المورد غير موجود أو الاسم غير مطابق.'],
      AGENT_SUPPLIER_AMBIGUOUS: [409, 'يوجد أكثر من مورد بهذا الاسم؛ استخدم الاسم الكامل أو اختر المورد من القائمة.'],
      AGENT_CUSTOMER_AMBIGUOUS: [409, 'يوجد أكثر من عميل بهذا الاسم؛ استخدم الاسم الكامل أو اختر العميل من القائمة.'],
      AGENT_CUSTOMER_NOT_FOUND: [404, 'العميل غير موجود على الخادم.'],
      AGENT_PURCHASE_REQUIRES_ITEM_LINES: [400, 'فاتورة التوريد تحتاج صنفًا وكمية وسعر شراء محددين.'],
    };
    if (mapped[msg]) return res.status(mapped[msg][0]).json({ code: msg, error: mapped[msg][1] });
    return sendError(res, e);
  }
}
