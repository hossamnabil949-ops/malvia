// دورة الشيكات كدوال نقية (بدون React ولا تخزين).
//  واردة (من عميل):  في الحافظة ← مودع بالبنك ← محصّل | مرتد   (ويمكن الإلغاء/الإعادة للعميل قبل التحصيل)
//  صادرة (لمورد):    صادر ← مصروف | مرتد | ملغي
// المحاسبة: عند تسجيل الشيك يُخصم من مديونية العميل (أو مستحقات المورد) فوراً،
// ولا تتحرك الخزنة إلا عند التحصيل/الصرف الفعلي. الارتداد والإلغاء يعيدان الحساب كما كان.

export type ChequeDirection = 'incoming' | 'outgoing';
export type ChequeStatus = 'في الحافظة' | 'مودع بالبنك' | 'محصّل' | 'صادر' | 'مصروف' | 'مرتد' | 'ملغي';
export type ChequeAction = 'deposit' | 'clear' | 'bounce' | 'cancel';

export interface ChequeEvent { at: string; status: ChequeStatus; by: string; note?: string }

export interface Cheque {
  id: string;
  number: string;              // رقم الشيك
  direction: ChequeDirection;
  status: ChequeStatus;
  amount: number;
  bankName: string;
  dueDate: string;             // YYYY-MM-DD — تاريخ الاستحقاق
  receivedDate: string;        // تاريخ الاستلام (واردة) أو التحرير (صادرة)
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  drawerName?: string;         // محرر الشيك (لو غير العميل نفسه)
  notes?: string;
  createdBy: string;
  createdAt: string;           // ISO
  appliedAmount?: number;      // واردة: ما خُصم فعلاً من مديونية العميل عند التسجيل
  appliedDebt?: number;        // صادرة: ما خُصم فعلاً من مستحقات المورد
  appliedCredit?: number;      // صادرة: الزيادة عن المستحقات (رصيد دائن للمحل)
  history: ChequeEvent[];
}

/** طريقة الدفع المسجلة بالخزنة عند التحصيل/الصرف: حساب بنكي (لا يدخل درج الكاش). */
export const CHEQUE_PAYMENT_METHOD = 'شيك (حساب بنكي)';

export const initialStatus = (d: ChequeDirection): ChequeStatus => (d === 'incoming' ? 'في الحافظة' : 'صادر');
export const OPEN_STATUSES: ChequeStatus[] = ['في الحافظة', 'مودع بالبنك', 'صادر'];
export const isOpen = (c: Pick<Cheque, 'status'>): boolean => OPEN_STATUSES.includes(c.status);

export const ACTION_LABEL: Record<ChequeAction, string> = {
  deposit: 'إيداع بالبنك', clear: 'تم التحصيل', bounce: 'ارتد', cancel: 'إلغاء / إعادة',
};
export const clearLabel = (d: ChequeDirection): string => (d === 'incoming' ? 'تم التحصيل' : 'تم الصرف');

export function availableActions(c: Pick<Cheque, 'direction' | 'status'>): ChequeAction[] {
  if (c.direction === 'incoming') {
    if (c.status === 'في الحافظة') return ['deposit', 'clear', 'bounce', 'cancel'];
    if (c.status === 'مودع بالبنك') return ['clear', 'bounce'];
    return [];
  }
  return c.status === 'صادر' ? ['clear', 'bounce', 'cancel'] : [];
}

export function nextStatus(c: Pick<Cheque, 'direction' | 'status'>, a: ChequeAction): ChequeStatus | null {
  if (!availableActions(c).includes(a)) return null;
  if (a === 'deposit') return 'مودع بالبنك';
  if (a === 'clear') return c.direction === 'incoming' ? 'محصّل' : 'مصروف';
  if (a === 'bounce') return 'مرتد';
  return 'ملغي';
}

export interface ChequeEffect {
  customerBalanceDelta: number;                                   // يضاف على رصيد مديونية العميل
  supplier?: { debtDelta: number; creditDelta: number; paidDelta: number };
  treasury?: { type: 'قبض' | 'صرف'; amount: number; category: 'تحصيل من عميل / ورشة' | 'سداد دفعة لمورد' };
}
const NONE: ChequeEffect = { customerBalanceDelta: 0 };

/** أثر تسجيل شيك جديد + القيم التي يجب حفظها على الشيك لعكسها لاحقاً بدقة. */
export function registrationEffect(
  direction: ChequeDirection,
  amount: number,
  party: { balance: number; deferredDebt?: number }
): { effect: ChequeEffect; applied: Pick<Cheque, 'appliedAmount' | 'appliedDebt' | 'appliedCredit'> } {
  if (direction === 'incoming') {
    const applied = Math.min(amount, Math.max(0, party.balance));
    return { effect: { customerBalanceDelta: -applied }, applied: { appliedAmount: applied } };
  }
  const debt = Math.max(0, party.deferredDebt ?? party.balance ?? 0);
  const appliedDebt = Math.min(amount, debt);
  const appliedCredit = Math.max(0, amount - debt);
  return {
    effect: { customerBalanceDelta: 0, supplier: { debtDelta: -appliedDebt, creditDelta: appliedCredit, paidDelta: amount } },
    applied: { appliedDebt, appliedCredit },
  };
}

/** أثر إجراء على شيك قائم (تحصيل/صرف، ارتداد، إلغاء، إيداع). */
export function actionEffect(c: Cheque, a: ChequeAction): ChequeEffect {
  if (a === 'deposit') return NONE;
  if (a === 'clear') {
    return c.direction === 'incoming'
      ? { customerBalanceDelta: 0, treasury: { type: 'قبض', amount: c.amount, category: 'تحصيل من عميل / ورشة' } }
      : { customerBalanceDelta: 0, treasury: { type: 'صرف', amount: c.amount, category: 'سداد دفعة لمورد' } };
  }
  // ارتداد أو إلغاء: يعود الحساب كما كان قبل تسجيل الشيك
  if (c.direction === 'incoming') return { customerBalanceDelta: c.appliedAmount ?? 0 };
  return {
    customerBalanceDelta: 0,
    supplier: { debtDelta: c.appliedDebt ?? 0, creditDelta: -(c.appliedCredit ?? 0), paidDelta: -c.amount },
  };
}

/** يطبّق إجراءً على الشيك ويرجع نسخة جديدة بحالة وسجل محدّثين (أو null لو غير مسموح). */
export function applyAction(c: Cheque, a: ChequeAction, by: string, nowISO: string, note?: string): Cheque | null {
  const status = nextStatus(c, a);
  if (!status) return null;
  return { ...c, status, history: [...c.history, { at: nowISO, status, by, note: note?.trim() || undefined }] };
}

export type ChequeError = 'NUMBER_REQUIRED' | 'AMOUNT_INVALID' | 'DUE_DATE_INVALID' | 'PARTY_REQUIRED' | 'BANK_REQUIRED' | 'DUPLICATE';

export function validateCheque(
  input: Pick<Cheque, 'number' | 'amount' | 'dueDate' | 'partyId' | 'bankName' | 'direction'>,
  existing: Pick<Cheque, 'number' | 'bankName' | 'direction' | 'status'>[]
): ChequeError | null {
  if (!input.number.trim()) return 'NUMBER_REQUIRED';
  if (!(input.amount > 0) || !Number.isFinite(input.amount)) return 'AMOUNT_INVALID';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(input.dueDate))) return 'DUE_DATE_INVALID';
  if (!input.partyId) return 'PARTY_REQUIRED';
  if (!input.bankName.trim()) return 'BANK_REQUIRED';
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const dup = existing.some(e => e.direction === input.direction && norm(e.number) === norm(input.number) && norm(e.bankName) === norm(input.bankName) && e.status !== 'ملغي');
  return dup ? 'DUPLICATE' : null;
}

const dayMs = 86_400_000;
export const daysBetween = (fromISO: string, toISO: string): number =>
  Math.round((Date.parse(toISO.slice(0, 10)) - Date.parse(fromISO.slice(0, 10))) / dayMs);

export type DueState = 'overdue' | 'due_soon' | 'upcoming' | 'closed';
export function dueState(c: Pick<Cheque, 'status' | 'dueDate'>, todayISO: string, soonDays = 7): DueState {
  if (!isOpen(c)) return 'closed';
  const d = daysBetween(todayISO, c.dueDate);
  if (d < 0) return 'overdue';
  return d <= soonDays ? 'due_soon' : 'upcoming';
}

export interface ChequeSummary {
  pending: { count: number; amount: number };
  dueSoon: { count: number; amount: number };
  overdue: { count: number; amount: number };
  bounced: { count: number; amount: number };
}
export function summarize(cheques: Cheque[], direction: ChequeDirection, todayISO: string, soonDays = 7): ChequeSummary {
  const out: ChequeSummary = { pending: { count: 0, amount: 0 }, dueSoon: { count: 0, amount: 0 }, overdue: { count: 0, amount: 0 }, bounced: { count: 0, amount: 0 } };
  const add = (b: { count: number; amount: number }, amt: number) => { b.count += 1; b.amount += amt; };
  for (const c of cheques) {
    if (c.direction !== direction) continue;
    if (c.status === 'مرتد') { add(out.bounced, c.amount); continue; }
    const st = dueState(c, todayISO, soonDays);
    if (st === 'closed') continue;
    add(out.pending, c.amount);
    if (st === 'overdue') add(out.overdue, c.amount);
    if (st === 'due_soon') add(out.dueSoon, c.amount);
  }
  return out;
}

/** شيكات واردة مفتوحة لكل عميل: تُحسب ضمن مخاطر الائتمان لأنها قد ترتد. */
export function pendingIncomingByCustomer(cheques: Cheque[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cheques) {
    if (c.direction === 'incoming' && c.partyType === 'customer' && isOpen(c)) m.set(c.partyId, (m.get(c.partyId) ?? 0) + (c.appliedAmount ?? 0));
  }
  return m;
}

/** عدد الشيكات التي تحتاج انتباهاً الآن (مستحقة خلال أيام أو متأخرة) للإشعارات. */
export const attentionCount = (cheques: Cheque[], todayISO: string, soonDays = 3): number =>
  cheques.filter(c => { const s = dueState(c, todayISO, soonDays); return s === 'overdue' || s === 'due_soon'; }).length;
