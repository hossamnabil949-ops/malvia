/**
 * MALVIA payment method normalization.
 * Legacy Arabic/English labels are accepted at read boundaries; new writes should use canonical labels.
 */
export type PaymentAccount = 'cash' | 'credit' | 'instapay' | 'wallet' | 'visa' | 'bank';

const textOf = (value?: string): string => String(value ?? '').trim().toLowerCase()
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[ـ]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/[\s_-]+/g, ' ');

export function paymentAccountOf(method?: string): PaymentAccount {
  const m = textOf(method);
  if (!m) throw new Error('طريقة الدفع غير محددة؛ لا يمكن تصنيف الحركة.');
  if (m === 'credit' || m.includes('اجل') || m.includes('حساب ورشه') || m.includes('حساب ورشة')) return 'credit';
  // Explicit InstaPay routing: the same payment rail may point to a bank account or a wallet.
  if ((m.includes('insta') || m.includes('انستا')) && (m.includes('bank') || m.includes('بنك') || m.includes('حساب بنكي'))) return 'bank';
  if ((m.includes('insta') || m.includes('انستا')) && (m.includes('wallet') || m.includes('محفظ'))) return 'wallet';
  if (m === 'bank' || m.includes('شيك') || m.includes('تحويل بنكي') || m.includes('حوالة بنكية') || m.includes('حواله بنكيه') || m.includes('bank transfer') || m.includes('wire transfer')) return 'bank';
  if (m.includes('insta') || m.includes('انستا')) return 'instapay';
  if (m.includes('محفظ') || m.includes('فودافون') || m.includes('wallet') || m.includes('mobile wallet')) return 'wallet';
  if (m.includes('فيزا') || m.includes('بطاق') || m.includes('شبكة') || m.includes('مدى') || m.includes('visa') || m.includes('card') || m.includes('mada')) return 'visa';
  if (m === 'cash' || m.includes('كاش') || m.includes('نقد')) return 'cash';
  throw new Error(`طريقة دفع غير معروفة ولا يمكن افتراض أنها نقدية: ${method}`);
}

export function normalizePaymentMethod(method?: string): string {
  switch (paymentAccountOf(method)) {
    case 'cash': return 'كاش (نقدي)';
    case 'credit': return 'آجل / حساب ورشة';
    case 'instapay': return 'إنستاباي / InstaPay';
    case 'wallet': return 'فودافون كاش ومحافظ إلكترونية';
    case 'visa': return 'فيزا / بطاقة بنكية';
    case 'bank': return 'تحويل بنكي / شيك';
  }
}

export const isCreditPaymentMethod = (method?: string): boolean => {
  try { return paymentAccountOf(method) === 'credit'; }
  catch { return false; }
};


/** Outgoing payments on bank/card rails must identify the exact active bank account. */
export function requiresSpecificBankAccount(method?: string): boolean {
  const account = paymentAccountOf(method);
  return account === 'bank' || account === 'visa';
}


/** Payment rails that deposit directly into a named bank account (not Visa clearing). */
export function requiresDirectBankAccount(method?: string): boolean {
  return paymentAccountOf(method) === 'bank';
}
