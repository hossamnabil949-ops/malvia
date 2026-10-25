import React, { useMemo, useState } from 'react';
import { X, FileSpreadsheet, ClipboardList, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AutoPart, Invoice, PurchaseInvoice, SalesReturn, PurchaseReturn } from '../types/autoParts';
import { DateRangeFilter } from './DateRangeFilter';
import { DateRange, EMPTY_DATE_RANGE, inDateRange, todayISO } from '../utils/dateRange';
import { MovementKind, compareMovements, timestampFromId } from '../utils/stockCardOrder';

interface StockCardModalProps {
  part: AutoPart;
  invoices: Invoice[];
  purchaseInvoices: PurchaseInvoice[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  onClose: () => void;
}

interface Movement {
  date: string;
  kind: MovementKind;
  doc: string;
  party: string;
  qtyIn: number;
  qtyOut: number;
  unitValue: number; // تكلفة للشراء / سعر للبيع
  balance: number;
  ts?: number;       // وقت إنشاء المستند (لترتيب نفس اليوم)
}

const KIND_LABEL: Record<MovementKind, { label: string; cls: string }> = {
  purchase: { label: 'توريد (مشتريات)', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  sales_return: { label: 'مرتجع مبيعات (رجوع للمخزن)', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  sale: { label: 'بيع', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  purchase_return: { label: 'مرتجع مشتريات (خروج للمورد)', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

const norm = (v?: string) => (v || '').trim().toLowerCase();
const fmt = (n: number) => n.toLocaleString('ar-EG', { maximumFractionDigits: 2 });

/** كارت الصنف: كل حركات الصنف (توريد/بيع/مرتجعات) مع الرصيد التراكمي بعد كل حركة. */
export const StockCardModal: React.FC<StockCardModalProps> = ({
  part, invoices, purchaseInvoices, salesReturns, purchaseReturns, onClose,
}) => {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);

  const { movements, opening } = useMemo(() => {
    const pn = norm(part.partNumber);
    const same = (num?: string, name?: string) => (pn && norm(num) === pn) || (!norm(num) && norm(name) === norm(part.name));
    const list: Omit<Movement, 'balance'>[] = [];

    purchaseInvoices.forEach(inv => inv.items.forEach(it => {
      if (same(it.partNumber, it.partName)) list.push({ date: inv.date, kind: 'purchase', ts: timestampFromId(inv.id), doc: inv.invoiceNumber, party: inv.supplierName, qtyIn: it.quantity, qtyOut: 0, unitValue: it.costPrice });
    }));
    salesReturns.forEach(r => r.items.forEach(it => {
      if (same(it.partNumber, it.partName)) list.push({ date: r.date, kind: 'sales_return', ts: timestampFromId(r.id), doc: r.returnNumber || r.id, party: r.customerName, qtyIn: it.quantity, qtyOut: 0, unitValue: it.unitPrice });
    }));
    invoices.forEach(inv => {
      if (inv.status === 'ملغاة') return;
      inv.items.forEach(it => {
        if (same(it.partNumber, it.partName)) list.push({ date: inv.date, kind: 'sale', ts: timestampFromId(inv.id), doc: inv.invoiceNumber, party: inv.customerName, qtyIn: 0, qtyOut: it.quantity, unitValue: it.unitPrice });
      });
    });
    purchaseReturns.forEach(r => r.items.forEach(it => {
      if (same(it.partNumber, it.partName)) list.push({ date: r.date, kind: 'purchase_return', ts: timestampFromId(r.id), doc: r.returnNumber || r.id, party: r.supplierName, qtyIn: 0, qtyOut: it.quantity, unitValue: it.unitCost });
    }));

    list.sort(compareMovements); // الأقدم فوق: توريد، ثم بيع، ثم المرتجع بعده

    // الرصيد الافتتاحي = الرصيد الحالي - صافي كل الحركات المسجلة (رصيد ما قبل أول حركة)
    const net = list.reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
    const openingBal = part.stockQuantity - net;
    let running = openingBal;
    const withBalance: Movement[] = list.map(m => {
      running += m.qtyIn - m.qtyOut;
      return { ...m, balance: running };
    });
    return { movements: withBalance, opening: openingBal };
  }, [part, invoices, purchaseInvoices, salesReturns, purchaseReturns]);

  const shown = useMemo(() => movements.filter(m => inDateRange(m.date, range)), [movements, range]);

  const totals = useMemo(() => {
    const t = { purchased: 0, sold: 0, salesRet: 0, purRet: 0 };
    shown.forEach(m => {
      if (m.kind === 'purchase') t.purchased += m.qtyIn;
      else if (m.kind === 'sale') t.sold += m.qtyOut;
      else if (m.kind === 'sales_return') t.salesRet += m.qtyIn;
      else t.purRet += m.qtyOut;
    });
    return t;
  }, [shown]);

  const exportExcel = () => {
    const rows = [
      { 'التاريخ': '', 'نوع الحركة': 'رصيد افتتاحي', 'المستند': '', 'الطرف': '', 'وارد': '', 'صادر': '', 'السعر': '', 'الرصيد': opening },
      ...shown.map(m => ({
        'التاريخ': m.date, 'نوع الحركة': KIND_LABEL[m.kind].label, 'المستند': m.doc, 'الطرف': m.party,
        'وارد': m.qtyIn || '', 'صادر': m.qtyOut || '', 'السعر': m.unitValue, 'الرصيد': m.balance,
      })),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'كارت الصنف');
    XLSX.writeFile(wb, `MALVIA_كارت_صنف_${part.partNumber}_${todayISO()}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl bg-surface-2 text-white rounded-3xl p-5 shadow-2xl border border-neutral-800 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-start gap-2 min-w-0">
            <ClipboardList className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white">كارت الصنف</h3>
              <p className="text-xs text-neutral-300 font-bold truncate">{part.name}</p>
              <p className="text-[11px] font-mono text-neutral-500">{part.partNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">الرصيد الحالي</span><strong className="font-mono text-lg text-amber-400">{part.stockQuantity} {part.unit}</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">سعر التكلفة / البيع</span><strong className="font-mono text-white">{fmt(part.costPrice)} / {fmt(part.salePrice)}</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">قيمة المخزون (تكلفة)</span><strong className="font-mono text-white">{fmt(part.stockQuantity * part.costPrice)} ج.م</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">الماركة · المكان</span><strong className="text-white">{part.brand} · {part.shelfLocation}</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">الفئة</span><strong className="text-white">{part.category}</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">حد التنبيه</span><strong className="font-mono text-white">{part.minAlertStock}</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">تاريخ الإضافة</span><strong className="font-mono text-white">{part.createdAt || '—'}</strong></div>
          <div className="p-3 rounded-2xl bg-surface-1"><span className="text-neutral-400 block">آخر حركة</span><strong className="font-mono text-white">{part.updatedAt || '—'}</strong></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <button type="button" onClick={exportExcel} className="flex items-center gap-1.5 px-3 h-11 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-500 text-neutral-200 text-xs font-bold">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> تصدير إكسيل
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-bold">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-300 flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5" />توريد: {totals.purchased}</div>
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-300 flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5" />مرتجع مبيعات: {totals.salesRet}</div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-300 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />مبيعات: {totals.sold}</div>
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-300 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />مرتجع مشتريات: {totals.purRet}</div>
        </div>

        <div className="border border-neutral-800 rounded-2xl overflow-auto max-h-96">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-1 text-neutral-400 text-[11px] sticky top-0">
              <tr>
                <th className="p-2.5">التاريخ</th>
                <th className="p-2.5">الحركة</th>
                <th className="p-2.5">المستند</th>
                <th className="p-2.5">الطرف</th>
                <th className="p-2.5 text-center">وارد</th>
                <th className="p-2.5 text-center">صادر</th>
                <th className="p-2.5 text-center">السعر</th>
                <th className="p-2.5 text-center">الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              <tr className="bg-surface-1/60">
                <td className="p-2.5 text-neutral-500" colSpan={7}>رصيد ما قبل أول حركة مسجلة (افتتاحي)</td>
                <td className="p-2.5 text-center font-mono font-bold text-neutral-300">{opening}</td>
              </tr>
              {shown.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-neutral-500">لا توجد حركات في هذه الفترة</td></tr>
              ) : shown.map((m, i) => (
                <tr key={i} className="hover:bg-surface-3">
                  <td className="p-2.5 font-mono text-neutral-400 whitespace-nowrap">{m.date}</td>
                  <td className="p-2.5"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${KIND_LABEL[m.kind].cls}`}>{KIND_LABEL[m.kind].label}</span></td>
                  <td className="p-2.5 font-mono text-neutral-300 whitespace-nowrap">{m.doc}</td>
                  <td className="p-2.5 text-neutral-300">{m.party}</td>
                  <td className="p-2.5 text-center font-mono text-emerald-400">{m.qtyIn > 0 ? `+${m.qtyIn}` : ''}</td>
                  <td className="p-2.5 text-center font-mono text-rose-400">{m.qtyOut > 0 ? `-${m.qtyOut}` : ''}</td>
                  <td className="p-2.5 text-center font-mono text-neutral-400">{fmt(m.unitValue)}</td>
                  <td className="p-2.5 text-center font-mono font-bold text-white">{m.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-neutral-500">الرصيد بعد آخر حركة يساوي الرصيد الحالي للصنف. المرتجعات تظهر كحركات مستقلة (وارد/صادر) بدل تعديل الحركة الأصلية.</p>
      </div>
    </div>
  );
};
