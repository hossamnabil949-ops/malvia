// برنامج الولاء كدوال نقية. كل الحسابات بالقروش لتفادي كسور الفاصلة العائمة.
export interface LoyaltySettings {
  enabled: boolean;
  egpPerPoint: number;      // كل كم جنيه مدفوع = نقطة واحدة (مثال: 10)
  pointValueEgp: number;    // قيمة النقطة عند الاستبدال بالجنيه (مثال: 0.5)
  minRedeemPoints: number;  // أقل عدد نقاط يمكن استبداله في الفاتورة الواحدة
}

export const DEFAULT_LOYALTY: LoyaltySettings = { enabled: false, egpPerPoint: 10, pointValueEgp: 0.5, minRedeemPoints: 50 };

export const resolveLoyalty = (s?: Partial<LoyaltySettings> | null): LoyaltySettings => {
  const m = { ...DEFAULT_LOYALTY, ...(s || {}) };
  return {
    enabled: Boolean(m.enabled),
    egpPerPoint: m.egpPerPoint > 0 ? m.egpPerPoint : DEFAULT_LOYALTY.egpPerPoint,
    pointValueEgp: m.pointValueEgp > 0 ? m.pointValueEgp : DEFAULT_LOYALTY.pointValueEgp,
    minRedeemPoints: Math.max(1, Math.floor(m.minRedeemPoints || DEFAULT_LOYALTY.minRedeemPoints)),
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
