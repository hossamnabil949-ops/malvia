// التقارير التحليلية كدوال نقية: كل تقرير يرجع جدولاً عاماً (أعمدة + صفوف + إجماليات) يمكن عرضه وتصديره CSV.
// القواعد المحاسبية الأساسية:
//  - الفواتير الملغاة لا تدخل أي تقرير مبيعات.
//  - كمية الصنف الصافية = المباعة - المرتجعة (returnedQuantity).
//  - الربح = (سعر البيع - تكلفة البند وقت البيع) × الكمية الصافية. تكلفة البند محفوظة على الفاتورة.
import type {
  Invoice, SalesReturn, PurchaseInvoice, AutoPart, Customer, Supplier, Expense, TreasuryTransaction,
} from '../types/autoParts';
import type { Cheque } from './chequeLogic.ts';
import { dueState, daysBetween, isOpen } from './chequeLogic.ts';
import type { StockBatch } from './trackingLogic.ts';
import { expiryState, daysToExpiry } from './trackingLogic.ts';
import type { LoyaltyEntry } from './loyaltyLogic.ts';
import { availableBalances, pointsValue } from './loyaltyLogic.ts';
import { paymentLines } from './paymentLines.ts';

export interface DateRange { from: string; to: string }

export type ColumnKind = 'text' | 'money' | 'int' | 'percent' | 'date';
export interface ReportColumn { key: string; label: string; kind?: ColumnKind }
export type Cell = string | number;
export interface ReportTable {
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  note?: string;
}

export interface ReportData {
  invoices: Invoice[];
  salesReturns: SalesReturn[];
  purchaseInvoices: PurchaseInvoice[];
  parts: AutoPart[];
  customers: Customer[];
  suppliers: Supplier[];
  expenses: Expense[];
  treasury: TreasuryTransaction[];
  cheques: Cheque[];
  batches: StockBatch[];
  loyaltyLedger: LoyaltyEntry[];
  loyaltyPointValue: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const inRange = (date: string | undefined, r: DateRange): boolean => {
  if (!date) return false;
  const d = date.slice(0, 10);
  return (!r.from || d >= r.from) && (!r.to || d <= r.to);
};
const active = (d: ReportData, r: DateRange): Invoice[] => d.invoices.filter(i => i.status !== 'ملغاة' && inRange(i.date, r));
const netQty = (it: { quantity: number; returnedQuantity?: number }): number => Math.max(0, it.quantity - (it.returnedQuantity ?? 0));
const sum = <T,>(list: T[], f: (x: T) => number): number => list.reduce((s, x) => s + f(x), 0);

/** صافي قيمة السطر قبل الضريبة وبعد خصم الفاتورة والمرتجعات. */
const netItemRevenue = (invoice: Invoice, item: Invoice['items'][number]): number => {
  const subtotal = Number(invoice.subtotal) || sum(invoice.items, it => Number(it.total) || (it.quantity * it.unitPrice));
  const remainingRatio = item.quantity > 0 ? Math.max(0, item.quantity - (item.returnedQuantity ?? 0)) / item.quantity : 0;
  const gross = Math.max(0, item.quantity - (item.returnedQuantity ?? 0)) * item.unitPrice;
  const discountShare = subtotal > 0 ? (Number(invoice.discount) || 0) * ((Number(item.total) || item.quantity * item.unitPrice) / subtotal) : 0;
  const afterDiscount = Math.max(0, gross - discountShare * remainingRatio);
  const originalTaxShare = item.taxAmount ?? (subtotal > 0 ? (Number(invoice.tax) || 0) * ((Number(item.total) || item.quantity * item.unitPrice) / subtotal) : 0);
  const taxShare = invoice.pricesIncludeTax ? originalTaxShare * remainingRatio : 0;
  return r2(Math.max(0, afterDiscount - taxShare));
};

/** صافي قيمة الفاتورة قبل الضريبة وبعد الخصم والمرتجعات. */
export function netSales(invoice: Invoice): number {
  return r2(sum(invoice.items, item => netItemRevenue(invoice, item)));
}

function group<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
  return m;
}

// ---------------- المبيعات ----------------
export function reportDailySales(d: ReportData, r: DateRange): ReportTable {
  const inv = active(d, r);
  const validInvoiceIds = new Set(inv.map(i => i.id));
  const rets = d.salesReturns.filter(x => validInvoiceIds.has(x.invoiceId) && inRange(x.date, r));
  const days = new Set<string>([...inv.map(i => i.date.slice(0, 10)), ...rets.map(x => x.date.slice(0, 10))]);
  const rows = [...days].sort().map(day => {
    const di = inv.filter(i => i.date.slice(0, 10) === day);
    const total = sum(di, netSales);
    const ret = sum(rets.filter(x => x.date.slice(0, 10) === day), x => x.totalRefundAmount);
    return { date: day, count: di.length, total: r2(total), discount: r2(sum(di, i => i.discount)), tax: 0, returns: r2(ret), net: r2(total) };
  });
  return {
    id: 'daily-sales', title: 'المبيعات اليومية',
    columns: [
      { key: 'date', label: 'التاريخ', kind: 'date' }, { key: 'count', label: 'عدد الفواتير', kind: 'int' }, { key: 'total', label: 'إجمالي المبيعات', kind: 'money' },
      { key: 'discount', label: 'الخصومات', kind: 'money' }, { key: 'tax', label: 'الضريبة', kind: 'money' }, { key: 'returns', label: 'المرتجعات', kind: 'money' }, { key: 'net', label: 'الصافي', kind: 'money' },
    ],
    rows,
    totals: { date: 'الإجمالي', count: sum(rows, x => x.count), total: r2(sum(rows, x => x.total)), discount: r2(sum(rows, x => x.discount)), tax: r2(sum(rows, x => x.tax)), returns: r2(sum(rows, x => x.returns)), net: r2(sum(rows, x => x.net)) },
    note: 'الصافي قبل الضريبة وبعد الخصم والمرتجعات؛ تُنسب المرتجعات إلى الفاتورة الأصلية لمنع اختلاف تعريف صافي المبيعات بين التقارير.',
  };
}

export function reportSalesByItem(d: ReportData, r: DateRange): ReportTable {
  const costFallback = new Map(d.parts.map(p => [p.id, p.costPrice]));
  const m = new Map<string, { number: string; name: string; qty: number; revenue: number; cost: number }>();
  for (const inv of active(d, r)) {
    for (const it of inv.items) {
      const q = netQty(it);
      if (q <= 0) continue;
      const key = it.partId || it.partNumber;
      const row = m.get(key) ?? { number: it.partNumber, name: it.partName, qty: 0, revenue: 0, cost: 0 };
      row.qty += q;
      row.revenue += netItemRevenue(inv, it);
      row.cost += q * (it.costPrice ?? costFallback.get(it.partId ?? '') ?? 0);
      m.set(key, row);
    }
  }
  const rows = [...m.values()].map(x => ({ number: x.number, name: x.name, qty: x.qty, revenue: r2(x.revenue), cost: r2(x.cost), profit: r2(x.revenue - x.cost), margin: x.revenue > 0 ? r2(((x.revenue - x.cost) / x.revenue) * 100) : 0 }))
    .sort((a, b) => b.profit - a.profit);
  const rev = sum(rows, x => x.revenue), prof = sum(rows, x => x.profit);
  return {
    id: 'sales-by-item', title: 'المبيعات وأرباح الأصناف',
    columns: [
      { key: 'number', label: 'رقم الصنف' }, { key: 'name', label: 'الصنف' }, { key: 'qty', label: 'الكمية الصافية', kind: 'int' }, { key: 'revenue', label: 'قيمة البيع', kind: 'money' },
      { key: 'cost', label: 'التكلفة', kind: 'money' }, { key: 'profit', label: 'الربح', kind: 'money' }, { key: 'margin', label: 'هامش الربح %', kind: 'percent' },
    ],
    rows,
    totals: { number: '', name: 'الإجمالي', qty: sum(rows, x => x.qty), revenue: r2(rev), cost: r2(sum(rows, x => x.cost)), profit: r2(prof), margin: rev > 0 ? r2((prof / rev) * 100) : 0 },
    note: 'القيم قبل خصم الفاتورة العام والضريبة، وبعد استبعاد الكميات المرتجعة والفواتير الملغاة.',
  };
}

export function reportSalesByCustomer(d: ReportData, r: DateRange): ReportTable {
  const bal = new Map(d.customers.map(c => [c.id, c]));
  const g = group(active(d, r), i => i.customerId || `name:${i.customerName}`);
  const rows = [...g.entries()].map(([k, list]) => {
    const c = bal.get(list[0].customerId ?? '');
    const total = sum(list, netSales);
    return { name: c?.name ?? list[0].customerName, count: list.length, total: r2(total), avg: r2(total / list.length), last: list.map(i => i.date.slice(0, 10)).sort().at(-1) ?? '', balance: r2(c?.balance ?? 0) };
  }).sort((a, b) => b.total - a.total);
  return {
    id: 'sales-by-customer', title: 'المبيعات حسب العميل',
    columns: [{ key: 'name', label: 'العميل' }, { key: 'count', label: 'عدد الفواتير', kind: 'int' }, { key: 'total', label: 'صافي المشتريات', kind: 'money' }, { key: 'avg', label: 'متوسط الفاتورة', kind: 'money' }, { key: 'last', label: 'آخر شراء', kind: 'date' }, { key: 'balance', label: 'الرصيد الآجل الحالي', kind: 'money' }],
    rows,
    totals: { name: 'الإجمالي', count: sum(rows, x => x.count), total: r2(sum(rows, x => x.total)), avg: '', last: '', balance: r2(sum(rows, x => x.balance)) },
  };
}

export function reportSalesByCashier(d: ReportData, r: DateRange): ReportTable {
  const inv = active(d, r);
  const voided = d.invoices.filter(i => i.status === 'ملغاة' && inRange(i.date, r));
  const names = new Set([...inv.map(i => i.cashierName), ...voided.map(i => i.cashierName)]);
  const rows = [...names].map(n => {
    const mine = inv.filter(i => i.cashierName === n);
    const total = sum(mine, netSales);
    return { name: n, count: mine.length, total: r2(total), avg: mine.length ? r2(total / mine.length) : 0, voided: voided.filter(i => i.cashierName === n).length };
  }).sort((a, b) => b.total - a.total);
  return {
    id: 'sales-by-cashier', title: 'المبيعات حسب الموظف / الكاشير',
    columns: [{ key: 'name', label: 'الموظف' }, { key: 'count', label: 'عدد الفواتير', kind: 'int' }, { key: 'total', label: 'الإجمالي', kind: 'money' }, { key: 'avg', label: 'متوسط الفاتورة', kind: 'money' }, { key: 'voided', label: 'فواتير ملغاة', kind: 'int' }],
    rows,
    totals: { name: 'الإجمالي', count: sum(rows, x => x.count), total: r2(sum(rows, x => x.total)), avg: '', voided: sum(rows, x => x.voided) },
  };
}

export function reportSalesByPayment(d: ReportData, r: DateRange): ReportTable {
  const m = new Map<string, { count: number; amount: number }>();
  for (const inv of active(d, r)) {
    for (const p of paymentLines(inv)) {
      const row = m.get(p.method) ?? { count: 0, amount: 0 };
      const netRatio = inv.grandTotal > 0 ? netSales(inv) / inv.grandTotal : 0;
      row.count += 1; row.amount += p.amount * netRatio; m.set(p.method, row);
    }
  }
  const total = sum([...m.values()], x => x.amount);
  const rows = [...m.entries()].map(([method, x]) => ({ method, count: x.count, amount: r2(x.amount), share: total > 0 ? r2((x.amount / total) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
  return {
    id: 'sales-by-payment', title: 'المبيعات حسب طريقة الدفع',
    columns: [{ key: 'method', label: 'طريقة الدفع' }, { key: 'count', label: 'عدد الفواتير', kind: 'int' }, { key: 'amount', label: 'المبلغ', kind: 'money' }, { key: 'share', label: 'النسبة %', kind: 'percent' }],
    rows,
    totals: { method: 'الإجمالي', count: sum(rows, x => x.count), amount: r2(total), share: 100 },
    note: 'الفاتورة المقسّمة تُحسب بكل طريقة دفع على حدة بمبلغها.',
  };
}

export function reportReturns(d: ReportData, r: DateRange): ReportTable {
  const m = new Map<string, { number: string; name: string; qty: number; value: number; count: number }>();
  for (const ret of d.salesReturns.filter(x => inRange(x.date, r))) {
    for (const it of ret.items) {
      const k = it.partNumber;
      const row = m.get(k) ?? { number: it.partNumber, name: it.partName, qty: 0, value: 0, count: 0 };
      row.qty += it.quantity; row.value += it.total; row.count += 1; m.set(k, row);
    }
  }
  const rows = [...m.values()].map(x => ({ ...x, value: r2(x.value) })).sort((a, b) => b.value - a.value);
  return {
    id: 'returns', title: 'تحليل مرتجعات المبيعات',
    columns: [{ key: 'number', label: 'رقم الصنف' }, { key: 'name', label: 'الصنف' }, { key: 'count', label: 'عدد مرات الإرجاع', kind: 'int' }, { key: 'qty', label: 'الكمية', kind: 'int' }, { key: 'value', label: 'القيمة', kind: 'money' }],
    rows,
    totals: { number: '', name: 'الإجمالي', count: sum(rows, x => x.count), qty: sum(rows, x => x.qty), value: r2(sum(rows, x => x.value)) },
  };
}

// ---------------- المشتريات والمالية ----------------
export function reportPurchasesBySupplier(d: ReportData, r: DateRange): ReportTable {
  const g = group(d.purchaseInvoices.filter(i => inRange(i.date, r)), i => i.supplierId || `unknown:${i.supplierName}`);
  const rows = [...g.entries()].map(([supplierId, list]) => {
    const name = list[0]?.supplierName || supplierId;
    const total = sum(list, i => i.grandTotal);
    const paid = sum(list, i => i.amountPaid ?? 0);
    return { name, count: list.length, total: r2(total), paid: r2(paid), remaining: r2(Math.max(0, total - paid)) };
  }).sort((a, b) => b.total - a.total);
  return {
    id: 'purchases-by-supplier', title: 'المشتريات حسب المورد',
    columns: [{ key: 'name', label: 'المورد' }, { key: 'count', label: 'عدد الفواتير', kind: 'int' }, { key: 'total', label: 'إجمالي المشتريات', kind: 'money' }, { key: 'paid', label: 'المسدد', kind: 'money' }, { key: 'remaining', label: 'المتبقي', kind: 'money' }],
    rows,
    totals: { name: 'الإجمالي', count: sum(rows, x => x.count), total: r2(sum(rows, x => x.total)), paid: r2(sum(rows, x => x.paid)), remaining: r2(sum(rows, x => x.remaining)) },
  };
}

/** تقرير مطابقة صافي المبيعات بين طرق العرض المختلفة باستخدام تعريف موحد. */
export function reportSalesReconciliation(d: ReportData, r: DateRange): ReportTable {
  const inv = active(d, r);
  const reference = r2(sum(inv, netSales));
  const customerTotal = r2(sum([...group(inv, i => i.customerId || 'unassigned').values()].map(list => sum(list, netSales)), n => n));
  const cashierTotal = r2(sum([...group(inv, i => i.cashierId || i.cashierName).values()].map(list => sum(list, netSales)), n => n));
  const itemReport = reportSalesByItem(d, r);
  const paymentReport = reportSalesByPayment(d, r);
  const dailyReport = reportDailySales(d, r);
  const rows = [
    { source: 'الفواتير (المرجع الموحد)', amount: reference, difference: 0 },
    { source: 'حسب العميل', amount: customerTotal, difference: r2(customerTotal - reference) },
    { source: 'حسب الكاشير', amount: cashierTotal, difference: r2(cashierTotal - reference) },
    { source: 'حسب الأصناف', amount: Number(itemReport.totals?.revenue) || 0, difference: r2((Number(itemReport.totals?.revenue) || 0) - reference) },
    { source: 'حسب طرق الدفع', amount: Number(paymentReport.totals?.amount) || 0, difference: r2((Number(paymentReport.totals?.amount) || 0) - reference) },
    { source: 'حسب الأيام', amount: Number(dailyReport.totals?.net) || 0, difference: r2((Number(dailyReport.totals?.net) || 0) - reference) },
  ];
  return {
    id: 'sales-reconciliation', title: 'مطابقة صافي المبيعات بين التقارير',
    columns: [{ key: 'source', label: 'مصدر التقرير' }, { key: 'amount', label: 'صافي المبيعات', kind: 'money' }, { key: 'difference', label: 'الفرق عن المرجع', kind: 'money' }],
    rows,
    totals: { source: 'المرجع', amount: reference, difference: 0 },
    note: 'كل القيم قبل الضريبة وبعد خصم الفاتورة والمرتجعات، والفاتورة الملغاة مستبعدة. أي فرق غير صفري يحتاج مراجعة بيانات الدفع أو ربط السطور.',
  };
}

export function reportProfitLoss(d: ReportData, r: DateRange): ReportTable {
  const inv = active(d, r);
  const sales = sum(inv, i => Math.max(0, i.subtotal - i.discount - (i.pricesIncludeTax ? (i.tax || 0) : 0)));
  const validIds = new Set(inv.map(i => i.id));
  const invoiceById = new Map(inv.map(i => [i.id, i]));
  const returns = sum(
    d.salesReturns.filter(ret => validIds.has(ret.invoiceId) && inRange(ret.date, r)),
    ret => {
      const invoice = invoiceById.get(ret.invoiceId)!;
      const base = Number(invoice.subtotal) || sum(invoice.items, item => item.total);
      const netBase = Math.max(0, base - (invoice.discount || 0) - (invoice.pricesIncludeTax ? (invoice.tax || 0) : 0));
      return ret.totalRefundAmount * (base > 0 ? netBase / base : 1);
    }
  );
  const costFallback = new Map(d.parts.map(part => [part.id, part.costPrice]));
  const cogs = sum(inv, invoice => sum(invoice.items, item => netQty(item) * (item.costPrice ?? costFallback.get(item.partId ?? '') ?? 0)));
  const expenses = sum(d.expenses.filter(e => inRange(e.date, r)), e => e.amount);
  const drawerShortage = sum(d.treasury.filter(t => inRange(t.date, r) && t.category === 'عجز درج (تسوية وردية)' && t.type === 'صرف'), t => t.amount);
  const net = sales - returns;
  const gross = net - cogs;
  const rows = [
    { item: 'المبيعات (قبل الضريبة وبعد الخصم)', amount: r2(sales) },
    { item: 'يخصم: المرتجعات (قبل الضريبة)', amount: r2(-returns) },
    { item: 'صافي المبيعات', amount: r2(net) },
    { item: 'يخصم: تكلفة البضاعة المباعة', amount: r2(-cogs) },
    { item: 'مجمل الربح', amount: r2(gross) },
    { item: 'يخصم: المصروفات', amount: r2(-expenses) },
    { item: 'يخصم: عجز الدرج', amount: r2(-drawerShortage) },
    { item: 'صافي الربح', amount: r2(gross - expenses - drawerShortage) },
  ];
  return {
    id: 'profit-loss', title: 'ملخص الأرباح والخسائر',
    columns: [{ key: 'item', label: 'البند' }, { key: 'amount', label: 'المبلغ (ج.م)', kind: 'money' }],
    rows,
    note: 'الإيراد قبل الضريبة وبعد الخصم والمرتجعات. تكلفة البضاعة من تكلفة السطر وقت البيع، ثم تكلفة الصنف كبديل عند غيابها. لا يشمل توزيعات الشركاء ورأس المال.',
  };
}

export function reportExpensesByCategory(d: ReportData, r: DateRange): ReportTable {
  const list = d.expenses.filter(e => inRange(e.date, r));
  const total = sum(list, e => e.amount);
  const rows = [...group(list, e => String(e.category)).entries()].map(([cat, l]) => ({ category: cat, count: l.length, amount: r2(sum(l, e => e.amount)), share: total > 0 ? r2((sum(l, e => e.amount) / total) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
  return {
    id: 'expenses', title: 'المصروفات حسب البند',
    columns: [{ key: 'category', label: 'البند' }, { key: 'count', label: 'عدد الحركات', kind: 'int' }, { key: 'amount', label: 'المبلغ', kind: 'money' }, { key: 'share', label: 'النسبة %', kind: 'percent' }],
    rows,
    totals: { category: 'الإجمالي', count: list.length, amount: r2(total), share: 100 },
  };
}

export function reportTreasury(d: ReportData, r: DateRange): ReportTable {
  const list = d.treasury.filter(t => inRange(t.date, r));
  const rows = [...group(list, t => String(t.category)).entries()].map(([cat, l]) => {
    const inn = sum(l.filter(t => t.type === 'قبض'), t => t.amount);
    const out = sum(l.filter(t => t.type === 'صرف'), t => t.amount);
    return { category: cat, count: l.length, inn: r2(inn), out: r2(out), net: r2(inn - out) };
  }).sort((a, b) => b.inn + b.out - (a.inn + a.out));
  return {
    id: 'treasury', title: 'حركة الخزنة حسب البند',
    columns: [{ key: 'category', label: 'البند' }, { key: 'count', label: 'عدد الحركات', kind: 'int' }, { key: 'inn', label: 'قبض', kind: 'money' }, { key: 'out', label: 'صرف', kind: 'money' }, { key: 'net', label: 'الصافي', kind: 'money' }],
    rows,
    totals: { category: 'الإجمالي', count: list.length, inn: r2(sum(rows, x => x.inn)), out: r2(sum(rows, x => x.out)), net: r2(sum(rows, x => x.net)) },
  };
}

// ---------------- المخزون ----------------
export function reportInventoryValuation(d: ReportData): ReportTable {
  const g = group(d.parts, p => String(p.category));
  const rows = [...g.entries()].map(([cat, l]) => {
    const cost = sum(l, p => p.stockQuantity * p.costPrice);
    const sale = sum(l, p => p.stockQuantity * p.salePrice);
    return { category: cat, items: l.length, units: sum(l, p => p.stockQuantity), cost: r2(cost), sale: r2(sale), profit: r2(sale - cost) };
  }).sort((a, b) => b.cost - a.cost);
  return {
    id: 'inventory-valuation', title: 'تقييم المخزون',
    columns: [{ key: 'category', label: 'التصنيف' }, { key: 'items', label: 'عدد الأصناف', kind: 'int' }, { key: 'units', label: 'عدد الوحدات', kind: 'int' }, { key: 'cost', label: 'قيمة التكلفة', kind: 'money' }, { key: 'sale', label: 'قيمة البيع', kind: 'money' }, { key: 'profit', label: 'الربح المتوقع', kind: 'money' }],
    rows,
    totals: { category: 'الإجمالي', items: sum(rows, x => x.items), units: sum(rows, x => x.units), cost: r2(sum(rows, x => x.cost)), sale: r2(sum(rows, x => x.sale)), profit: r2(sum(rows, x => x.profit)) },
  };
}

export function reportLowStock(d: ReportData): ReportTable {
  const rows = d.parts.filter(p => p.minAlertStock > 0 && p.stockQuantity <= p.minAlertStock)
    .map(p => ({ number: p.partNumber, name: p.name, stock: p.stockQuantity, min: p.minAlertStock, suggest: Math.max(0, p.minAlertStock * 2 - p.stockQuantity), cost: r2(Math.max(0, p.minAlertStock * 2 - p.stockQuantity) * p.costPrice) }))
    .sort((a, b) => a.stock - b.stock);
  return {
    id: 'low-stock', title: 'نواقص المخزون واقتراح الطلب',
    columns: [{ key: 'number', label: 'رقم الصنف' }, { key: 'name', label: 'الصنف' }, { key: 'stock', label: 'الرصيد', kind: 'int' }, { key: 'min', label: 'حد التنبيه', kind: 'int' }, { key: 'suggest', label: 'الكمية المقترحة', kind: 'int' }, { key: 'cost', label: 'تكلفة الطلب المقترح', kind: 'money' }],
    rows,
    totals: { number: '', name: 'الإجمالي', stock: '', min: '', suggest: sum(rows, x => x.suggest), cost: r2(sum(rows, x => x.cost)) },
    note: 'الكمية المقترحة تعيد الرصيد إلى ضعف حد التنبيه.',
  };
}

export function reportSlowMoving(d: ReportData, today: string, days = 90): ReportTable {
  const lastSale = new Map<string, string>();
  for (const inv of d.invoices) {
    if (inv.status === 'ملغاة') continue;
    for (const item of inv.items) {
      const key = item.partId || item.partNumber;
      const date = inv.date.slice(0, 10);
      const previous = lastSale.get(key);
      if (!previous || date > previous) lastSale.set(key, date);
    }
  }
  const lastPurchase = new Map<string, string>();
  for (const purchase of d.purchaseInvoices) {
    for (const item of purchase.items) {
      const key = item.partId || item.partNumber;
      const date = purchase.date.slice(0, 10);
      const previous = lastPurchase.get(key);
      if (!previous || date > previous) lastPurchase.set(key, date);
    }
  }
  const rows = d.parts.filter(part => part.stockQuantity > 0).map(part => {
    const activityDates = [
      lastSale.get(part.id) ?? lastSale.get(part.partNumber),
      lastPurchase.get(part.id) ?? lastPurchase.get(part.partNumber),
      part.createdAt,
    ].filter((value): value is string => Boolean(value)).map(value => value.slice(0, 10));
    const lastActivity = activityDates.sort().at(-1) ?? '';
    const idle = lastActivity ? Math.max(0, daysBetween(lastActivity, today)) : 0;
    return {
      number: part.partNumber, name: part.name, stock: part.stockQuantity,
      frozen: r2(part.stockQuantity * part.costPrice), last: lastActivity || '—',
      idle, _i: idle,
    };
  }).filter(row => row._i >= days).sort((a, b) => b.frozen - a.frozen)
    .map(({ _i, ...rest }) => rest);
  return {
    id: 'slow-moving', title: `الأصناف الراكدة (بلا نشاط منذ ${days} يوماً)`,
    columns: [
      { key: 'number', label: 'رقم الصنف' }, { key: 'name', label: 'الصنف' },
      { key: 'stock', label: 'الرصيد', kind: 'int' }, { key: 'frozen', label: 'تكلفة مجمّدة', kind: 'money' },
      { key: 'last', label: 'آخر نشاط (بيع/توريد/إنشاء)', kind: 'date' }, { key: 'idle', label: 'أيام الركود' },
    ],
    rows,
    totals: { number: '', name: 'الإجمالي', stock: sum(rows, x => x.stock), frozen: r2(sum(rows, x => x.frozen)), last: '', idle: '' },
  };
}

export function reportExpiry(d: ReportData, today: string): ReportTable {
  const part = new Map(d.parts.map(p => [p.id, p]));
  const rows = d.batches.filter(b => b.quantity > 0).map(b => {
    const p = part.get(b.partId);
    const days = daysToExpiry(b, today);
    const st = expiryState(b, today);
    return { name: p?.name ?? '—', batch: b.batchNo, expiry: b.expiryDate ?? 'بلا تاريخ', days: days ?? '', state: st === 'expired' ? 'منتهية' : st === 'soon' ? 'قريبة الانتهاء' : st === 'ok' ? 'سليمة' : 'بلا تاريخ', qty: b.quantity, value: r2(b.quantity * (b.costPrice ?? p?.costPrice ?? 0)), _s: b.expiryDate ?? '9999' };
  }).sort((a, b) => a._s.localeCompare(b._s)).map(({ _s, ...rest }) => rest);
  return {
    id: 'expiry', title: 'الدفعات وتواريخ الصلاحية',
    columns: [{ key: 'name', label: 'الصنف' }, { key: 'batch', label: 'الدفعة' }, { key: 'expiry', label: 'الانتهاء', kind: 'date' }, { key: 'days', label: 'الأيام المتبقية' }, { key: 'state', label: 'الحالة' }, { key: 'qty', label: 'الكمية', kind: 'int' }, { key: 'value', label: 'قيمة التكلفة', kind: 'money' }],
    rows,
    totals: { name: 'الإجمالي', batch: '', expiry: '', days: '', state: '', qty: sum(rows, x => x.qty), value: r2(sum(rows, x => x.value)) },
    note: 'القيم المنتهية تمثل خسارة محتملة: استبعدها من شاشة «الدفعات والسيريال».',
  };
}

// ---------------- الذمم والالتزامات ----------------
/** أعمار ديون العملاء: يُوزَّع رصيد العميل على فواتيره الآجلة من الأحدث للأقدم، والباقي يُعدّ قديماً (أكثر من 90). */
export function reportCustomerAging(d: ReportData, today: string): ReportTable {
  const creditOf = (i: Invoice): number => {
    const credit = sum(paymentLines(i).filter(p => p.isCredit), p => p.amount);
    const returnedToCredit = sum(
      d.salesReturns.filter(ret => ret.invoiceId === i.id && ret.refundMethod === 'خصم من رصيد العميل الآجل'),
      ret => ret.totalRefundAmount
    );
    return Math.max(0, credit - returnedToCredit);
  };
  const byCustomer = group(d.invoices.filter(i => i.status !== 'ملغاة' && Boolean(i.customerId) && creditOf(i) > 0), i => i.customerId!);
  const rows = d.customers.filter(c => c.balance > 0).map(c => {
    const list = (byCustomer.get(c.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const b = { b0: 0, b30: 0, b60: 0, b90: 0 };
    let left = c.balance;
    for (const inv of list) {
      if (left <= 0) break;
      const take = Math.min(left, creditOf(inv));
      const age = daysBetween(inv.date, today);
      if (age <= 30) b.b0 += take; else if (age <= 60) b.b30 += take; else if (age <= 90) b.b60 += take; else b.b90 += take;
      left -= take;
    }
    b.b90 += Math.max(0, left);
    return { name: c.name, b0: r2(b.b0), b30: r2(b.b30), b60: r2(b.b60), b90: r2(b.b90), total: r2(c.balance) };
  }).sort((a, b) => b.total - a.total);
  return {
    id: 'customer-aging', title: 'أعمار ديون العملاء',
    columns: [{ key: 'name', label: 'العميل' }, { key: 'b0', label: '0–30 يوماً', kind: 'money' }, { key: 'b30', label: '31–60', kind: 'money' }, { key: 'b60', label: '61–90', kind: 'money' }, { key: 'b90', label: 'أكثر من 90', kind: 'money' }, { key: 'total', label: 'إجمالي الدين', kind: 'money' }],
    rows,
    totals: { name: 'الإجمالي', b0: r2(sum(rows, x => x.b0)), b30: r2(sum(rows, x => x.b30)), b60: r2(sum(rows, x => x.b60)), b90: r2(sum(rows, x => x.b90)), total: r2(sum(rows, x => x.total)) },
    note: 'الدين يُوزَّع على أقدم الفواتير الآجلة أولاً (الأقدم يُسدَّد أولاً). الرصيد الذي لا تغطيه فواتير مسجّلة يُحسب «أكثر من 90».',
  };
}

export function reportSupplierPayables(d: ReportData): ReportTable {
  const rows = d.suppliers.filter(s => s.balance > 0 || (s.storeCredit ?? 0) > 0).map(s => ({ name: s.name, dues: r2(Math.max(0, s.balance)), credit: r2(s.storeCredit ?? 0), paid: r2(s.totalPaid ?? 0), last: s.lastPaymentDate ?? '—' })).sort((a, b) => b.dues - a.dues);
  return {
    id: 'supplier-payables', title: 'مستحقات الموردين',
    columns: [{ key: 'name', label: 'المورد' }, { key: 'dues', label: 'المستحق عليك', kind: 'money' }, { key: 'credit', label: 'رصيد دائن لك', kind: 'money' }, { key: 'paid', label: 'إجمالي المسدد', kind: 'money' }, { key: 'last', label: 'آخر دفعة', kind: 'date' }],
    rows,
    totals: { name: 'الإجمالي', dues: r2(sum(rows, x => x.dues)), credit: r2(sum(rows, x => x.credit)), paid: r2(sum(rows, x => x.paid)), last: '' },
  };
}

export function reportCheques(d: ReportData, today: string): ReportTable {
  const rows = d.cheques.filter(isOpen).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(c => {
    const st = dueState(c, today);
    return { dir: c.direction === 'incoming' ? 'وارد' : 'صادر', party: c.partyName, number: c.number, bank: c.bankName, due: c.dueDate, days: daysBetween(today, c.dueDate), state: st === 'overdue' ? 'متأخر' : st === 'due_soon' ? 'يستحق قريباً' : 'لاحقاً', amount: r2(c.amount), _in: c.direction === 'incoming' ? c.amount : 0, _out: c.direction === 'outgoing' ? c.amount : 0 };
  });
  const inn = sum(rows, x => x._in), out = sum(rows, x => x._out);
  return {
    id: 'cheques', title: 'الشيكات المفتوحة حسب الاستحقاق',
    columns: [{ key: 'dir', label: 'النوع' }, { key: 'party', label: 'الطرف' }, { key: 'number', label: 'رقم الشيك' }, { key: 'bank', label: 'البنك' }, { key: 'due', label: 'الاستحقاق', kind: 'date' }, { key: 'days', label: 'الأيام المتبقية' }, { key: 'state', label: 'الحالة' }, { key: 'amount', label: 'المبلغ', kind: 'money' }, { key: 'incoming', label: 'الوارد', kind: 'money' }, { key: 'outgoing', label: 'الصادر', kind: 'money' }],
    rows: rows.map(({ _in, _out, ...rest }) => ({ ...rest, incoming: _in, outgoing: _out })),
    totals: { dir: 'الإجمالي', party: `واردة ${r2(inn)} · صادرة ${r2(out)}`, number: '', bank: '', due: '', days: '', state: '', amount: r2(inn + out), incoming: r2(inn), outgoing: r2(out) },
    note: 'الأيام السالبة = متأخر عن الاستحقاق.',
  };
}

export function reportLoyalty(d: ReportData, nowISO: string): ReportTable {
  const bal = availableBalances(d.loyaltyLedger, nowISO);
  const name = new Map(d.customers.map(c => [c.id, c.name]));
  const rows = [...bal.entries()].filter(([, p]) => p > 0).map(([id, p]) => ({ name: name.get(id) ?? id, points: p, value: pointsValue(p, d.loyaltyPointValue) })).sort((a, b) => b.points - a.points);
  return {
    id: 'loyalty', title: 'التزامات نقاط الولاء',
    columns: [{ key: 'name', label: 'العميل' }, { key: 'points', label: 'النقاط القابلة للاستبدال', kind: 'int' }, { key: 'value', label: 'قيمتها (ج.م)', kind: 'money' }],
    rows,
    totals: { name: 'الإجمالي', points: sum(rows, x => x.points), value: r2(sum(rows, x => x.value)) },
    note: 'تمثل التزاماً محتملاً على المحل لو استُبدلت كل النقاط. المنتهية الصلاحية مستبعدة.',
  };
}

// ---------------- سجل التقارير والتصدير ----------------
export interface ReportDef { id: string; group: string; title: string; usesRange: boolean; build: (d: ReportData, r: DateRange, today: string) => ReportTable }

export const REPORT_DEFS: ReportDef[] = [
  { id: 'daily-sales', group: 'المبيعات', title: 'المبيعات اليومية', usesRange: true, build: (d, r) => reportDailySales(d, r) },
  { id: 'sales-by-item', group: 'المبيعات', title: 'المبيعات وأرباح الأصناف', usesRange: true, build: (d, r) => reportSalesByItem(d, r) },
  { id: 'sales-by-customer', group: 'المبيعات', title: 'المبيعات حسب العميل', usesRange: true, build: (d, r) => reportSalesByCustomer(d, r) },
  { id: 'sales-by-cashier', group: 'المبيعات', title: 'المبيعات حسب الموظف', usesRange: true, build: (d, r) => reportSalesByCashier(d, r) },
  { id: 'sales-by-payment', group: 'المبيعات', title: 'المبيعات حسب طريقة الدفع', usesRange: true, build: (d, r) => reportSalesByPayment(d, r) },
  { id: 'sales-reconciliation', group: 'المبيعات', title: 'مطابقة صافي المبيعات', usesRange: true, build: (d, r) => reportSalesReconciliation(d, r) },
  { id: 'returns', group: 'المبيعات', title: 'تحليل المرتجعات', usesRange: true, build: (d, r) => reportReturns(d, r) },
  { id: 'profit-loss', group: 'المالية', title: 'الأرباح والخسائر', usesRange: true, build: (d, r) => reportProfitLoss(d, r) },
  { id: 'expenses', group: 'المالية', title: 'المصروفات حسب البند', usesRange: true, build: (d, r) => reportExpensesByCategory(d, r) },
  { id: 'treasury', group: 'المالية', title: 'حركة الخزنة', usesRange: true, build: (d, r) => reportTreasury(d, r) },
  { id: 'purchases-by-supplier', group: 'المالية', title: 'المشتريات حسب المورد', usesRange: true, build: (d, r) => reportPurchasesBySupplier(d, r) },
  { id: 'inventory-valuation', group: 'المخزون', title: 'تقييم المخزون', usesRange: false, build: (d) => reportInventoryValuation(d) },
  { id: 'low-stock', group: 'المخزون', title: 'النواقص واقتراح الطلب', usesRange: false, build: (d) => reportLowStock(d) },
  { id: 'slow-moving', group: 'المخزون', title: 'الأصناف الراكدة', usesRange: false, build: (d, _r, t) => reportSlowMoving(d, t) },
  { id: 'expiry', group: 'المخزون', title: 'الدفعات والصلاحية', usesRange: false, build: (d, _r, t) => reportExpiry(d, t) },
  { id: 'customer-aging', group: 'الذمم والالتزامات', title: 'أعمار ديون العملاء', usesRange: false, build: (d, _r, t) => reportCustomerAging(d, t) },
  { id: 'supplier-payables', group: 'الذمم والالتزامات', title: 'مستحقات الموردين', usesRange: false, build: (d) => reportSupplierPayables(d) },
  { id: 'cheques', group: 'الذمم والالتزامات', title: 'الشيكات المفتوحة', usesRange: false, build: (d, _r, t) => reportCheques(d, t) },
  { id: 'loyalty', group: 'الذمم والالتزامات', title: 'التزامات نقاط الولاء', usesRange: false, build: (d, _r, t) => reportLoyalty(d, `${t}T23:59:59.000Z`) },
];

/** CSV متوافق مع Excel بالعربية (BOM + CRLF) مع حماية الفواصل وعلامات الاقتباس. */
export function reportToCsv(t: ReportTable): string {
  const esc = (v: Cell | undefined): string => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns.map(c => esc(c.label)).join(',')];
  for (const row of t.rows) lines.push(t.columns.map(c => esc(row[c.key])).join(','));
  if (t.totals) lines.push(t.columns.map(c => esc(t.totals![c.key])).join(','));
  return '\uFEFF' + lines.join('\r\n');
}
