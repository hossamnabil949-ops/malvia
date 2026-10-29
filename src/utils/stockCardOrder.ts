// ترتيب حركات كارت الصنف: التاريخ أولاً، وداخل اليوم الواحد حسب تسلسل العمل الفعلي:
// توريد ثم بيع ثم مرتجع مبيعات (المرتجع لا يسبق بيعه) ثم مرتجع مشتريات.
// وداخل نفس النوع بحسب وقت الإنشاء المستخرج من رقم المستند الداخلي إن وُجد.
export type MovementKind = 'purchase' | 'sale' | 'sales_return' | 'purchase_return';

export const KIND_RANK: Record<MovementKind, number> = { purchase: 0, sale: 1, sales_return: 2, purchase_return: 3 };

/** وقت الإنشاء بالمللي ثانية إن كان معرّف المستند يحتوي على طابع زمني (مثل inv-1761234567890). */
export function timestampFromId(id?: string): number | undefined {
  const m = id ? /(\d{13})/.exec(id) : null;
  return m ? Number(m[1]) : undefined;
}

export interface Orderable { date: string; kind: MovementKind; ts?: number; doc: string }

export function compareMovements(a: Orderable, b: Orderable): number {
  return (
    a.date.localeCompare(b.date) ||
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    (a.ts ?? 0) - (b.ts ?? 0) ||
    a.doc.localeCompare(b.doc)
  );
}
