// منطق البيع كدوال نقية (بدون React ولا تخزين) => قابلة للاختبار وإعادة الاستخدام من الكاشير والمساعد الصوتي.
// كل الحسابات بالقروش (أعداد صحيحة) لتفادي أخطاء الفاصلة العشرية.

export type SaleErrorCode =
  | 'EMPTY_CART' | 'INVALID_QTY' | 'INVALID_PRICE' | 'OUT_OF_STOCK' | 'PRICE_BELOW_COST'
  | 'DISCOUNT_EXCEEDS_SUBTOTAL' | 'PAYMENT_MISMATCH' | 'CREDIT_REQUIRES_CUSTOMER' | 'CREDIT_LIMIT_EXCEEDED';

export class SaleError extends Error {
  code: SaleErrorCode;
  details: Record<string, unknown>;
  constructor(code: SaleErrorCode, details: Record<string, unknown> = {}) {
    super(code); // الرسالة للمستخدم تُترجم في الواجهة من الكود، لا تُكتب هنا
    this.code = code;
    this.details = details;
  }
}

export const toPiasters = (egp: number): number => Math.round(egp * 100);
export const toEgp = (p: number): number => p / 100;

export interface CartLine { partId: string; qty: number; unitPrice: number; unitCost: number }
export interface StockPart { id: string; stockQuantity: number }
export interface PaymentLine { method: string; amount: number }

/** الآجل = لا يدخل نقدية للخزنة (يُسجَّل على حساب العميل) */
export const isCreditPayment = (method: string): boolean => (method || '').includes('آجل');

export interface Totals { subtotal: number; discount: number; tax: number; grandTotal: number } // بالقروش

/** الخصم قبل الضريبة. vatRatePercent من الإعدادات (لا تُكتب 0.14 داخل الشاشة). */
export function computeTotals(lines: CartLine[], discountEgp: number, vatRatePercent: number, applyVat: boolean): Totals {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * toPiasters(l.unitPrice)), 0);
  const discount = toPiasters(discountEgp);
  if (discount < 0 || discount > subtotal) throw new SaleError('DISCOUNT_EXCEEDS_SUBTOTAL', { subtotal, discount });
  const taxable = subtotal - discount;
  const tax = applyVat ? Math.round((taxable * vatRatePercent) / 100) : 0;
  return { subtotal, discount, tax, grandTotal: taxable + tax };
}

export interface ValidateOptions {
  allowBelowCost: boolean;        // صلاحية المدير فقط
  allowNegativeStock?: boolean;   // سياسة المحل (افتراضياً ممنوع)
  customerId?: string;
  customerBalance?: number;       // مديونية العميل الحالية بالجنيه
  customerCreditLimit?: number;
}

export function validateSale(lines: CartLine[], stock: StockPart[], totals: Totals, payments: PaymentLine[], opt: ValidateOptions): void {
  if (lines.length === 0) throw new SaleError('EMPTY_CART');

  // تجميع الكمية لكل صنف (لو تكرر في سطرين) قبل مقارنتها بالرصيد
  const need = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isFinite(l.qty) || l.qty <= 0) throw new SaleError('INVALID_QTY', { partId: l.partId });
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) throw new SaleError('INVALID_PRICE', { partId: l.partId });
    if (!opt.allowBelowCost && l.unitPrice < l.unitCost) throw new SaleError('PRICE_BELOW_COST', { partId: l.partId });
    need.set(l.partId, (need.get(l.partId) ?? 0) + l.qty);
  }
  const byId = new Map(stock.map(p => [p.id, p.stockQuantity]));
  for (const [partId, qty] of need) {
    const available = byId.get(partId) ?? 0;
    if (!opt.allowNegativeStock && qty > available) throw new SaleError('OUT_OF_STOCK', { partId, requested: qty, available });
  }

  const paid = payments.reduce((s, p) => s + toPiasters(p.amount), 0);
  if (paid !== totals.grandTotal) throw new SaleError('PAYMENT_MISMATCH', { paid, expected: totals.grandTotal });

  const credit = payments.filter(p => isCreditPayment(p.method)).reduce((s, p) => s + toPiasters(p.amount), 0);
  if (credit > 0) {
    if (!opt.customerId) throw new SaleError('CREDIT_REQUIRES_CUSTOMER');
    const limit = opt.customerCreditLimit ?? 0;
    if (limit > 0 && toPiasters(opt.customerBalance ?? 0) + credit > toPiasters(limit)) {
      throw new SaleError('CREDIT_LIMIT_EXCEEDED', { limit, balance: opt.customerBalance ?? 0 });
    }
  }
}

/** يخصم الكميات بدون Math.max(0): لو الرصيد لا يكفي يرمي خطأ بدل إخفاء الفرق. المطابقة بمعرّف الصنف فقط. */
export function deductStock<T extends StockPart>(parts: T[], lines: CartLine[], allowNegative = false): T[] {
  const qty = new Map<string, number>();
  lines.forEach(l => qty.set(l.partId, (qty.get(l.partId) ?? 0) + l.qty));
  return parts.map(p => {
    const q = qty.get(p.id);
    if (!q) return p;
    if (!allowNegative && p.stockQuantity < q) throw new SaleError('OUT_OF_STOCK', { partId: p.id, requested: q, available: p.stockQuantity });
    return { ...p, stockQuantity: p.stockQuantity - q };
  });
}

/** المبلغ المسترد لصنف مرتجع = نصيب الكمية من إجمالي سطر الفاتورة (بعد الخصم ومع الضريبة). */
export function refundForLine(lineTotalEgp: number, lineQty: number, returnQty: number, alreadyReturnedQty: number): number {
  if (returnQty <= 0 || returnQty + alreadyReturnedQty > lineQty) throw new SaleError('INVALID_QTY', { returnQty, remaining: lineQty - alreadyReturnedQty });
  return toEgp(Math.round((toPiasters(lineTotalEgp) * returnQty) / lineQty));
}
