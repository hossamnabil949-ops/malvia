// منطق البيع كدوال نقية (بدون React ولا تخزين) => قابلة للاختبار وإعادة الاستخدام من الكاشير والمساعد الصوتي.
// كل الحسابات بالقروش (أعداد صحيحة) لتفادي أخطاء الفاصلة العشرية.

export type SaleErrorCode =
  | 'EMPTY_CART' | 'INVALID_QTY' | 'INVALID_PRICE' | 'OUT_OF_STOCK' | 'PRICE_BELOW_COST'
  | 'DISCOUNT_EXCEEDS_SUBTOTAL' | 'DISCOUNT_OVER_LIMIT' | 'PAYMENT_MISMATCH' | 'CREDIT_REQUIRES_CUSTOMER' | 'CREDIT_LIMIT_EXCEEDED';

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
export const isCreditPayment = (method: string): boolean => /آجل|اجل|credit/i.test(method || '');

export interface Totals { subtotal: number; discount: number; tax: number; grandTotal: number } // بالقروش

/** الخصم قبل الضريبة. vatRatePercent من الإعدادات (لا تُكتب 0.14 داخل الشاشة). */
export function computeTotals(lines: CartLine[], discountEgp: number, vatRatePercent: number, applyVat: boolean, pricesIncludeTax = false): Totals {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * toPiasters(l.unitPrice)), 0);
  const discount = toPiasters(discountEgp);
  if (discount < 0 || discount > subtotal) throw new SaleError('DISCOUNT_EXCEEDS_SUBTOTAL', { subtotal, discount });
  const taxable = subtotal - discount;
  const tax = applyVat ? Math.round((taxable * (pricesIncludeTax ? vatRatePercent / (100 + vatRatePercent) : vatRatePercent / 100))) : 0;
  return { subtotal, discount, tax, grandTotal: pricesIncludeTax ? taxable : taxable + tax };
}

export interface DiscountPolicyLine { qty: number; listPrice: number; unitPrice: number; unitCost: number }

/**
 * سياسة الخصم: (1) لا يزيد خصم أي صنف عن maxPercent% من سعره الأصلي،
 * (2) إجمالي التخفيض (تعديل أسعار + خصم الفاتورة) لا يزيد عن maxPercent% من إجمالي الأسعار الأصلية،
 * (3) لا يقل السعر عن التكلفة لا للصنف ولا لإجمالي الفاتورة بعد الخصم. بالقروش لتفادي الكسور.
 */
export function validateDiscountPolicy(lines: DiscountPolicyLine[], invoiceDiscountEgp: number, maxPercent = 10): void {
  let listTotal = 0, soldTotal = 0, costTotal = 0;
  for (const l of lines) {
    const list = toPiasters(l.listPrice), price = toPiasters(l.unitPrice), cost = toPiasters(l.unitCost);
    if (price < cost) throw new SaleError('PRICE_BELOW_COST', { unitPrice: l.unitPrice, unitCost: l.unitCost });
    if (price * 100 < list * (100 - maxPercent)) throw new SaleError('DISCOUNT_OVER_LIMIT', { maxPercent, listPrice: l.listPrice, unitPrice: l.unitPrice });
    listTotal += Math.round(l.qty * list);
    soldTotal += Math.round(l.qty * price);
    costTotal += Math.round(l.qty * cost);
  }
  const net = soldTotal - toPiasters(invoiceDiscountEgp);
  if (net < costTotal) throw new SaleError('PRICE_BELOW_COST', { net, costTotal });
  if ((listTotal - net) * 100 > listTotal * maxPercent) throw new SaleError('DISCOUNT_OVER_LIMIT', { maxPercent, listTotal, net });
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
    // لا يوجد ائتمان مفتوح افتراضياً: يجب ضبط حد موجب صريح لكل عميل قبل البيع الآجل.
    if (!(limit > 0) || toPiasters(opt.customerBalance ?? 0) + credit > toPiasters(limit)) {
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
export function refundForLine(lineTotalEgp: number, lineQty: number, returnQty: number, alreadyReturnedQty: number, alreadyRefundedAmount?: number): number {
  if (returnQty <= 0 || returnQty + alreadyReturnedQty > lineQty) throw new SaleError('INVALID_QTY', { returnQty, remaining: lineQty - alreadyReturnedQty });
  const totalCents = toPiasters(lineTotalEgp);
  const previousCumulativeCents = alreadyRefundedAmount === undefined
    ? Math.round((totalCents * alreadyReturnedQty) / lineQty)
    : toPiasters(alreadyRefundedAmount);
  const isFinalReturn = returnQty + alreadyReturnedQty === lineQty;
  return toEgp(isFinalReturn ? Math.max(0, totalCents - previousCumulativeCents) : Math.round((totalCents * returnQty) / lineQty));
}

// ---------- إلغاء فاتورة (Void) ----------
export interface VoidInput {
  grandTotal: number;
  returnedAmount?: number;
  items: { partId?: string; partNumber: string; quantity: number; returnedQuantity?: number }[];
  payments: PaymentLine[];
}
export interface VoidPlan {
  fraction: number;                                                   // نسبة ما لم يُرتجع من الفاتورة (0..1)
  restock: { partId?: string; partNumber: string; qty: number }[];    // الكميات المتبقية للإرجاع للمخزن
  creditAmount: number;                                               // تخفيض مديونية العميل
  refunds: { method: string; amount: number }[];                      // رد كل طريقة دفع من حسابها
}

/** خطة عكس فاتورة: المرتجع السابق رُدّت قيمته وقتها، فنعكس فقط المتبقي. */
export function computeVoidPlan(inv: VoidInput): VoidPlan {
  const fraction = inv.grandTotal > 0 ? Math.max(0, (inv.grandTotal - (inv.returnedAmount || 0)) / inv.grandTotal) : 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const restock = inv.items
    .map(it => ({ partId: it.partId, partNumber: it.partNumber, qty: Math.max(0, it.quantity - (it.returnedQuantity || 0)) }))
    .filter(r => r.qty > 0);

  const remaining = inv.payments.map(payment => ({ method: payment.method, amount: round2(payment.amount) }));
  if (inv.previousRefunds?.length) {
    const bucket = (method: string) => {
      if (isCreditPayment(method)) return 'credit';
      const value = String(method || '').toLowerCase();
      if (/نقدي|كاش|cash/.test(value)) return 'cash';
      if (/إنستا|انستا|insta|محفظ|wallet|فودافون/.test(value)) return 'wallet';
      if (/فيزا|بطاقة|شبكة|مدى|visa|card/.test(value)) return 'card';
      if (/شيك|تحويل بنكي|تحويل بنكى|bank/.test(value)) return 'bank';
      return 'other';
    };
    for (const refund of inv.previousRefunds) {
      let left = round2(Math.max(0, refund.amount));
      const target = bucket(refund.method);
      const matching = remaining.map((payment, index) => ({ payment, index }))
        .filter(({ payment }) => bucket(payment.method) === target && payment.amount > 0);
      const candidates = matching.length > 0
        ? matching
        : remaining.map((payment, index) => ({ payment, index })).filter(({ payment }) => payment.amount > 0);
      const available = candidates.reduce((total, item) => total + item.payment.amount, 0);
      const deduct = Math.min(left, available);
      let assigned = 0;
      candidates.forEach((candidate, index) => {
        const share = index === candidates.length - 1
          ? round2(deduct - assigned)
          : round2(deduct * candidate.payment.amount / available);
        const actual = Math.min(candidate.payment.amount, share);
        remaining[candidate.index].amount = round2(remaining[candidate.index].amount - actual);
        assigned = round2(assigned + actual);
      });
      left = round2(left - assigned);
      if (left > 0) {
        for (const candidate of remaining.map((payment, index) => ({ payment, index })).filter(x => x.payment.amount > 0)) {
          const actual = Math.min(left, candidate.payment.amount);
          remaining[candidate.index].amount = round2(candidate.payment.amount - actual);
          left = round2(left - actual);
          if (left <= 0) break;
        }
      }
    }
  } else if (fraction < 1) {
    remaining.forEach(payment => { payment.amount = round2(payment.amount * fraction); });
  }

  // اجعل مجموع المبالغ المتبقية مطابقاً تماماً للمتبقي من الفاتورة بعد كل المرتجعات.
  const targetRemaining = round2(Math.max(0, inv.grandTotal - (inv.returnedAmount || 0)));
  const actualRemaining = round2(remaining.reduce((total, payment) => total + payment.amount, 0));
  const adjustment = round2(actualRemaining - targetRemaining);
  if (adjustment > 0) {
    let left = adjustment;
    for (const payment of remaining) {
      const cut = Math.min(payment.amount, left);
      payment.amount = round2(payment.amount - cut);
      left = round2(left - cut);
      if (left <= 0) break;
    }
  } else if (adjustment < 0 && remaining.length > 0) {
    const totalOriginal = inv.payments.reduce((total, payment) => total + payment.amount, 0);
    remaining.forEach((payment, index) => {
      const original = inv.payments[index]?.amount || 0;
      payment.amount = round2(payment.amount + (totalOriginal > 0 ? (-adjustment * original / totalOriginal) : (index === 0 ? -adjustment : 0)));
    });
  }
  const creditAmount = round2(remaining.filter(payment => isCreditPayment(payment.method)).reduce((total, payment) => total + payment.amount, 0));
  const refunds = remaining
    .filter(payment => !isCreditPayment(payment.method) && payment.amount > 0)
    .map(payment => ({ method: payment.method, amount: round2(payment.amount) }));
  return { fraction, restock, creditAmount, refunds };
}
