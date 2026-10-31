// سطور السداد لفاتورة: لو الفاتورة مقسّمة (آجل + كاش مثلاً) تظهر كل طريقة بمبلغها،
// ولو بسيطة (أو قديمة بدون payments) تظهر طريقة واحدة بإجمالي الفاتورة.
import { isCreditPayment } from './saleLogic.ts';

export interface PaymentLineView { method: string; amount: number; isCredit: boolean }

export function paymentLines(inv: {
  paymentMethod: string;
  grandTotal: number;
  payments?: { method: string; amount: number }[];
}): PaymentLineView[] {
  const src = inv.payments && inv.payments.length > 0 ? inv.payments : [{ method: inv.paymentMethod, amount: inv.grandTotal }];
  return src.filter(p => p.amount > 0 || src.length === 1).map(p => ({ method: String(p.method), amount: p.amount, isCredit: isCreditPayment(String(p.method)) }));
}

export const isSplitInvoice = (inv: Parameters<typeof paymentLines>[0]): boolean => paymentLines(inv).length > 1;
