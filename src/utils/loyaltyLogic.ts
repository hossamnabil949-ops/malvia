// برنامج الولاء كدوال نقية. كل الحسابات بالقروش لتفادي كسور الفاصلة العائمة.
export interface LoyaltySettings {
  enabled: boolean;
  egpPerPoint: number;      // كل كم جنيه مدفوع = نقطة واحدة (مثال: 10)
  pointValueEgp: number;    // قيمة النقطة عند الاستبدال بالجنيه (مثال: 0.5)
  minRedeemPoints: number;  // أقل عدد نقاط يمكن استبداله في الفاتورة الواحدة
  expiryMonths: number;     // صلاحية النقاط بالشهور من تاريخ اكتسابها (0 = بدون انتهاء)
}

export const DEFAULT_LOYALTY: LoyaltySettings = { enabled: false, egpPerPoint: 10, pointValueEgp: 0.5, minRedeemPoints: 50, expiryMonths: 0 };

export const resolveLoyalty = (s?: Partial<LoyaltySettings> | null): LoyaltySettings => {
  const m = { ...DEFAULT_LOYALTY, ...(s || {}) };
  return {
    enabled: Boolean(m.enabled),
    egpPerPoint: m.egpPerPoint > 0 ? m.egpPerPoint : DEFAULT_LOYALTY.egpPerPoint,
    pointValueEgp: m.pointValueEgp > 0 ? m.pointValueEgp : DEFAULT_LOYALTY.pointValueEgp,
    minRedeemPoints: Math.max(1, Math.floor(m.minRedeemPoints || DEFAULT_LOYALTY.minRedeemPoints)),
    expiryMonths: Math.max(0, Math.floor(Number(m.expiryMonths) || 0)),
  };
};

const toPi = (egp: number): number => Math.round(egp * 100);

/** النقاط المكتسبة من مبلغ فاتورة (بعد الخصم). تقريب لأسفل. */
export function earnedPoints(netEgp: number, egpPerPoint: number): number {
  if (!(netEgp > 0) || !(egpPerPoint > 0)) return 0;
  return Math.floor(toPi(netEgp) / toPi(egpPerPoint));
}

/** قيمة عدد من النقاط بالجنيه (قرشين). */
export function pointsValue(points: number, pointValueEgp: number): number {
  if (!(points > 0)) return 0;
  return Math.round(points * toPi(pointValueEgp)) / 100;
}

/**
 * أقصى نقاط يمكن استبدالها الآن: لا تزيد عن رصيد العميل، ولا عن سقف الخصم المتاح (بالجنيه)،
 * وإن كانت أقل من الحد الأدنى للاستبدال فالنتيجة 0.
 */
export function maxRedeemablePoints(p: { balance: number; pointValueEgp: number; minRedeemPoints: number; capEgp: number }): number {
  if (!(p.balance > 0) || !(p.capEgp > 0) || !(p.pointValueEgp > 0)) return 0;
  const byCap = Math.floor(toPi(p.capEgp) / toPi(p.pointValueEgp));
  const pts = Math.min(Math.floor(p.balance), byCap);
  return pts >= p.minRedeemPoints ? pts : 0;
}

/** النقاط التي تبقى للفاتورة بعد مرتجعات بقيمة returnedAmount (نسبياً من المكتسب الأصلي). */
export function loyaltyAfterReturn(earned: number, grandTotal: number, returnedAmount: number): number {
  if (!(earned > 0) || !(grandTotal > 0)) return 0;
  const net = Math.max(0, toPi(grandTotal) - toPi(Math.max(0, returnedAmount)));
  return Math.floor((earned * net) / toPi(grandTotal));
}

// ====================================================================================
// سجل حركات النقاط (دفتر الأستاذ) — المصدر الحقيقي لرصيد النقاط وصلاحيتها.
// الرصيد = مجموع حركات العميل. كل حركة موجبة تُنشئ «دفعة» لها تاريخ انتهاء (إن كان الانتهاء مفعّلاً)،
// والحركات السالبة تستهلك الدفعات الأقرب انتهاءً أولاً. انتهاء الصلاحية يُسجَّل بحركة برقم ثابت
// (LYE-<رقم الدفعة>) وتاريخها = لحظة الانتهاء نفسها، فإذا سجّلها جهازان معاً يندمجان في حركة واحدة.
// ====================================================================================
export type LoyaltyEntryType =
  | 'earn' | 'redeem' | 'reverse_earn' | 'reverse_redeem' | 'return' | 'return_undo' | 'adjust' | 'expire' | 'opening';

export interface LoyaltyEntry {
  id: string;
  at: string;            // ISO
  customerId: string;
  customerName: string;
  type: LoyaltyEntryType;
  points: number;        // موجب إضافة / سالب خصم
  refId?: string;        // رقم الفاتورة (أو الدفعة المنتهية في حركة expire)
  refNumber?: string;
  note?: string;
  userName: string;
  expiresAt?: string;    // للحركات الموجبة فقط
}

export const LOYALTY_TYPE_LABEL: Record<LoyaltyEntryType, string> = {
  earn: 'اكتساب من فاتورة', redeem: 'استبدال بخصم', reverse_earn: 'سحب نقاط فاتورة ملغاة', reverse_redeem: 'رد نقاط فاتورة ملغاة',
  return: 'سحب بسبب مرتجع', return_undo: 'رد بسبب حذف مرتجع', adjust: 'تعديل يدوي', expire: 'انتهاء الصلاحية', opening: 'رصيد افتتاحي',
};

/** يضيف شهوراً بتاريخ ISO (يقصّ اليوم لآخر الشهر عند الحاجة، مثل 31 يناير + شهر = 28 فبراير). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString();
}

interface Lot { id: string; remaining: number; expiresAt?: string; closed: boolean }
const expiryMs = (l: Lot): number => (l.expiresAt ? Date.parse(l.expiresAt) : Number.POSITIVE_INFINITY);
const byTime = (a: LoyaltyEntry, b: LoyaltyEntry): number => Date.parse(a.at) - Date.parse(b.at);

function replay(entries: LoyaltyEntry[]): Lot[] {
  const lots: Lot[] = [];
  for (const e of [...entries].sort(byTime)) {
    if (e.type === 'expire') {
      const lot = lots.find(l => l.id === e.refId);
      if (lot) { lot.remaining = 0; lot.closed = true; }
      continue;
    }
    if (e.points > 0) { lots.push({ id: e.id, remaining: e.points, expiresAt: e.expiresAt, closed: false }); continue; }
    let need = -e.points;
    const t = Date.parse(e.at);
    const usable = lots
      .filter(l => !l.closed && l.remaining > 0 && (!l.expiresAt || Date.parse(l.expiresAt) > t))
      .sort((a, b) => (expiryMs(a) === expiryMs(b) ? 0 : expiryMs(a) < expiryMs(b) ? -1 : 1));
    for (const l of usable) {
      if (need <= 0) break;
      const take = Math.min(l.remaining, need);
      l.remaining -= take;
      need -= take;
    }
  }
  return lots;
}

export interface LoyaltyAnalysis {
  balance: number;                              // مجموع الحركات (قد يشمل نقاطاً انتهت ولم تُسجَّل بعد)
  available: number;                            // الرصيد القابل للاستبدال الآن (بعد استبعاد المنتهي)
  pendingExpiry: { lotId: string; points: number; expiresAt: string }[];
  expiringWithin: (days: number) => number;     // نقاط ستنتهي خلال عدد أيام
  nextExpiryAt?: string;
}

export function analyzeLoyalty(entries: LoyaltyEntry[], nowISO: string): LoyaltyAnalysis {
  const now = Date.parse(nowISO);
  const balance = entries.reduce((s, e) => s + e.points, 0);
  const lots = replay(entries);
  const pending = lots
    .filter(l => !l.closed && l.remaining > 0 && l.expiresAt && Date.parse(l.expiresAt) <= now)
    .map(l => ({ lotId: l.id, points: l.remaining, expiresAt: l.expiresAt as string }));
  const open = lots.filter(l => !l.closed && l.remaining > 0 && l.expiresAt && Date.parse(l.expiresAt) > now);
  const pendingTotal = pending.reduce((s, p) => s + p.points, 0);
  const next = open.reduce<string | undefined>((m, l) => (!m || Date.parse(l.expiresAt as string) < Date.parse(m) ? l.expiresAt : m), undefined);
  return {
    balance,
    available: balance - pendingTotal,
    pendingExpiry: pending,
    expiringWithin: (days: number) =>
      open.filter(l => Date.parse(l.expiresAt as string) <= now + days * 86_400_000).reduce((s, l) => s + l.remaining, 0),
    nextExpiryAt: next,
  };
}

const groupByCustomer = (entries: LoyaltyEntry[]): Map<string, LoyaltyEntry[]> => {
  const m = new Map<string, LoyaltyEntry[]>();
  for (const e of entries) { const a = m.get(e.customerId); if (a) a.push(e); else m.set(e.customerId, [e]); }
  return m;
};

/** الرصيد القابل للاستبدال لكل عميل. */
export function availableBalances(entries: LoyaltyEntry[], nowISO: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [cid, list] of groupByCustomer(entries)) out.set(cid, analyzeLoyalty(list, nowISO).available);
  return out;
}

/** حركات انتهاء الصلاحية المستحقة التسجيل الآن (رقم ثابت لكل دفعة => آمنة عند تشغيلها من جهازين). */
export function pendingExpiryEntries(entries: LoyaltyEntry[], nowISO: string): LoyaltyEntry[] {
  const out: LoyaltyEntry[] = [];
  for (const [cid, list] of groupByCustomer(entries)) {
    const name = list[list.length - 1].customerName;
    for (const p of analyzeLoyalty(list, nowISO).pendingExpiry) {
      out.push({
        id: `LYE-${p.lotId}`, at: p.expiresAt, customerId: cid, customerName: name, type: 'expire',
        points: -p.points, refId: p.lotId, note: 'انتهاء صلاحية النقاط', userName: 'النظام',
      });
    }
  }
  return out;
}

/** حركات عميل مرتبة من الأقدم للأحدث مع الرصيد بعد كل حركة. */
export function withRunningBalance(entries: LoyaltyEntry[]): (LoyaltyEntry & { balanceAfter: number })[] {
  let run = 0;
  return [...entries].sort(byTime).map(e => { run += e.points; return { ...e, balanceAfter: run }; });
}
