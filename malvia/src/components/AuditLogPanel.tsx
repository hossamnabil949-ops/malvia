import React, { useMemo, useState } from 'react';
import { ShieldCheck, Boxes } from 'lucide-react';
import { AuditEntry, StockMovement } from '../types/autoParts';
import { DateRangeFilter } from './DateRangeFilter';
import { DateRange, EMPTY_DATE_RANGE, inDateRange } from '../utils/dateRange';

const AUDIT_LABEL: Record<string, string> = {
  'invoice.create': 'فاتورة بيع', 'invoice.void': 'إلغاء فاتورة', 'invoice.price_override': 'تعديل سعر', 'invoice.discount': 'خصم',
  'sales_return.create': 'مرتجع مبيعات', 'sales_return.delete': 'حذف مرتجع مبيعات',
  'purchase.create': 'فاتورة مشتريات', 'purchase_return.create': 'مرتجع مشتريات',
  'purchase_return.delete': 'حذف مرتجع مشتريات', 'purchase_return.settle': 'تسوية مرتجع',
  'stock.adjust': 'تعديل رصيد', 'customer.collect': 'تحصيل من عميل', 'customer.credit_limit': 'تعديل حد ائتمان', 'stock.transfer': 'تحويل مخزني', 'loyalty.adjust': 'تعديل نقاط ولاء', 'supplier.payment': 'سداد مورد',
};
const MOVE_LABEL: Record<string, string> = {
  sale: 'بيع', sale_void: 'إلغاء فاتورة', sales_return: 'مرتجع مبيعات', purchase: 'توريد', purchase_return: 'مرتجع مشتريات',
  adjustment: 'تعديل/جرد', import: 'استيراد', sales_return_delete: 'حذف مرتجع مبيعات', purchase_return_delete: 'حذف مرتجع مشتريات',
};
const dayOf = (iso: string) => (iso || '').slice(0, 10);
const timeOf = (iso: string) => { try { return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** سجل التدقيق (من فعل ماذا) + دفتر حركات المخزون (كل زيادة/نقص بسببه). */
export const AuditLogPanel: React.FC<{ auditLog: AuditEntry[]; stockMovements: StockMovement[] }> = ({ auditLog, stockMovements }) => {
  const [tab, setTab] = useState<'audit' | 'moves'>('audit');
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [q, setQ] = useState('');

  const audit = useMemo(() => auditLog.filter(a =>
    inDateRange(dayOf(a.at), range) &&
    (!q.trim() || `${a.userName} ${a.summary} ${a.entityId || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  ), [auditLog, range, q]);
  const moves = useMemo(() => stockMovements.filter(m =>
    inDateRange(dayOf(m.at), range) &&
    (!q.trim() || `${m.partName} ${m.partNumber} ${m.refNumber || ''} ${m.userName}`.toLowerCase().includes(q.trim().toLowerCase()))
  ), [stockMovements, range, q]);

  return (
    <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab('audit')}
          className={`flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-bold border ${tab === 'audit' ? 'bg-amber-500 text-neutral-950 border-amber-400' : 'bg-surface-1 text-neutral-300 border-neutral-700'}`}>
          <ShieldCheck className="w-4 h-4" /> سجل التدقيق ({auditLog.length})
        </button>
        <button type="button" onClick={() => setTab('moves')}
          className={`flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-bold border ${tab === 'moves' ? 'bg-amber-500 text-neutral-950 border-amber-400' : 'bg-surface-1 text-neutral-300 border-neutral-700'}`}>
          <Boxes className="w-4 h-4" /> حركات المخزون ({stockMovements.length})
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم أو الموظف..."
          className="h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-xs text-white flex-1 min-w-40" />
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="border border-neutral-800 rounded-2xl overflow-auto max-h-[28rem]">
        {tab === 'audit' ? (
          <table className="w-full text-right text-xs text-neutral-300">
            <thead className="bg-surface-1 text-neutral-400 text-[11px] sticky top-0">
              <tr><th className="p-2.5">التاريخ</th><th className="p-2.5">الموظف</th><th className="p-2.5">الإجراء</th><th className="p-2.5">التفاصيل</th><th className="p-2.5">المبلغ</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {audit.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-neutral-500">لا توجد سجلات (تبدأ العمليات الجديدة بالتسجيل تلقائياً)</td></tr> :
                audit.map(a => (
                  <tr key={a.id} className="hover:bg-surface-3">
                    <td className="p-2.5 font-mono whitespace-nowrap text-neutral-400">{dayOf(a.at)} {timeOf(a.at)}</td>
                    <td className="p-2.5 whitespace-nowrap">{a.userName}{a.userRole ? <span className="text-[10px] text-neutral-500"> · {a.userRole}</span> : null}</td>
                    <td className="p-2.5 whitespace-nowrap font-bold text-white">{AUDIT_LABEL[a.action] || a.action}</td>
                    <td className="p-2.5">{a.summary}</td>
                    <td className="p-2.5 font-mono">{a.amount !== undefined ? a.amount.toLocaleString('ar-EG') : ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-right text-xs text-neutral-300">
            <thead className="bg-surface-1 text-neutral-400 text-[11px] sticky top-0">
              <tr><th className="p-2.5">التاريخ</th><th className="p-2.5">الصنف</th><th className="p-2.5">السبب</th><th className="p-2.5">المستند</th><th className="p-2.5 text-center">الحركة</th><th className="p-2.5 text-center">الرصيد بعدها</th><th className="p-2.5">الموظف</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {moves.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-neutral-500">لا توجد حركات مسجلة</td></tr> :
                moves.map(m => (
                  <tr key={m.id} className="hover:bg-surface-3">
                    <td className="p-2.5 font-mono whitespace-nowrap text-neutral-400">{dayOf(m.at)} {timeOf(m.at)}</td>
                    <td className="p-2.5"><span className="font-bold text-white block">{m.partName}</span><span className="font-mono text-[10px] text-neutral-500">{m.partNumber}</span></td>
                    <td className="p-2.5 whitespace-nowrap">{MOVE_LABEL[m.type] || m.type}</td>
                    <td className="p-2.5 font-mono">{m.refNumber || '—'}</td>
                    <td className={`p-2.5 text-center font-mono font-bold ${m.qtyDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}</td>
                    <td className="p-2.5 text-center font-mono text-white">{m.balanceAfter}</td>
                    <td className="p-2.5 whitespace-nowrap">{m.userName}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-neutral-500">يحتفظ النظام بآخر 5000 سجل لكل نوع. السجلات الجديدة فقط تُسجَّل (لا يوجد تاريخ للعمليات القديمة).</p>
    </div>
  );
};
