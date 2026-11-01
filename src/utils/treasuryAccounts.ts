import { TreasuryTransaction } from '../types/autoParts';
import { DateRange, inDateRange } from './dateRange';

// حسابات الخزنة: كل طريقة دفع تُحسب في حساب مستقل.
export type TreasuryAccountKey = 'cash' | 'instapay' | 'visa' | 'wallet' | 'bank' | 'unclassified';

export interface TreasuryAccountMeta {
  key: TreasuryAccountKey;
  label: string;
  shortLabel: string;
  color: string;
}

export const TREASURY_ACCOUNTS: TreasuryAccountMeta[] = [
  { key: 'cash', label: 'الكاش (درج الخزنة)', shortLabel: 'كاش', color: '#10b981' },
  { key: 'instapay', label: 'إنستاباي InstaPay', shortLabel: 'إنستاباي', color: '#a855f7' },
  { key: 'visa', label: 'فيزا / بطاقة بنكية', shortLabel: 'فيزا', color: '#3b82f6' },
  { key: 'wallet', label: 'محافظ إلكترونية (فودافون كاش...)', shortLabel: 'محافظ', color: '#06b6d4' },
  { key: 'bank', label: 'تحويلات وشيكات بنكية', shortLabel: 'بنك', color: '#64748b' },
  { key: 'unclassified', label: 'طرق دفع غير مصنفة (تحتاج مراجعة)', shortLabel: 'غير مصنف', color: '#ef4444' },
];

/** يحوّل طريقة الدفع إلى الحساب الصحيح دون افتراض أن النص المجهول نقدي. */
export const accountOf = (method?: string): TreasuryAccountKey => {
  const m = (method || '').trim().toLowerCase();
  if (!m) return 'unclassified';
  if (m.includes('آجل') || m.includes('اجل') || m.includes('credit')) return 'unclassified';
  if (m.includes('انستا') || m.includes('إنستا') || m.includes('insta')) return 'instapay';
  if (m.includes('محفظ') || m.includes('فودافون') || m.includes('wallet')) return 'wallet';
  if (m.includes('شيك') || m.includes('تحويل بنكي') || m.includes('تحويل بنكى') || m === 'bank transfer' || m === 'bank') return 'bank';
  if (m.includes('فيزا') || m.includes('بطاقة') || m.includes('شبكة') || m.includes('مدى') || m.includes('visa') || m.includes('card')) return 'visa';
  if (m === 'نقدي' || m.includes('كاش') || m === 'cash') return 'cash';
  return 'unclassified';
};

/** الآجل ليس حساب خزنة: لا تدخل به نقدية فعلية. */
export const isCreditMethod = (method?: string): boolean => /آجل|اجل|credit/i.test(method || '');

export interface AccountSummary {
  key: TreasuryAccountKey;
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export interface TreasurySummary {
  accounts: AccountSummary[];
  total: { income: number; expense: number; balance: number; count: number };
}

export const summarizeTreasury = (txs: TreasuryTransaction[], range?: DateRange): TreasurySummary => {
  const map = new Map<TreasuryAccountKey, AccountSummary>();
  TREASURY_ACCOUNTS.forEach(account => map.set(account.key, {
    key: account.key, income: 0, expense: 0, balance: 0, count: 0,
  }));

  txs.forEach(tx => {
    if (range && !inDateRange(tx.date, range)) return;
    const account = map.get(accountOf(tx.paymentMethod))!;
    if (tx.type === 'قبض') account.income += tx.amount;
    else account.expense += tx.amount;
    account.count += 1;
  });

  const accounts = TREASURY_ACCOUNTS.map(account => {
    const summary = map.get(account.key)!;
    summary.balance = summary.income - summary.expense;
    return summary;
  });
  const total = accounts.reduce((result, account) => ({
    income: result.income + account.income,
    expense: result.expense + account.expense,
    balance: result.balance + account.balance,
    count: result.count + account.count,
  }), { income: 0, expense: 0, balance: 0, count: 0 });
  return { accounts, total };
};
