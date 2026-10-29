// تتبع الدفعات (تواريخ الصلاحية) والأرقام التسلسلية كدوال نقية.
//  - الصنف يختار نمط التتبع: none (افتراضي، لا يتغير سلوكه) | batch | serial.
//  - الدفعات: يُخصم بالأقرب انتهاءً أولاً (FEFO) ولا يُباع المنتهي. الرصيد الذي لا دفعة له (قبل تفعيل التتبع) يُباع آخراً.
//  - السيريال: كل وحدة برقم فريد للصنف ولا تُباع إلا وحدة موجودة بالمخزن.

export type TrackingMode = 'none' | 'batch' | 'serial';
export const TRACKING_LABEL: Record<TrackingMode, string> = { none: 'بدون تتبع', batch: 'دفعات وتاريخ صلاحية', serial: 'أرقام تسلسلية (سيريال)' };

export interface StockBatch {
  id: string;
  partId: string;
  batchNo: string;
  expiryDate?: string;           // YYYY-MM-DD — آخر يوم صالح
  receivedDate: string;
  quantity: number;              // المتبقي في الدفعة (يُدمج بالفرق على السحابة)
  initialQuantity: number;
  costPrice?: number;
  supplierName?: string;
  purchaseInvoiceId?: string;
  purchaseInvoiceNumber?: string;
  note?: string;
}

export interface BatchAllocation { batchId: string; batchNo: string; expiryDate?: string; qty: number; restored?: number }

export type SerialStatus = 'in_stock' | 'sold' | 'scrapped';
export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = { in_stock: 'بالمخزن', sold: 'مباع', scrapped: 'تالف / مستبعد' };

export interface SerialUnit {
  id: string;
  partId: string;
  serial: string;
  status: SerialStatus;
  receivedDate: string;
  purchaseInvoiceId?: string;
  purchaseInvoiceNumber?: string;
  soldInvoiceId?: string;
  soldInvoiceNumber?: string;
  soldAt?: string;               // YYYY-MM-DD
  customerName?: string;
  customerPhone?: string;
  note?: string;
}

// ---------------- الدفعات ----------------
export const daysToExpiry = (b: Pick<StockBatch, 'expiryDate'>, todayISO: string): number | null =>
  b.expiryDate ? Math.round((Date.parse(b.expiryDate.slice(0, 10)) - Date.parse(todayISO.slice(0, 10))) / 86_400_000) : null;

export type ExpiryState = 'empty' | 'expired' | 'soon' | 'ok' | 'none';
/** آخر يوم صلاحية يُعتبر صالحاً (المنتهي = تاريخه قبل اليوم). */
export function expiryState(b: Pick<StockBatch, 'expiryDate' | 'quantity'>, todayISO: string, warnDays = 30): ExpiryState {
  if (b.quantity <= 0) return 'empty';
  const d = daysToExpiry(b, todayISO);
  if (d === null) return 'none';
  if (d < 0) return 'expired';
  return d <= warnDays ? 'soon' : 'ok';
}

const byExpiryThenReceived = (a: StockBatch, b: StockBatch): number => {
  const ea = a.expiryDate ? Date.parse(a.expiryDate) : Number.POSITIVE_INFINITY;
  const eb = b.expiryDate ? Date.parse(b.expiryDate) : Number.POSITIVE_INFINITY;
  if (ea !== eb) return ea < eb ? -1 : 1;
  return a.receivedDate.localeCompare(b.receivedDate) || a.id.localeCompare(b.id);
};

export interface FefoResult {
  ok: boolean;
  allocations: BatchAllocation[];
  unassigned: number;     // كمية مسحوبة من رصيد بلا دفعة
  expiredQty: number;     // كمية منتهية الصلاحية موجودة ومُستبعدة
  shortBy: number;        // العجز عند الفشل
}

/** رصيد الصنف الذي لا ينتمي لأي دفعة (رصيد قديم قبل تفعيل التتبع). */
export const unassignedStock = (totalStock: number, partBatches: StockBatch[]): number =>
  Math.max(0, totalStock - partBatches.reduce((s, b) => s + Math.max(0, b.quantity), 0));

/** سحب كمية بالأقرب انتهاءً أولاً. لا يسحب من منتهي الصلاحية أبداً. */
export function allocateFefo(partBatches: StockBatch[], qty: number, totalStock: number, todayISO: string): FefoResult {
  const usable = partBatches
    .filter(b => b.quantity > 0 && expiryState(b, todayISO) !== 'expired')
    .sort(byExpiryThenReceived);
  const expiredQty = partBatches.filter(b => expiryState(b, todayISO) === 'expired').reduce((s, b) => s + b.quantity, 0);
  let need = qty;
  const allocations: BatchAllocation[] = [];
  for (const b of usable) {
    if (need <= 0) break;
    const take = Math.min(b.quantity, need);
    allocations.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: take });
    need -= take;
  }
  let unassigned = 0;
  if (need > 0) {
    const free = unassignedStock(totalStock, partBatches);
    unassigned = Math.min(need, free);
    need -= unassigned;
  }
  return { ok: need <= 0, allocations: need <= 0 ? allocations : [], unassigned: need <= 0 ? unassigned : 0, expiredQty, shortBy: Math.max(0, need) };
}

/** يطبّق تغييراً على كميات الدفعات: sign=-1 للخصم و +1 للإضافة. */
export function applyBatchOps(batches: StockBatch[], ops: { batchId: string; qty: number }[], sign: 1 | -1): StockBatch[] {
  if (ops.length === 0) return batches;
  const delta = new Map<string, number>();
  for (const o of ops) delta.set(o.batchId, (delta.get(o.batchId) ?? 0) + sign * o.qty);
  return batches.map(b => (delta.has(b.id) ? { ...b, quantity: b.quantity + (delta.get(b.id) as number) } : b));
}

/** توزيع إجمالي المرتجع على سطور السحب: يملأ من آخر دفعة سُحبت إلى أولها، وبحدّ كمية كل سطر. */
export function distributeRestored(allocations: BatchAllocation[], totalRestored: number): BatchAllocation[] {
  let left = Math.max(0, totalRestored);
  const out = allocations.map(a => ({ ...a, restored: 0 }));
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(out[i].qty, left);
    out[i].restored = take;
    left -= take;
  }
  return out;
}

export const restoredTotal = (allocations: BatchAllocation[] = []): number => allocations.reduce((s, a) => s + (a.restored ?? 0), 0);

/**
 * تغيير إجمالي المرتجع من الفاتورة بمقدار delta (موجب = مرتجع جديد، سالب = حذف مرتجع).
 * يرجع السطور الجديدة وعمليات الدفعات اللازمة (الفرق بين التوزيعين).
 */
export function shiftRestored(allocations: BatchAllocation[], delta: number): { allocations: BatchAllocation[]; ops: { batchId: string; qty: number }[] } {
  const cap = allocations.reduce((s, a) => s + a.qty, 0);
  const next = distributeRestored(allocations, Math.min(cap, Math.max(0, restoredTotal(allocations) + delta)));
  const ops = next
    .map((n, i) => ({ batchId: n.batchId, qty: (n.restored ?? 0) - (allocations[i].restored ?? 0) }))
    .filter(o => o.qty !== 0);
  return { allocations: next, ops };
}

export const autoBatchNo = (dateISO: string, seq: number): string => `B-${dateISO.replace(/-/g, '').slice(0, 8)}-${String(seq).padStart(2, '0')}`;

export interface ExpiryBuckets { expired: StockBatch[]; within30: StockBatch[]; within60: StockBatch[]; within90: StockBatch[]; later: StockBatch[]; noExpiry: StockBatch[] }
export function expiryBuckets(batches: StockBatch[], todayISO: string): ExpiryBuckets {
  const out: ExpiryBuckets = { expired: [], within30: [], within60: [], within90: [], later: [], noExpiry: [] };
  for (const b of batches) {
    if (b.quantity <= 0) continue;
    const d = daysToExpiry(b, todayISO);
    if (d === null) out.noExpiry.push(b);
    else if (d < 0) out.expired.push(b);
    else if (d <= 30) out.within30.push(b);
    else if (d <= 60) out.within60.push(b);
    else if (d <= 90) out.within90.push(b);
    else out.later.push(b);
  }
  return out;
}

// ---------------- السيريال ----------------
/** يفكّ قائمة سيريالات مكتوبة بأسطر أو فواصل أو مسافات (يدعم الفاصلة العربية) ويحذف الفراغ. */
export function parseSerialList(text: string): string[] {
  return text.split(/[\n\r,،;\t ]+/).map(s => s.trim()).filter(Boolean);
}

const normSerial = (s: string): string => s.trim().toLowerCase();

export type SerialError = 'COUNT_MISMATCH' | 'DUPLICATE_IN_LIST' | 'ALREADY_EXISTS' | 'NOT_IN_STOCK';

/** تحقق من سيريالات توريد: العدد = الكمية، لا تكرار، ولا سيريال موجود للصنف مسبقاً. */
export function validateSerialIntake(serials: string[], quantity: number, partId: string | undefined, units: SerialUnit[]): { error: SerialError | null; detail?: string } {
  if (serials.length !== quantity) return { error: 'COUNT_MISMATCH', detail: `${serials.length}/${quantity}` };
  const seen = new Set<string>();
  for (const s of serials) {
    const k = normSerial(s);
    if (seen.has(k)) return { error: 'DUPLICATE_IN_LIST', detail: s };
    seen.add(k);
  }
  if (partId) {
    const taken = new Set(units.filter(u => u.partId === partId).map(u => normSerial(u.serial)));
    const dup = serials.find(s => taken.has(normSerial(s)));
    if (dup) return { error: 'ALREADY_EXISTS', detail: dup };
  }
  return { error: null };
}

/** تحقق من سيريالات بيع: العدد = الكمية، بلا تكرار، وكلها وحدات موجودة بالمخزن لنفس الصنف. */
export function validateSerialSale(serials: string[] | undefined, quantity: number, partId: string, units: SerialUnit[]): { error: SerialError | null; units: SerialUnit[]; detail?: string } {
  const list = serials ?? [];
  if (list.length !== quantity) return { error: 'COUNT_MISMATCH', units: [], detail: `${list.length}/${quantity}` };
  const seen = new Set<string>();
  const picked: SerialUnit[] = [];
  for (const s of list) {
    const k = normSerial(s);
    if (seen.has(k)) return { error: 'DUPLICATE_IN_LIST', units: [], detail: s };
    seen.add(k);
    const u = units.find(x => x.partId === partId && normSerial(x.serial) === k);
    if (!u || u.status !== 'in_stock') return { error: 'NOT_IN_STOCK', units: [], detail: s };
    picked.push(u);
  }
  return { error: null, units: picked };
}

export const inStockUnits = (units: SerialUnit[], partId: string): SerialUnit[] =>
  units.filter(u => u.partId === partId && u.status === 'in_stock').sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.serial.localeCompare(b.serial));
