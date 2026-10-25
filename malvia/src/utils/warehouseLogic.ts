// منطق المخازن والفروع كدوال نقية (بدون React ولا تخزين) => قابلة للاختبار.
// المخزن الرئيسي ضمني: رصيده = إجمالي رصيد الصنف (stockQuantity) ناقص مجموع أرصدة المخازن الأخرى.
// لذلك بقية النظام (فواتير، تقارير، تنبيهات) يستمر يرى «الإجمالي» ولا يحتاج تعديلاً.

export const MAIN_WAREHOUSE_ID = 'main';
export const MAIN_WAREHOUSE_NAME = 'المخزن الرئيسي';

export interface LevelRow { id: string; partId: string; warehouseId: string; quantity: number }
export interface PartStock { id: string; stockQuantity: number }
export interface TransferInput { partId: string; qty: number }

export type TransferErrorCode = 'EMPTY' | 'SAME_WAREHOUSE' | 'INVALID_QTY' | 'INSUFFICIENT_STOCK';
export class TransferError extends Error {
  code: TransferErrorCode;
  details: Record<string, unknown>;
  constructor(code: TransferErrorCode, details: Record<string, unknown> = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

export const levelId = (partId: string, warehouseId: string): string => `${partId}|${warehouseId}`;
const isMain = (id?: string): boolean => !id || id === MAIN_WAREHOUSE_ID;
export const normalizeWarehouseId = (id?: string): string => (isMain(id) ? MAIN_WAREHOUSE_ID : (id as string));

/** مجموع أرصدة الصنف في كل المخازن غير الرئيسية. */
export function nonMainTotal(levels: LevelRow[], partId: string): number {
  return levels.reduce((s, l) => (l.partId === partId && !isMain(l.warehouseId) ? s + l.quantity : s), 0);
}

/** الرصيد المتاح للصنف داخل مخزن معين (الرئيسي = الإجمالي ناقص الباقي). */
export function availableIn(totalStock: number, levels: LevelRow[], partId: string, warehouseId?: string): number {
  if (isMain(warehouseId)) return totalStock - nonMainTotal(levels, partId);
  return levels.find(l => l.id === levelId(partId, warehouseId as string))?.quantity ?? 0;
}

/** يضيف delta لرصيد صنف في مخزن غير رئيسي (يُنشئ السطر عند الحاجة). المخزن الرئيسي: بلا تغيير (مشتق). */
export function adjustLevel(levels: LevelRow[], partId: string, warehouseId: string | undefined, delta: number): LevelRow[] {
  if (isMain(warehouseId) || delta === 0) return levels;
  const id = levelId(partId, warehouseId as string);
  if (levels.some(l => l.id === id)) return levels.map(l => (l.id === id ? { ...l, quantity: l.quantity + delta } : l));
  return [...levels, { id, partId, warehouseId: warehouseId as string, quantity: delta }];
}

/** نسخة لمجموعة سطور (مثل بنود فاتورة) بنفس الإشارة. */
export function adjustLevels(levels: LevelRow[], warehouseId: string | undefined, lines: { partId: string; qty: number }[], sign: 1 | -1): LevelRow[] {
  return lines.reduce((acc, l) => adjustLevel(acc, l.partId, warehouseId, sign * l.qty), levels);
}

/** التحقق من أمر تحويل قبل تنفيذه. يرمي TransferError. */
export function validateTransfer(fromId: string | undefined, toId: string | undefined, lines: TransferInput[], parts: PartStock[], levels: LevelRow[]): void {
  if (lines.length === 0) throw new TransferError('EMPTY');
  if (normalizeWarehouseId(fromId) === normalizeWarehouseId(toId)) throw new TransferError('SAME_WAREHOUSE');
  const need = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isFinite(l.qty) || l.qty <= 0 || !Number.isInteger(l.qty)) throw new TransferError('INVALID_QTY', { partId: l.partId });
    need.set(l.partId, (need.get(l.partId) ?? 0) + l.qty);
  }
  const byId = new Map(parts.map(p => [p.id, p.stockQuantity]));
  for (const [partId, qty] of need) {
    const available = availableIn(byId.get(partId) ?? 0, levels, partId, fromId);
    if (qty > available) throw new TransferError('INSUFFICIENT_STOCK', { partId, requested: qty, available });
  }
}

/** ينفّذ التحويل على الأرصدة. إجمالي رصيد الصنف لا يتغير أبداً (يتحرك بين المخازن فقط). */
export function applyTransfer(levels: LevelRow[], fromId: string | undefined, toId: string | undefined, lines: TransferInput[]): LevelRow[] {
  let out = levels;
  for (const l of lines) {
    out = adjustLevel(out, l.partId, fromId, -l.qty);
    out = adjustLevel(out, l.partId, toId, l.qty);
  }
  return out;
}
