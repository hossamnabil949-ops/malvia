// أثر المرتجع (أو حذفه) على الدفعات والسيريال لسطر فاتورة. دالة نقية بلا حالة.
import type { InvoiceItem } from '../types/autoParts';
import { shiftRestored } from './trackingLogic.ts';

export interface ReturnTrackResult {
  item: InvoiceItem;                              // السطر بعد التحديث (توزيع المرتجع + السيريال المرتجع)
  batchOps: { batchId: string; qty: number }[];   // تُضاف (بالإشارة) على كميات الدفعات
  unitsToStock: string[];                         // سيريالات تعود للمخزن
  unitsToSold: string[];                          // سيريالات تعود «مباعة» (عند حذف المرتجع)
}

/**
 * direction = +1 مرتجع جديد، و -1 حذف مرتجع سابق.
 * serials: السيريالات التي اختارها المستخدم (إن وُجدت). بدونها تُختار تلقائياً.
 */
export function trackReturn(it: InvoiceItem, qty: number, serials: string[] | undefined, direction: 1 | -1): ReturnTrackResult {
  let item = it;
  let batchOps: { batchId: string; qty: number }[] = [];
  const unitsToStock: string[] = [];
  const unitsToSold: string[] = [];

  if (it.batchAllocations && it.batchAllocations.length > 0) {
    const sh = shiftRestored(it.batchAllocations, direction * qty);
    item = { ...item, batchAllocations: sh.allocations };
    batchOps = sh.ops;
  }

  if (it.serials && it.serials.length > 0) {
    const returned = it.returnedSerials ?? [];
    const returnedSet = new Set(returned);
    if (direction === 1) {
      const candidates = it.serials.filter(s => !returnedSet.has(s));
      const chosen = (serials ?? []).filter(s => candidates.includes(s));
      for (const s of candidates) { if (chosen.length >= qty) break; if (!chosen.includes(s)) chosen.push(s); }
      const take = chosen.slice(0, qty);
      item = { ...item, returnedSerials: [...returned, ...take] };
      unitsToStock.push(...take);
    } else {
      const chosen = (serials ?? []).filter(s => returnedSet.has(s));
      for (let i = returned.length - 1; i >= 0 && chosen.length < qty; i--) if (!chosen.includes(returned[i])) chosen.push(returned[i]);
      const take = chosen.slice(0, qty);
      item = { ...item, returnedSerials: returned.filter(s => !take.includes(s)) };
      unitsToSold.push(...take);
    }
  }
  return { item, batchOps, unitsToStock, unitsToSold };
}
