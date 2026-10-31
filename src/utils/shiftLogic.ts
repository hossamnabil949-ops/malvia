// منطق الورديات وجرد الدرج (دوال نقية قابلة للاختبار — لا تعتمد على React).
// كل المبالغ بالجنيه وتُقرَّب لخانتين عشريتين لتفادي أخطاء الفاصلة العائمة.
import type { Shift, ShiftCashLine, TreasuryTransaction } from '../types/autoParts';
import { accountOf } from './treasuryAccounts';

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100 + (n < 0 ? -1e-9 : 1e-9)) / 100;

/** فئات العملة المصرية للعدّ (ورقي ومعدني). المفتاح نص حتى يُحفظ كما هو في JSON. */
export const DENOMINATIONS: { value: number; label: string }[] = [
  { value: 200, label: '200' },
  { value: 100, label: '100' },
  { value: 50, label: '50' },
  { value: 20, label: '20' },
  { value: 10, label: '10' },
  { value: 5, label: '5' },
  { value: 1, label: '1' },
  { value: 0.5, label: '50 قرش' },
  { value: 0.25, label: '25 قرش' },
];

/** مجموع العدّ من الفئات: { '200': 3, '50': 2 } => 700 */
export const countTotal = (dens?: Record<string, number>): number => {
  if (!dens) return 0;
  let total = 0;
  for (const d of DENOMINATIONS) {
    const q = Math.floor(Number(dens[String(d.value)]) || 0);
    if (q > 0) total += q * d.value;
  }
  return round2(total);
};

/** حركات الخزنة التي تخص درج الوردية (كاش فقط) — بدون قيود تسوية العجز/الزيادة نفسها. */
const isVarianceTx = (tx: TreasuryTransaction) =>
  tx.category === 'عجز درج (تسوية وردية)' || tx.category === 'زيادة درج (تسوية وردية)';

export interface ShiftSummary {
  cashIn: number;
  cashOut: number;
  cashSales: number;
  nonCash: { instapay: number; visa: number; wallet: number };
  invoiceCount: number;
  breakdown: ShiftCashLine[];
  expectedCash: number;
}

export const summarizeShift = (shift: Pick<Shift, 'id' | 'openingCash'>, txs: TreasuryTransaction[]): ShiftSummary => {
  let cashIn = 0, cashOut = 0, cashSales = 0;
  const nonCash = { instapay: 0, visa: 0, wallet: 0 };
  const invoices = new Set<string>();
  const byCat = new Map<string, number>(); // موجب = قبض، سالب = صرف

  for (const tx of txs) {
    if (tx.shiftId !== shift.id || isVarianceTx(tx)) continue;
    const amt = Number(tx.amount) || 0;
    const signed = tx.type === 'قبض' ? amt : -amt;
    const acc = accountOf(tx.paymentMethod);
    if (tx.category === 'مبيعات كاشير (فواتير بيع)' && tx.referenceId) invoices.add(tx.referenceId);
    if (acc === 'cash') {
      if (tx.type === 'قبض') cashIn += amt; else cashOut += amt;
      if (tx.category === 'مبيعات كاشير (فواتير بيع)' && tx.type === 'قبض') cashSales += amt;
      byCat.set(tx.category, (byCat.get(tx.category) || 0) + signed);
    } else {
      nonCash[acc] += signed;
    }
  }
  const breakdown: ShiftCashLine[] = Array.from(byCat.entries())
    .map(([label, amount]) => ({ label, amount: round2(amount) }))
    .filter(l => l.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    cashSales: round2(cashSales),
    nonCash: { instapay: round2(nonCash.instapay), visa: round2(nonCash.visa), wallet: round2(nonCash.wallet) },
    invoiceCount: invoices.size,
    breakdown,
    expectedCash: round2((Number(shift.openingCash) || 0) + cashIn - cashOut),
  };
};

/** الفرق = الفعلي - المتوقع. سالب = عجز، موجب = زيادة. */
export const varianceOf = (counted: number, expected: number): number => round2(counted - expected);
export type VarianceKind = 'match' | 'shortage' | 'surplus';
export const varianceKind = (v: number): VarianceKind => (Math.abs(v) < 0.005 ? 'match' : v < 0 ? 'shortage' : 'surplus');

export const findOpenShifts = (shifts: Shift[]): Shift[] =>
  shifts.filter(s => s.status === 'مفتوحة').sort((a, b) => ((a.openedAt || '') < (b.openedAt || '') ? -1 : 1));

/** الوردية الفعّالة: أقدم وردية مفتوحة (لو فُتحت وردية من جهازين معاً يظهر تنبيه في الشاشة). */
export const findOpenShift = (shifts: Shift[]): Shift | undefined => findOpenShifts(shifts)[0];

/** آخر وردية مغلقة (بالأحدث إغلاقاً) — منها يُؤخذ كاش الافتتاح المقترح. */
export const lastClosedShift = (shifts: Shift[]): Shift | undefined =>
  shifts.filter(s => s.status === 'مغلقة' && s.closedAt).sort((a, b) => (b.closedAt! < a.closedAt! ? -1 : 1))[0];

export const nextShiftNumber = (shifts: Shift[]): string => {
  let max = 0;
  for (const s of shifts) {
    const m = /^SH-(\d+)$/.exec(s.shiftNumber || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `SH-${String(max + 1).padStart(4, '0')}`;
};

/**
 * يختم الحركات الجديدة فقط (التي لم تكن معروفة من قبل) بوقتها ورقم الوردية المفتوحة.
 * الحركات القديمة (المعروفة في knownIds) لا تُمسّ أبداً حتى لا تُنسب لوردية خاطئة.
 */
export const stampNewTreasury = (
  list: TreasuryTransaction[],
  knownIds: Set<string>,
  openShiftId: string | undefined,
  nowISO: string
): { list: TreasuryTransaction[]; changed: boolean } => {
  let changed = false;
  const out = list.map(tx => {
    if (knownIds.has(tx.id)) return tx;
    knownIds.add(tx.id);
    if (tx.at && tx.shiftId !== undefined) return tx;
    changed = true;
    return { ...tx, at: tx.at || nowISO, ...(openShiftId && !tx.shiftId ? { shiftId: openShiftId } : {}) };
  });
  return { list: changed ? out : list, changed };
};

export const fmtMoney = (n: number): string =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
