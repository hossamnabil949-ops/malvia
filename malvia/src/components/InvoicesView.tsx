import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Receipt, 
  Printer, 
  Eye, 
  Calendar, 
  DollarSign, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Banknote, 
  Zap, 
  Smartphone, 
  Clock, 
  FileSpreadsheet,
  ArrowDownLeft,
  Undo2,
  Trash2,
  Edit3
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Invoice, SalesReturn, SalesReturnItem, PaymentMethod } from '../types/autoParts';
import { DateRangeFilter } from './DateRangeFilter';
import { verifyManagerApproval } from '../services/approvalService';
import { Employee } from '../types/autoParts';
import { DateRange, EMPTY_DATE_RANGE, inDateRange } from '../utils/dateRange';

interface InvoicesViewProps {
  invoices: Invoice[];
  salesReturns: SalesReturn[];
  onOpenInvoiceModal: (invoice: Invoice) => void;
  onSalesReturn: (returnData: SalesReturn) => void;
  onDeleteSalesReturn?: (returnId: string) => void;
  employees?: Employee[];
  currentUserRole?: string;
  currentUserName?: string;
  onVoidInvoice?: (invoiceId: string, reason: string, approvedBy: string) => boolean;
}

const VOID_REASONS = [
  'خطأ في إدخال الفاتورة',
  'خطأ في الأسعار أو الأصناف',
  'العميل غيّر رأيه / لم يدفع',
  'فاتورة مكررة',
  'أخرى',
];

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  invoices,
  salesReturns,
  onOpenInvoiceModal,
  onSalesReturn,
  onDeleteSalesReturn,
  employees = [],
  currentUserRole,
  currentUserName,
  onVoidInvoice,
}) => {
  // ---- إلغاء الفاتورة (Void) ----
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [voidReasonChoice, setVoidReasonChoice] = useState(VOID_REASONS[0]);
  const [voidReasonText, setVoidReasonText] = useState('');
  const [mgrUser, setMgrUser] = useState('');
  const [mgrPass, setMgrPass] = useState('');
  const [voidError, setVoidError] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);
  const isManager = currentUserRole === 'مدير عام';

  const openVoid = (inv: Invoice) => {
    setVoidTarget(inv);
    setVoidReasonChoice(VOID_REASONS[0]);
    setVoidReasonText('');
    setMgrUser('');
    setMgrPass('');
    setVoidError('');
  };

  const confirmVoid = async () => {
    if (!voidTarget || !onVoidInvoice || voidBusy) return;
    const reason = voidReasonChoice === 'أخرى' ? voidReasonText.trim() : `${voidReasonChoice}${voidReasonText.trim() ? ' — ' + voidReasonText.trim() : ''}`;
    if (reason.length < 3) { setVoidError('اكتب سبب الإلغاء (3 أحرف على الأقل).'); return; }
    setVoidBusy(true);
    setVoidError('');
    try {
      // المدير المسجّل دخوله يعتمد بنفسه؛ غيره يحتاج بيانات مدير عام نشط
      let approver = currentUserName || 'المدير';
      if (!isManager) {
        const mgr = await verifyManagerApproval(employees, mgrUser, mgrPass);
        if (!mgr) { setVoidError('بيانات المدير غير صحيحة أو الحساب ليس مدير عام نشط.'); return; }
        approver = mgr.name;
      }
      const ok = onVoidInvoice(voidTarget.id, reason, approver);
      if (!ok) { setVoidError('تعذّر إلغاء الفاتورة (ملغاة بالفعل؟).'); return; }
      setVoidTarget(null);
    } finally {
      setVoidBusy(false);
    }
  };

  const [currentView, setCurrentView] = useState<'invoices' | 'returns'>('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);

  // Sales Return Modal State
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<{ [key: string]: number }>({});
  const [refundMethod, setRefundMethod] = useState<'نقدي (خصم من الخزنة)' | 'خصم من رصيد العميل الآجل' | 'إنستاباي / محفظة'>('نقدي (خصم من الخزنة)');
  const [returnReason, setReturnReason] = useState('عيب في الصنف / عدم مطابقة لموديل السيارة');
  const [returnNotes, setReturnNotes] = useState('');
  const [isCorrectedReturn, setIsCorrectedReturn] = useState(false);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (paymentFilter !== 'all' && inv.paymentMethod !== paymentFilter) return false;
      if (!inDateRange(inv.date, dateRange)) return false;
      if (statusFilter !== 'all') {
        const invStatus = inv.status || 'مسددة';
        if (statusFilter !== invStatus) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          (inv.carDetails && inv.carDetails.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [invoices, paymentFilter, statusFilter, searchQuery, dateRange]);

  const filteredReturns = useMemo(() => {
    return salesReturns.filter((ret) => {
      if (!inDateRange(ret.date, dateRange)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          ret.returnNumber.toLowerCase().includes(q) ||
          ret.invoiceNumber.toLowerCase().includes(q) ||
          ret.customerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [salesReturns, searchQuery, dateRange]);

  const totalSalesRevenue = useMemo(() => invoices.reduce((acc, inv) => inv.status === 'ملغاة' ? acc : acc + inv.grandTotal - (inv.returnedAmount || 0), 0), [invoices]);
  const totalRefundsFromTreasury = useMemo(() => {
    return salesReturns
      .filter(r => r.treasuryDeducted || r.refundMethod === 'نقدي (خصم من الخزنة)')
      .reduce((acc, r) => acc + r.totalRefundAmount, 0);
  }, [salesReturns]);

  const handleOpenReturnModal = (inv: Invoice, isCorrection = false) => {
    setReturnInvoice(inv);
    setIsCorrectedReturn(isCorrection);
    const initialQtys: { [key: string]: number } = {};
    inv.items.forEach((_, idx) => {
      initialQtys[String(idx)] = 0;
    });
    setReturnItems(initialQtys);
    if (inv.paymentMethod === 'آجل (شكك / حساب ورشة)') {
      setRefundMethod('خصم من رصيد العميل الآجل');
    } else {
      setRefundMethod('نقدي (خصم من الخزنة)');
    }
  };

  const calculatedReturnTotal = useMemo(() => {
    if (!returnInvoice) return 0;
    return returnInvoice.items.reduce((acc, it, idx) => {
      const qty = returnItems[String(idx)] || 0;
      return acc + (qty * it.unitPrice);
    }, 0);
  }, [returnInvoice, returnItems]);

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnInvoice || calculatedReturnTotal <= 0) return;

    const itemsToReturn: SalesReturnItem[] = returnInvoice.items
      .map((it, idx) => ({ it, qty: returnItems[String(idx)] || 0 }))
      .filter(({ qty }) => qty > 0)
      .map(({ it, qty }) => ({
        partNumber: it.partNumber,
        partName: it.partName,
        quantity: qty,
        unitPrice: it.unitPrice,
        total: qty * it.unitPrice,
        reason: returnReason,
      }));

    if (itemsToReturn.length === 0) return;

    const returnRecord: SalesReturn = {
      id: `ret-${Date.now()}`,
      returnNumber: `RET-SLS-${Math.floor(1000 + Math.random() * 9000)}`,
      invoiceId: returnInvoice.id,
      invoiceNumber: returnInvoice.invoiceNumber,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      customerName: returnInvoice.customerName,
      items: itemsToReturn,
      totalRefundAmount: calculatedReturnTotal,
      refundMethod,
      treasuryDeducted: refundMethod === 'نقدي (خصم من الخزنة)' || refundMethod === 'إنستاباي / محفظة',
      notes: `${returnReason} ${returnNotes ? ` - ${returnNotes}` : ''}${isCorrectedReturn ? ' [مرتجع مصحح]' : ''}`,
      recordedBy: 'كاشير المحل',
      isCorrected: isCorrectedReturn,
    };

    onSalesReturn(returnRecord);
    setReturnInvoice(null);
  };

  const handleExportInvoicesExcel = () => {
    const data = invoices.map((inv, idx) => ({
      'م': idx + 1,
      'رقم الفاتورة': inv.invoiceNumber,
      'التاريخ': inv.date,
      'الوقت': inv.time,
      'اسم الزبون / الورشة': inv.customerName,
      'نوع العميل': inv.customerType,
      'بيانات السيارة': inv.carDetails || '-',
      'عدد الأصناف': inv.items.length,
      'المجموع الفرعي (ج.م)': inv.subtotal,
      'ضريبة القيمة المضافة': inv.tax,
      'الخصم': inv.discount,
      'الإجمالي النهائي المستحق': inv.grandTotal,
      'طريقة السداد': inv.paymentMethod,
      'حالة الفاتورة': inv.status || 'مسددة',
      'إجمالي المرتجع (ج.م) بالسالب': -(inv.returnedAmount || 0),
      'الحالة': inv.status || 'مسددة',
      'الصافي بعد المرتجع (ج.م)': inv.status === 'ملغاة' ? 0 : inv.grandTotal - (inv.returnedAmount || 0),
      'الكاشير': inv.cashierName
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'فواتير المبيعات');
    XLSX.writeFile(wb, `MALVIA_Sales_Invoices_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase mb-1">
            <Receipt className="w-4 h-4" />
            <span>إدارة المبيعات والمرتجعات النقدية</span>
          </div>
          <h2 className="text-xl font-black text-white">فواتير البيع والمرتجعات المصححة وحذفها</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 mt-1">
            <span>عدد الفواتير: <strong className="text-white font-mono">{invoices.length}</strong></span>
            <span>·</span>
            <span>إجمالي المبيعات: <strong className="text-emerald-400 font-mono">{totalSalesRevenue.toLocaleString()} ج.م</strong></span>
            <span>·</span>
            <span>المرتجعات المصروفة من الخزنة: <strong className="text-rose-400 font-mono">{totalRefundsFromTreasury.toLocaleString()} ج.م</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="p-1 rounded-2xl bg-surface-1 border border-neutral-700 flex items-center gap-1">
            <button
              onClick={() => setCurrentView('invoices')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'invoices'
                  ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              فواتير المبيعات ({invoices.length})
            </button>
            <button
              onClick={() => setCurrentView('returns')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                currentView === 'returns'
                  ? 'bg-rose-500 text-[#ffffff] font-black shadow-sm'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>سجل المرتجعات المصححة ({salesReturns.length})</span>
            </button>
          </div>

          <button
            onClick={handleExportInvoicesExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-500 text-neutral-200 hover:text-emerald-400 text-xs font-bold transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">تصدير إكسيل</span>
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-grow w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={currentView === 'invoices' 
              ? "ابحث برقم الفاتورة، اسم الزبون، الورشة، أو بيانات السيارة..." 
              : "ابحث برقم إذن المرتجع، رقم الفاتورة، أو اسم الزبون..."}
            className="w-full h-11 pr-10 pl-4 rounded-xl bg-surface-1 border border-neutral-700 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-400"
          />
        </div>

        <DateRangeFilter value={dateRange} onChange={setDateRange} />

        {currentView === 'invoices' && (
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-1 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 h-11 focus:outline-none focus:border-amber-400 w-full sm:w-auto"
            >
              <option value="all">كافة الحالات</option>
              <option value="مسددة">مسددة بالكامل</option>
              <option value="مرتجع جزئي">مرتجع جزئي</option>
              <option value="مرتجع كلي">مرتجع بالكامل</option>
              <option value="ملغاة">ملغاة</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-surface-1 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 h-11 focus:outline-none focus:border-amber-400 w-full sm:w-auto"
            >
              <option value="all">كافة طرق الدفع</option>
              <option value="كاش (نقدي)">كاش (نقدي)</option>
              <option value="إنستاباي / InstaPay">إنستاباي InstaPay</option>
              <option value="فودافون كاش ومحافظ إلكترونية">فودافون كاش ومحافظ</option>
              <option value="آجل (شكك / حساب ورشة)">شكك / آجل ورشة</option>
              <option value="فيزا / بطاقة بنكية">فيزا وبطاقات</option>
            </select>
          </>
        )}
      </div>

      {currentView === 'invoices' && (
        <div className="rounded-3xl bg-surface-2 border border-neutral-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-neutral-300">
              <thead className="bg-surface-1 text-neutral-400 text-[11px] uppercase border-b border-neutral-800">
                <tr>
                  <th className="p-3.5">رقم الفاتورة</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5">الزبون / الورشة</th>
                  <th className="p-3.5">السيارة</th>
                  <th className="p-3.5">الأصناف</th>
                  <th className="p-3.5">طريقة السداد</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5">الإجمالي المستحق</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-neutral-500">
                      لا توجد فواتير مطابقة
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isVoided = inv.status === 'ملغاة';
                    const isFullyReturned = inv.status === 'مرتجع كلي' || isVoided;
                    return (
                      <tr key={inv.id} className={`hover:bg-surface-3 transition-colors ${isVoided ? 'opacity-50 line-through decoration-neutral-500' : ''}`}>
                        <td className="p-3.5 font-mono font-bold text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3.5 font-mono text-neutral-400">
                          {inv.date} · {inv.time}
                        </td>
                        <td className="p-3.5 font-bold text-neutral-100">
                          {inv.customerName}
                          <span className="text-[10px] text-neutral-400 block font-normal">
                            ({inv.customerType})
                          </span>
                        </td>
                        <td className="p-3.5 text-neutral-400">
                          {inv.carDetails || '—'}
                        </td>
                        <td className="p-3.5 font-mono">
                          {inv.items.length} أصناف
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold text-[11px]">
                            {inv.paymentMethod}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {inv.status === 'ملغاة' ? (
                            <span className="px-2 py-0.5 rounded-full bg-neutral-700/60 text-neutral-300 font-bold text-[10px] border border-neutral-600" title={`${inv.voidReason || ''} — بموافقة: ${inv.voidApprovedBy || ''}`}>
                              ملغاة
                            </span>
                          ) : inv.status === 'مرتجع كلي' ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/30">
                              مرتجع بالكامل
                            </span>
                          ) : inv.status === 'مرتجع جزئي' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px] border border-amber-500/30">
                              مرتجع جزئي (-{inv.returnedAmount?.toLocaleString()} ج.م)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                              مسددة
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono font-black text-emerald-400 text-sm">
                          {inv.grandTotal.toFixed(2)} ج.م
                          {(inv.returnedAmount || 0) > 0 && (
                            <>
                              <span className="block text-[10px] text-rose-400 font-bold">مرتجع: -{(inv.returnedAmount || 0).toFixed(2)}</span>
                              <span className="block text-[10px] text-neutral-300 font-bold">الصافي: {Math.max(0, inv.grandTotal - (inv.returnedAmount || 0)).toFixed(2)}</span>
                            </>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isFullyReturned && (
                              <button
                                onClick={() => handleOpenReturnModal(inv, false)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-all text-xs font-bold flex items-center gap-1"
                                title="إجراء مرتجع مبيعات وخصم المبلغ من الخزينة"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                                <span>مرتجع</span>
                              </button>
                            )}

                            {!isVoided && onVoidInvoice && (
                              <button
                                onClick={() => openVoid(inv)}
                                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-rose-600 hover:text-white text-neutral-300 border border-neutral-700 transition-all text-xs font-bold flex items-center gap-1"
                                title="إلغاء الفاتورة (يتطلب سبباً وموافقة مدير)"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>إلغاء</span>
                              </button>
                            )}

                            <button
                              onClick={() => onOpenInvoiceModal(inv)}
                              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-200 transition-colors"
                              title="طباعة / معاينة الفاتورة"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentView === 'returns' && (
        <div className="bg-surface-2 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 bg-rose-950/20 border-b border-rose-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-400" />
              <div>
                <h3 className="text-sm font-bold text-white">سجل المرتجعات المصححة وإمكانية حذفها (Sales Returns Management)</h3>
                <p className="text-[11px] text-neutral-400">
                  كافة أذونات المرتجعات مع إمكانية حذف المرتجع ورد المبلغ للخزينة وإعادة خصم الكمية تلقائياً
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-neutral-400 block">إجمالي مبالغ المرتجعات</span>
              <span className="text-lg font-black text-rose-400 font-mono">
                {salesReturns.reduce((sum, r) => sum + r.totalRefundAmount, 0).toLocaleString()} ج.م
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-neutral-300">
              <thead className="bg-surface-1 text-neutral-400 text-[11px] uppercase border-b border-neutral-800">
                <tr>
                  <th className="p-3.5">رقم إذن المرتجع</th>
                  <th className="p-3.5">الفاتورة الأصلية</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5">اسم الزبون / الورشة</th>
                  <th className="p-3.5">الأصناف المرتجعة</th>
                  <th className="p-3.5">طريقة الصرف</th>
                  <th className="p-3.5">المبلغ المصروف</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">حذف المرتجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-neutral-500">
                      لا توجد أذونات مرتجعات مبيعات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-surface-3 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-rose-400">
                        {ret.returnNumber}
                      </td>
                      <td className="p-3.5 font-mono text-white">
                        {ret.invoiceNumber}
                      </td>
                      <td className="p-3.5 font-mono text-neutral-400">
                        {ret.date} · {ret.time}
                      </td>
                      <td className="p-3.5 font-bold text-neutral-100">
                        {ret.customerName}
                      </td>
                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          {ret.items.map((it, idx) => (
                            <div key={idx} className="text-[11px] text-neutral-200">
                              {it.quantity} × {it.partName} ({it.unitPrice} ج.م)
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold text-[11px]">
                          {ret.refundMethod}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-black text-rose-400 text-sm">
                        -{ret.totalRefundAmount.toFixed(2)} ج.م
                      </td>
                      <td className="p-3.5">
                        {ret.isCorrected ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            مرتجع مصحح ✓
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[10px]">
                            أصلي
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        {onDeleteSalesReturn && (
                          <button
                            onClick={() => onDeleteSalesReturn(ret.id)}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 transition-colors"
                            title="حذف هذا المرتجع وإعادة المبلغ للخزينة والكمية للمخزن"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SALES RETURN MODAL */}
      {returnInvoice && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setReturnInvoice(null)}
        >
          <div 
            className="w-full max-w-2xl bg-surface-2 text-white rounded-3xl p-6 shadow-2xl border border-neutral-800 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {isCorrectedReturn ? 'تسجيل مرتجع مبيعات مصحح' : 'إجراء مرتجع مبيعات (رد بضاعة)'}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    فاتورة رقم: <span className="font-mono text-amber-400 font-bold">{returnInvoice.invoiceNumber}</span> · الزبون: <span className="text-white font-bold">{returnInvoice.customerName}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setReturnInvoice(null)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
              <span>
                عند تأكيد المرتجع: سيتم <strong>إرجاع الكمية فوراً إلى رصيد المخزن</strong>، و<strong>تخصيم القيمة المستردة من الخزينة</strong> في حال الصرف النقدي.
              </span>
            </div>

            <form onSubmit={handleConfirmReturn} className="space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-bold text-neutral-300 block">حدد القطع والكميات المراد إرجاعها:</span>
                <div className="border border-neutral-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-surface-1 text-neutral-400 text-[11px] border-b border-neutral-800">
                      <tr>
                        <th className="p-2.5">الصنف</th>
                        <th className="p-2.5 text-center">الكمية المباعة</th>
                        <th className="p-2.5 text-center">سعر البيع بالفاتورة</th>
                        <th className="p-2.5 text-center">كمية المرتجع</th>
                        <th className="p-2.5 text-left">قيمة المرتجع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {returnInvoice.items.map((it, idx) => {
                        const rowKey = String(idx);
                        const maxReturnable = Math.max(0, it.quantity - (it.returnedQuantity || 0));
                        const currentReturnQty = returnItems[rowKey] || 0;
                        const itemSubtotal = currentReturnQty * it.unitPrice;
                        return (
                          <tr key={rowKey} className="hover:bg-surface-3">
                            <td className="p-2.5">
                              <span className="font-bold text-white block">{it.partName}</span>
                              <span className="font-mono text-[10px] text-amber-400">{it.partNumber}</span>
                            </td>
                            <td className="p-2.5 text-center font-mono">
                              {it.quantity}
                              {(it.returnedQuantity || 0) > 0 && (
                                <span className="block text-[10px] text-rose-400">مرتجع سابقاً: {it.returnedQuantity}</span>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-emerald-400">
                              {it.unitPrice} ج.م
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setReturnItems(prev => ({
                                    ...prev,
                                    [rowKey]: Math.max(0, (prev[rowKey] || 0) - 1)
                                  }))}
                                  className="w-6 h-6 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max={maxReturnable}
                                  value={currentReturnQty}
                                  onChange={(e) => {
                                    const val = Math.min(maxReturnable, Math.max(0, parseInt(e.target.value) || 0));
                                    setReturnItems(prev => ({ ...prev, [rowKey]: val }));
                                  }}
                                  className="w-14 h-7 text-center rounded bg-surface-1 border border-neutral-700 text-white font-mono text-xs font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => setReturnItems(prev => ({
                                    ...prev,
                                    [rowKey]: Math.min(maxReturnable, (prev[rowKey] || 0) + 1)
                                  }))}
                                  className="w-6 h-6 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-2.5 text-left font-mono font-black text-rose-400">
                              {itemSubtotal.toFixed(2)} ج.م
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-neutral-300 block">طريقة رد المبلغ للزبون:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'نقدي (خصم من الخزنة)', label: 'نقدي من الخزنة', desc: 'يتم تخصيمها من الخزينة تلقائياً', icon: Banknote },
                    { id: 'خصم من رصيد العميل الآجل', label: 'خصم من حساب الآجل', desc: 'تخفيض ديون الورشة / العميل', icon: Clock },
                    { id: 'إنستاباي / محفظة', label: 'إنستاباي / فودافون كاش', desc: 'خصم من الرصيد الإلكتروني', icon: Zap },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = refundMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRefundMethod(m.id as any)}
                        className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-rose-500/20 border-rose-500 text-white shadow-md'
                            : 'bg-surface-1 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-bold text-white">{m.label}</span>
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-rose-400' : 'text-neutral-500'}`} />
                        </div>
                        <span className="text-[10px] text-neutral-400">{m.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">سبب المرتجع:</label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-xs text-white focus:outline-none focus:border-rose-400"
                  >
                    <option value="عيب في الصنف / تلف">عيب في الصنف / تلف مصنعي</option>
                    <option value="عدم مطابقة لموديل السيارة">عدم مطابقة لموديل السيارة</option>
                    <option value="الزبون ألغى الصيانة">الزبون ألغى الصيانة بالورشة</option>
                    <option value="شراء صنف بالخطأ">شراء صنف بالخطأ</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">ملاحظات إضافية:</label>
                  <input
                    type="text"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="ملاحظات فنية أو إذن المستودع..."
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-400"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface-1 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-neutral-400 block">إجمالي قيمة المرتجع المسترد:</span>
                  <span className="text-2xl font-black text-rose-400 font-mono">
                    {calculatedReturnTotal.toFixed(2)} ج.م
                  </span>
                  {refundMethod === 'نقدي (خصم من الخزنة)' && (
                    <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                      ✓ سيتم إصدار إذن صرف فوري وتخصيمها من الخزينة
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnInvoice(null)}
                    className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={calculatedReturnTotal <= 0}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-[#ffffff] text-xs font-black shadow-lg shadow-rose-600/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد المرتجع والخصم من الخزنة</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" onClick={() => !voidBusy && setVoidTarget(null)}>
          <div className="w-full max-w-md bg-surface-2 rounded-3xl p-5 border border-rose-500/30 shadow-2xl space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white">إلغاء الفاتورة {voidTarget.invoiceNumber}</h3>
              <button onClick={() => setVoidTarget(null)} className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 leading-relaxed">
              سيتم إرجاع الكميات للمخزن، ورد المبلغ المدفوع من الخزنة (كل طريقة من حسابها)، وتخفيض مديونية العميل إن كانت آجلة. الفاتورة تبقى في السجل بحالة «ملغاة» ولا تُحذف.
              <div className="mt-1 font-mono font-bold">الإجمالي: {voidTarget.grandTotal.toFixed(2)} ج.م{(voidTarget.returnedAmount || 0) > 0 ? ` — منه مرتجع سابقاً ${(voidTarget.returnedAmount || 0).toFixed(2)}` : ''}</div>
            </div>

            <label className="block text-neutral-300 font-bold">سبب الإلغاء (إلزامي):</label>
            <select value={voidReasonChoice} onChange={(e) => setVoidReasonChoice(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white">
              {VOID_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              value={voidReasonText}
              onChange={(e) => setVoidReasonText(e.target.value)}
              placeholder={voidReasonChoice === 'أخرى' ? 'اكتب السبب...' : 'تفاصيل إضافية (اختياري)'}
              className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
            />

            {isManager ? (
              <p className="text-emerald-400 font-bold">أنت مدير عام: سيُسجَّل الإلغاء باعتمادك ({currentUserName}).</p>
            ) : (
              <div className="space-y-2 p-3 rounded-2xl bg-surface-1 border border-neutral-700">
                <p className="text-amber-400 font-bold">موافقة المدير مطلوبة — اطلب من المدير إدخال بياناته:</p>
                <input value={mgrUser} onChange={(e) => setMgrUser(e.target.value)} placeholder="اسم مستخدم المدير" autoComplete="off"
                  className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-white font-mono" />
                <input type="password" value={mgrPass} onChange={(e) => setMgrPass(e.target.value)} placeholder="كلمة مرور المدير" autoComplete="new-password"
                  className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-white font-mono" />
              </div>
            )}

            {voidError && <div role="alert" className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 font-bold">{voidError}</div>}

            <div className="flex gap-2 pt-1">
              <button onClick={confirmVoid} disabled={voidBusy} className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black disabled:opacity-50">
                {voidBusy ? 'جارٍ التنفيذ...' : 'تأكيد الإلغاء'}
              </button>
              <button onClick={() => setVoidTarget(null)} disabled={voidBusy} className="px-4 h-11 rounded-xl bg-neutral-800 text-neutral-300 font-bold">تراجع</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
