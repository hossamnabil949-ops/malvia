// تقوية طبقة الـ API: مصادقة آمنة، تحقق من المدخلات، حد للمعدل، وأخطاء بأكواد بدل رسائل نصية/تسريب.
// غير مُشغّل على Vercel/Neon هنا؛ الدوال النقية (validate / rateLimit / safeEqual) مُختبرة محلياً.
import { createHash, timingSafeEqual } from 'node:crypto';
import { getOne } from './_db.js';

// ---------- أخطاء موحدة: الكود للآلة، والترجمة العربية في الواجهة ----------
export type ApiErrorCode =
  | 'LICENSE_REQUIRED' | 'LICENSE_INVALID' | 'LICENSE_SUSPENDED' | 'ADMIN_UNAUTHORIZED'
  | 'RESOURCE_NOT_ALLOWED' | 'INVALID_BODY' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED'
  | 'VERSION_CONFLICT' | 'METHOD_NOT_ALLOWED' | 'INTERNAL';

const STATUS: Record<ApiErrorCode, number> = {
  LICENSE_REQUIRED: 401, LICENSE_INVALID: 403, LICENSE_SUSPENDED: 403, ADMIN_UNAUTHORIZED: 401,
  RESOURCE_NOT_ALLOWED: 400, INVALID_BODY: 400, PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429,
  VERSION_CONFLICT: 409, METHOD_NOT_ALLOWED: 405, INTERNAL: 500,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode) { super(code); this.code = code; }
}

// رسائل للمستخدم (الواجهة الحالية تعرض حقل error كنص). الكود في حقل code للتعامل البرمجي.
const MESSAGES: Record<ApiErrorCode, string> = {
  LICENSE_REQUIRED: 'مفتاح الترخيص مطلوب', LICENSE_INVALID: 'مفتاح غير مسجل', LICENSE_SUSPENDED: 'الترخيص معلق',
  ADMIN_UNAUTHORIZED: 'غير مصرح', RESOURCE_NOT_ALLOWED: 'مورد غير مسموح', INVALID_BODY: 'بيانات غير صالحة',
  PAYLOAD_TOO_LARGE: 'حجم البيانات كبير جداً', RATE_LIMITED: 'محاولات كثيرة، حاول بعد قليل',
  VERSION_CONFLICT: 'تعارض في الإصدار', METHOD_NOT_ALLOWED: 'method not allowed', INTERNAL: 'خطأ داخلي في الخادم',
};

export function sendError(res: any, e: unknown) {
  const code: ApiErrorCode = e instanceof ApiError ? e.code : 'INTERNAL';
  if (code === 'INTERNAL') console.error(e);            // التفاصيل في سجل السيرفر فقط، لا في الاستجابة
  return res.status(STATUS[code]).json({ error: MESSAGES[code], code });
}

// ---------- مقارنة أسرار بزمن ثابت ----------
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ---------- حد معدل بسيط (لكل مفتاح). على Vercel كل instance له ذاكرته؛ للإنتاج استخدم جدول/Redis ----------
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): void {
  const h = hits.get(key);
  if (!h || now > h.reset) { hits.set(key, { n: 1, reset: now + windowMs }); return; }
  if (++h.n > max) throw new ApiError('RATE_LIMITED');
}

// ---------- الترخيص ----------
export async function findLicense(key: string): Promise<any | null> {
  const reg = await getOne('_registry', 'licenses');
  const list = (reg?.data as any[]) || [];
  return list.find(l => safeEqual(String(l.licenseKey).toUpperCase(), key.toUpperCase())) || null;
}

export function clientIp(req: any): string {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// ---------- التحقق من جسم المزامنة ----------
const ARRAY_RESOURCES = new Set(['parts','invoices','customers','suppliers','supplierPayments','treasury','employees',
  'salesReturns','purchaseInvoices','purchaseReturns','expenses','partners','carModels','reservations','inventoryErrors','auditLog','stockMovements','shifts','warehouses','stockLevels','stockTransfers','loyaltyLedger','cheques']);
const OBJECT_RESOURCES = new Set(['settings']);
const MAX_BYTES = 3_000_000;   // أقل من حد جسم الطلب في Vercel (~4.5MB)

export interface SyncBody { resource: string; data: unknown; baseVersion: number }

export function validateSyncBody(body: any): SyncBody {
  if (!body || typeof body !== 'object') throw new ApiError('INVALID_BODY');
  const { resource, data, baseVersion } = body;
  const isArr = ARRAY_RESOURCES.has(resource), isObj = OBJECT_RESOURCES.has(resource);
  if (!isArr && !isObj) throw new ApiError('RESOURCE_NOT_ALLOWED');
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new ApiError('INVALID_BODY');
  if (isArr) {
    if (!Array.isArray(data)) throw new ApiError('INVALID_BODY');            // كان يقبل أي شيء ويكسر باقي الأجهزة
    const ids = new Set<string>();
    for (const it of data) {
      if (!it || typeof it !== 'object' || Array.isArray(it)) throw new ApiError('INVALID_BODY');
      if (it.id == null) continue;                                           // بعض البيانات القديمة بلا id: لا نرفضها
      const id = String(it.id);
      if (ids.has(id)) throw new ApiError('INVALID_BODY');                    // id مكرر
      ids.add(id);
    }
  } else if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError('INVALID_BODY');
  }
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
  return { resource, data, baseVersion };
}

