import { TreasuryTransaction } from '../types/autoParts';
import { DateRange, inDateRange } from './dateRange';

// حسابات الخزنة: كل طريقة دفع تُحسب في حساب مستقل (كاش، إنستاباي، فيزا، محفظة).
export type TreasuryAccountKey = 'cash' | 'instapay' | 'visa' | 'wallet';

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
];

/** يحوّل نص طريقة الدفع (بكل صيغه القديمة والجديدة) إلى حساب خزنة. */
export const accountOf = (method?: string): TreasuryAccountKey => {
  const m = (method || '').toLowerCase();
  if (m.includes('انستا') || m.includes('إنستا') || m.includes('insta')) return 'instapay';
  if (m.includes('محفظ') || m.includes('فودافون') || m.includes('wallet')) return 'wallet';
  if (m.includes('فيزا') || m.includes('بطاقة') || m.includes('شبكة') || m.includes('مدى') || m.includes('بنك') || m.includes('visa')) return 'visa';
  return 'cash';
};

/** الآجل ليس حساب خزنة: لا تدخل به نقدية فعلية. */
export const isCreditMethod = (method?: string): boolean => (method || '').includes('آجل');

export interface AccountSummary {
  key: TreasuryAccountKey;
  income: number;   // إجمالي القبض
  expense: number;  // إجمالي الصرف
  balance: number;  // الصافي = قبض - صرف
  count: number;
}

export interface TreasurySummary {
  accounts: AccountSummary[];
  total: { income: number; expense: number; balance: number; count: number };
}

export const summarizeTreasury = (
  txs: TreasuryTransaction[],
  range?: DateRange
): TreasurySummary => {
  const map = new Map<TreasuryAccountKey, AccountSummary>();
  TREASURY_ACCOUNTS.forEach(a => map.set(a.key, { key: a.key, income: 0, expense: 0, balance: 0, count: 0 }));

  txs.forEach(tx => {
    if (range && !inDateRange(tx.date, range)) return;
    const acc = map.get(accountOf(tx.paymentMethod))!;
    if (tx.type === 'قبض') acc.income += tx.amount; else acc.expense += tx.amount;
    acc.count += 1;
  });

  const accounts = TREASURY_ACCOUNTS.map(a => {
    const s = map.get(a.key)!;
    s.balance = s.income - s.expense;
    return s;
  });
  const total = accounts.reduce(
    (t, a) => ({ income: t.income + a.income, expense: t.expense + a.expense, balance: t.balance + a.balance, count: t.count + a.count }),
    { income: 0, expense: 0, balance: 0, count: 0 }
  );
  return { accounts, total };
};
