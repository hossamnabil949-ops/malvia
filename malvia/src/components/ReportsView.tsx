import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Boxes, 
  Truck, 
  Wrench, 
  Receipt, 
  CheckCircle2, 
  Filter, 
  Sparkles,
  Layers,
  Banknote,
  Users,
  Search,
  Eye,
  FileText,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  Invoice, 
  PurchaseInvoice, 
  AutoPart, 
  Supplier, 
  Customer, 
  TreasuryTransaction, 
  Expense,
  Partner,
  SalesReturn,
  PurchaseReturn
} from '../types/autoParts';

interface ReportsViewProps {
  invoices: Invoice[];
  purchaseInvoices: PurchaseInvoice[];
  salesReturns?: SalesReturn[];
  purchaseReturns?: PurchaseReturn[];
  parts: AutoPart[];
  suppliers: Supplier[];
  customers: Customer[];
  treasuryTransactions: TreasuryTransaction[];
  expenses: Expense[];
  partners: Partner[];
  treasuryBalance: number;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  invoices,
  purchaseInvoices,
  salesReturns = [],
  purchaseReturns = [],
  parts,
  suppliers,
  customers,
  treasuryTransactions,
  expenses,
  partners,
  treasuryBalance,
}) => {
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month' | 'year'>('all');
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const isDateInFilter = (dateStr: string) => {
    if (dateFilter === 'all') return true;
    const now = new Date();
    const itemDate = new Date(dateStr);
    if (isNaN(itemDate.getTime())) return true;

    if (dateFilter === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      return dateStr === todayStr;
    }

    if (dateFilter === 'month') {
      return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
    }

    if (dateFilter === 'year') {
      return itemDate.getFullYear() === now.getFullYear();
    }

    return true;
  };

  const filteredSales = useMemo(() => invoices.filter(i => isDateInFilter(i.date)), [invoices, dateFilter]);
  const filteredPurchases = useMemo(() => purchaseInvoices.filter(i => isDateInFilter(i.date)), [purchaseInvoices, dateFilter]);
  const filteredSalesReturns = useMemo(() => salesReturns.filter(r => isDateInFilter(r.date)), [salesReturns, dateFilter]);
  const filteredPurchaseReturns = useMemo(() => purchaseReturns.filter(r => isDateInFilter(r.date)), [purchaseReturns, dateFilter]);
  const filteredTreasury = useMemo(() => treasuryTransactions.filter(t => isDateInFilter(t.date)), [treasuryTransactions, dateFilter]);
  const filteredExpenses = useMemo(() => expenses.filter(e => isDateInFilter(e.date)), [expenses, dateFilter]);

  const totalSalesVal = useMemo(() => filteredSales.reduce((acc, i) => acc + i.grandTotal, 0), [filteredSales]);
  const totalPurchasesVal = useMemo(() => filteredPurchases.reduce((acc, i) => acc + i.grandTotal, 0), [filteredPurchases]);
  const totalInventoryCost = useMemo(() => parts.reduce((acc, p) => acc + (p.stockQuantity * p.costPrice), 0), [parts]);
  const totalSuppliersDebts = useMemo(() => suppliers.reduce((acc, s) => acc + s.balance, 0), [suppliers]);
  const totalCustomersCredits = useMemo(() => customers.reduce((acc, c) => acc + c.balance, 0), [customers]);
  const totalSalesReturnsVal = useMemo(() => filteredSalesReturns.reduce((acc, r) => acc + r.totalRefundAmount, 0), [filteredSalesReturns]);

  const exportSalesReport = () => {
    setDownloadingReport('sales');
    const data = filteredSales.map((inv, idx) => ({
      'م': idx + 1,
      'رقم الفاتورة': inv.invoiceNumber,
      'التاريخ': inv.date,
      'الوقت': inv.time,
      'اسم الزبون / الورشة': inv.customerName,
      'رقم الهاتف': inv.customerPhone || '-',
      'نوع العميل': inv.customerType,
      'بيانات السيارة': inv.carDetails || '-',
      'عدد الأصناف': inv.items.length,
      'المجموع قبل الضريبة (ج.م)': inv.subtotal,
      'الضريبة (14%)': inv.tax,
      'الخصم': inv.discount,
      'الإجمالي النهائي': inv.grandTotal,
      'حالة الفاتورة': inv.status || 'مسددة',
      'المرتجع (ج.م)': inv.returnedAmount || 0,
      'طريقة الدفع': inv.paymentMethod,
      'الكاشير المسؤول': inv.cashierName
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير المبيعات والفواتير');
    XLSX.writeFile(wb, `MALVIA_Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 800);
  };

  const exportPurchasesReport = () => {
    setDownloadingReport('purchases');
    const data = filteredPurchases.map((inv, idx) => ({
      'م': idx + 1,
      'رقم فاتورة المشتريات': inv.invoiceNumber,
      'رقم فاتورة المورد': inv.supplierInvoiceNumber || '-',
      'التاريخ': inv.date,
      'المورد / التاجر': inv.supplierName,
      'عدد الأصناف': inv.items.length,
      'المجموع (ج.م)': inv.subtotal,
      'الضريبة': inv.tax,
      'الخصم': inv.discount,
      'إجمالي الفاتورة الصافي': inv.grandTotal,
      'القيمة الأصلية قبل المرتجع': inv.originalGrandTotal || inv.grandTotal,
      'المرتجع المحسوم': inv.returnedAmount || 0,
      'المسدد نقداً من الخزنة': inv.amountPaid,
      'المتبقي آجل (المجدول للتاجر)': Math.max(0, inv.grandTotal - inv.amountPaid),
      'حالة السداد': inv.paymentStatus,
      'المستلم': inv.receivedBy
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير المشتريات والتوريد');
    XLSX.writeFile(wb, `MALVIA_Purchases_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 800);
  };

  const exportReturnsReport = () => {
    setDownloadingReport('returns');
    const wb = XLSX.utils.book_new();

    const salesReturnData = filteredSalesReturns.map((r, idx) => ({
      'م': idx + 1,
      'رقم إذن المرتجع': r.returnNumber,
      'رقم فاتورة البيع الأصلية': r.invoiceNumber,
      'التاريخ والوقت': `${r.date} ${r.time}`,
      'اسم الزبون / الورشة': r.customerName,
      'عدد الأصناف المرتجعة': r.items.length,
      'إجمالي المبلغ المسترد (ج.م)': r.totalRefundAmount,
      'طريقة الرد': r.refundMethod,
      'تم الخصم من الخزينة': r.treasuryDeducted ? 'نعم - خصم فوري' : 'لا (تعديل آجل)',
      'السبب والملاحظات': r.notes || '-',
      'المسجل': r.recordedBy
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesReturnData), 'مرتجعات المبيعات (الخزنة)');

    const purchaseReturnData = filteredPurchaseReturns.map((pr, idx) => ({
      'م': idx + 1,
      'رقم إذن مرتجع الشراء': pr.returnNumber,
      'رقم فاتورة المشتريات': pr.purchaseInvoiceNumber,
      'التاريخ والوقت': `${pr.date} ${pr.time}`,
      'المورد / التاجر': pr.supplierName,
      'إجمالي قيمة المرتجع (ج.م)': pr.totalReturnAmount,
      'الديون غير المسددة قبل المرتجع': pr.unpaidDebtBeforeReturn,
      'التخفيض المجدول من الديون': pr.rescheduledDebtReduction,
      'الديون غير المسددة بعد الجدولة': pr.unpaidDebtAfterReturn,
      'استرداد نقدي للخزنة (إن وجد)': pr.cashRefundToTreasury,
      'السبب والملاحظات': pr.notes || '-',
      'المسجل': pr.recordedBy
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseReturnData), 'مرتجعات المشتريات (الجدولة)');

    XLSX.writeFile(wb, `MALVIA_Returns_and_Adjustments_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 800);
  };

  const exportTreasuryReport = () => {
    setDownloadingReport('treasury');
    const data = filteredTreasury.map((t, idx) => ({
      'م': idx + 1,
      'رقم السند': t.txNumber,
      'التاريخ': t.date,
      'الوقت': t.time,
      'نوع الحركة': t.type === 'قبض' ? 'قبض (إيداع)' : 'صرف (خروج نقدية)',
      'تصنيف الحركة': t.category,
      'المبلغ (ج.م)': t.amount,
      'طريقة الدفع': t.paymentMethod,
      'الرصيد التراكمي بعد الحركة': t.balanceAfter,
      'البيان': t.description,
      'المسجل': t.recordedBy
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير حركة الخزنة والنقدية');
    XLSX.writeFile(wb, `MALVIA_Treasury_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 800);
  };

  const exportInventoryReport = () => {
    setDownloadingReport('inventory');
    const data = parts.map((p, idx) => ({
      'م': idx + 1,
      'رقم القطعة OEM': p.partNumber,
      'اسم القطعة': p.name,
      'الماركة': p.brand,
      'السيارات المتوافقة': p.compatibleModels,
      'القسم': p.category,
      'المنشأ / الجودة': p.origin,
      'مكان الرف بالمخزن': p.shelfLocation,
      'الكمية المتوفرة': p.stockQuantity,
      'حد التنبيه الأدنى': p.minAlertStock,
      'حالة المخزون': p.stockQuantity <= 0 ? 'منتهي' : (p.stockQuantity <= p.minAlertStock ? 'حرج' : 'متوفر'),
      'سعر الشراء / التكلفة (ج.م)': p.costPrice,
      'سعر البيع قطاعي (ج.م)': p.salePrice,
      'إجمالي قيمة المخزون بالتكلفة': p.stockQuantity * p.costPrice,
      'إجمالي القيمة البيعية المتوقعة': p.stockQuantity * p.salePrice
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'جرد المخزون وتقييم البضاعة');
    XLSX.writeFile(wb, `MALVIA_Inventory_Audit_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 800);
  };

  const exportAccountsReport = () => {
    setDownloadingReport('accounts');
    const supData = suppliers.map((s, idx) => ({
      'م': idx + 1,
      'الطرف': 'مورد بضاعة',
      'الكود': s.code,
      'الاسم': s.name,
      'التصنيف': s.category,
      'رقم الهاتف': s.phone,
      'إجمالي التعاملات (ج.م)': s.totalSupplied,
      'المسدد': s.totalPaid,
      'الرصيد المستحق له (دائن)': s.balance,
      'الرصيد المستحق عليه (مدين)': 0
    }));

    const custData = customers.map((c, idx) => ({
      'م': idx + 1,
      'الطرف': c.type,
      'الكود': c.id,
      'الاسم': c.name,
      'التصنيف': 'عميل / ورشة',
      'رقم الهاتف': c.phone,
      'إجمالي التعاملات (ج.م)': c.totalPurchases,
      'المسدد': c.totalPurchases - c.balance,
      'الرصيد المستحق له (دائن)': 0,
      'الرصيد المستحق عليه (مدين)': c.balance
    }));

    const combined = [...supData, ...custData];
    const ws = XLSX.utils.json_to_sheet(combined);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف حسابات الموردين والورش');
    XLSX.writeFile(wb, `MALVIA_Accounts_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 800);
  };

  const exportMasterBook = () => {
    setDownloadingReport('master');
    const wb = XLSX.utils.book_new();

    const salesData = filteredSales.map((inv, idx) => ({
      'م': idx + 1,
      'رقم الفاتورة': inv.invoiceNumber,
      'التاريخ': inv.date,
      'اسم الزبون': inv.customerName,
      'الإجمالي': inv.grandTotal,
      'حالة الفاتورة': inv.status || 'مسددة',
      'المرتجع': inv.returnedAmount || 0,
      'الدفع': inv.paymentMethod
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'فواتير المبيعات');

    if (filteredSalesReturns.length > 0) {
      const sRetData = filteredSalesReturns.map((r, idx) => ({
        'م': idx + 1,
        'رقم المرتجع': r.returnNumber,
        'الفاتورة': r.invoiceNumber,
        'الزبون': r.customerName,
        'المبلغ المسترد': r.totalRefundAmount,
        'طريقة الرد': r.refundMethod,
        'مخصوم من الخزنة': r.treasuryDeducted ? 'نعم' : 'لا'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sRetData), 'مرتجعات المبيعات');
    }

    const purData = filteredPurchases.map((inv, idx) => ({
      'م': idx + 1,
      'رقم الفاتورة': inv.invoiceNumber,
      'المورد': inv.supplierName,
      'التاريخ': inv.date,
      'الإجمالي الصافي': inv.grandTotal,
      'المسدد': inv.amountPaid,
      'المتبقي المجدول': Math.max(0, inv.grandTotal - inv.amountPaid)
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purData), 'فواتير المشتريات');

    const trData = filteredTreasury.map((t, idx) => ({
      'م': idx + 1,
      'رقم السند': t.txNumber,
      'التاريخ': t.date,
      'النوع': t.type,
      'التصنيف': t.category,
      'المبلغ': t.amount,
      'الرصيد بعد': t.balanceAfter,
      'البيان': t.description
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trData), 'حركة الخزينة');

    const invData = parts.map((p, idx) => ({
      'م': idx + 1,
      'القطعة': p.name,
      'OEM': p.partNumber,
      'الماركة': p.brand,
      'الكمية': p.stockQuantity,
      'التكلفة': p.costPrice,
      'البيع': p.salePrice,
      'إجمالي التكلفة': p.stockQuantity * p.costPrice
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invData), 'جرد المخزون');

    const supData = suppliers.map((s, idx) => ({
      'الكود': s.code,
      'المورد': s.name,
      'الهاتف': s.phone,
      'إجمالي التوريدات': s.totalSupplied,
      'المسدد': s.totalPaid,
      'الرصيد المستحق': s.balance
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supData), 'حسابات الموردين');

    XLSX.writeFile(wb, `MALVIA_Master_ERP_Book_${new Date().toISOString().split('T')[0]}.xlsx`);
    setTimeout(() => setDownloadingReport(null), 1000);
  };

  const reportCards = [
    {
      id: 'sales',
      title: 'تقرير المبيعات وفواتير البيع (Sales Report)',
      desc: 'سجل الفواتير الصادرة للعملاء والورش، الضرائب، الخصومات، وطرق الدفع',
      stats: `${filteredSales.length} فاتورة بيع | ${totalSalesVal.toLocaleString()} ج.م`,
      icon: Receipt,
      action: exportSalesReport,
      color: 'from-amber-500/20 to-amber-500/20',
      border: 'border-amber-500/40',
      btnColor: 'bg-amber-500 hover:bg-amber-400 text-neutral-950',
    },
    {
      id: 'purchases',
      title: 'تقرير فواتير المشتريات والتوريد (Purchases Report)',
      desc: 'بضائع الموردين المستلمة، التكلفة، المسدد من الخزينة، والمتبقي آجل مجدول',
      stats: `${filteredPurchases.length} فاتورة شراء | ${totalPurchasesVal.toLocaleString()} ج.م`,
      icon: Truck,
      action: exportPurchasesReport,
      color: 'from-amber-500/20 to-amber-500/20',
      border: 'border-amber-500/40',
      btnColor: 'bg-amber-500 hover:bg-amber-400 text-[#ffffff]',
    },
    {
      id: 'returns',
      title: 'تقرير المرتجعات النقدية وتعديل الدفعات (Returns & Refunds)',
      desc: 'مرتجعات المبيعات المصروفة من الخزنة ومرتجعات المشتريات وجدولة المتبقي وحذفها',
      stats: `${filteredSalesReturns.length} مرتجع بيع (${totalSalesReturnsVal.toLocaleString()} ج.م) | ${filteredPurchaseReturns.length} مرتجع شراء`,
      icon: RotateCcw,
      action: exportReturnsReport,
      color: 'from-rose-500/20 to-amber-500/20',
      border: 'border-rose-500/40',
      btnColor: 'bg-rose-500 hover:bg-rose-400 text-[#ffffff]',
    },
    {
      id: 'treasury',
      title: 'تقرير حركة الخزنة وسندات القبض والصرف (Treasury)',
      desc: 'كشف حساب الخزينة ودرج النقدية، تدفقات الكاش الداخلة والخارجة والرصيد الفعلي',
      stats: `${filteredTreasury.length} حركة مسجلة | الرصيد الحالي: ${treasuryBalance.toLocaleString()} ج.م`,
      icon: Banknote,
      action: exportTreasuryReport,
      color: 'from-emerald-500/20 to-amber-500/20',
      border: 'border-emerald-500/40',
      btnColor: 'bg-emerald-500 hover:bg-emerald-400 text-[#ffffff]',
    },
    {
      id: 'inventory',
      title: 'تقرير جرد المخزون وتقييم البضاعة (Inventory Audit)',
      desc: 'الأصناف، أرقام OEM، أماكن الرفوف، النواقص، وقيمة المخزن بالتكلفة والبيع',
      stats: `${parts.length} صنف | تقييم التكلفة: ${totalInventoryCost.toLocaleString()} ج.م`,
      icon: Boxes,
      action: exportInventoryReport,
      color: 'from-amber-500/20 to-amber-500/20',
      border: 'border-amber-500/40',
      btnColor: 'bg-amber-500 hover:bg-amber-400 text-[#ffffff]',
    },
    {
      id: 'accounts',
      title: 'تقرير كشوف حساب الموردين والورش (Ledgers)',
      desc: 'الديون المستحقة للموردين، والذمم المدينة للورش والعملاء وتواريخ السداد',
      stats: `مستحقات موردين: ${totalSuppliersDebts.toLocaleString()} ج.م | ديون ورش: ${totalCustomersCredits.toLocaleString()} ج.م`,
      icon: Wrench,
      action: exportAccountsReport,
      color: 'from-amber-500/20 to-amber-500/20',
      border: 'border-amber-500/40',
      btnColor: 'bg-amber-500 hover:bg-amber-400 text-neutral-950',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-surface-2 via-surface-2 to-surface-2 p-5 rounded-3xl border border-neutral-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">مركز التقارير وتصدير إكسيل (Excel Export)</h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                .XLSX & CSV UTF-8
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              استخراج تقارير مالية وجردية دقيقة بضغطة زر واحدة متوافقة مع Excel باللغة العربية
            </p>
          </div>
        </div>

        <button
          onClick={exportMasterBook}
          disabled={downloadingReport === 'master'}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-amber-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-950 font-black text-xs shadow-xl shadow-emerald-500/20 transition-all active:scale-95 group"
        >
          <FileSpreadsheet className="w-4 h-4 text-neutral-950 group-hover:scale-110 transition-transform" />
          <span>{downloadingReport === 'master' ? 'جاري تجهيز المصنف...' : 'تحميل المصنف المحاسبي الشامل (All-in-One)'}</span>
        </button>
      </div>

      <div className="flex items-center justify-between bg-surface-2 p-3 rounded-2xl border border-neutral-800">
        <div className="flex items-center gap-2 text-xs text-neutral-300">
          <Filter className="w-4 h-4 text-amber-400" />
          <span className="font-bold">تصفية الفترة الزمنية للتقارير:</span>
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'كافة الفترات' },
            { id: 'today', label: 'اليوم فقط' },
            { id: 'month', label: 'هذا الشهر' },
            { id: 'year', label: 'السنة المالية 2026' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                dateFilter === f.id
                  ? 'bg-amber-500 text-neutral-950 font-black shadow-md'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {reportCards.map((rc) => {
          const Icon = rc.icon;
          const isDownloading = downloadingReport === rc.id;
          return (
            <div
              key={rc.id}
              className={`bg-surface-2 border ${rc.border} rounded-3xl p-5 flex flex-col justify-between shadow-lg hover:shadow-xl transition-all group relative overflow-hidden`}
            >
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${rc.color} rounded-full blur-3xl -z-0 pointer-events-none`} />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-neutral-900 border border-neutral-700/80 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                    EXCEL .XLSX
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white mb-1">{rc.title}</h3>
                <p className="text-xs text-neutral-400 mb-4">{rc.desc}</p>
                <div className="p-2.5 rounded-xl bg-surface-1 border border-neutral-800 text-[11px] text-neutral-300 font-mono mb-4">
                  {rc.stats}
                </div>
              </div>

              <div className="relative z-10 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">تصدير فوري</span>
                <button
                  onClick={rc.action}
                  disabled={isDownloading}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md ${rc.btnColor}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloading ? 'جاري التحميل...' : 'تحميل إكسيل'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
