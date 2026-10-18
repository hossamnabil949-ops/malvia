import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Truck, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Banknote, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  X, 
  Printer, 
  FileSpreadsheet, 
  Eye, 
  Sparkles,
  Boxes,
  ArrowRight,
  RotateCcw,
  Edit3,
  Undo2,
  ArrowUpRight,
  ArrowDownLeft,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  PurchaseInvoice, 
  PurchaseInvoiceItem, 
  PurchaseReturn,
  PurchaseReturnItem,
  Supplier, 
  AutoPart, 
  PaymentMethod, 
  PartCategory 
} from '../types/autoParts';
import { PART_CATEGORIES } from '../data/autoPartsData';

interface PurchasesViewProps {
  purchaseInvoices: PurchaseInvoice[];
  purchaseReturns: PurchaseReturn[];
  suppliers: Supplier[];
  parts: AutoPart[];
  treasuryBalance: number;
  onAddPurchaseInvoice: (invoice: PurchaseInvoice) => void;
  onEditPurchaseInvoice?: (invoice: PurchaseInvoice) => void;
  onPurchaseReturn: (returnData: PurchaseReturn) => void;
  onDeletePurchaseReturn?: (returnId: string) => void;
  onAddNewPart?: (part: AutoPart) => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  purchaseInvoices,
  purchaseReturns,
  suppliers,
  parts,
  treasuryBalance,
  onAddPurchaseInvoice,
  onEditPurchaseInvoice,
  onPurchaseReturn,
  onDeletePurchaseReturn,
  onAddNewPart,
}) => {
  const [currentTab, setCurrentTab] = useState<'invoices' | 'returns'>('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<PurchaseInvoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Return modal state
  const [returnPurchaseInvoice, setReturnPurchaseInvoice] = useState<PurchaseInvoice | null>(null);
  const [returnItems, setReturnItems] = useState<{ [key: string]: number }>({});
  const [returnReason, setReturnReason] = useState('بضاعة معيبة / غير مطابقة للمواصفات');
  const [excessSettlementOption, setExcessSettlementOption] = useState<'treasury_cash' | 'supplier_credit'>('treasury_cash');
  const [returnNotes, setReturnNotes] = useState('');

  // New Invoice Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentStatus, setPaymentStatus] = useState<'مدفوعة نقداً' | 'آجل' | 'مسددة جزئياً'>('مدفوعة نقداً');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | string>('كاش (نقدي)');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(14);
  const [notes, setNotes] = useState<string>('');
  const [receivedBy, setReceivedBy] = useState<string>('أمين المخزن');

  const [invoiceItems, setInvoiceItems] = useState<PurchaseInvoiceItem[]>([
    {
      partNumber: '',
      partName: '',
      category: 'فرامل ومكابح',
      quantity: 10,
      costPrice: 250,
      salePrice: 380,
      total: 2500
    }
  ]);

  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId) || suppliers[0];
  }, [suppliers, selectedSupplierId]);

  const subtotal = useMemo(() => {
    return invoiceItems.reduce((acc, it) => acc + (it.quantity * it.costPrice), 0);
  }, [invoiceItems]);

  const taxAmount = useMemo(() => {
    return Math.round((subtotal - discount) * (taxPercent / 100));
  }, [subtotal, discount, taxPercent]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discount + taxAmount);
  }, [subtotal, discount, taxAmount]);

  const handlePaymentStatusChange = (status: 'مدفوعة نقداً' | 'آجل' | 'مسددة جزئياً') => {
    setPaymentStatus(status);
    if (status === 'مدفوعة نقداً') {
      setAmountPaid(grandTotal);
    } else if (status === 'آجل') {
      setAmountPaid(0);
    } else {
      setAmountPaid(Math.round(grandTotal / 2));
    }
  };

  const handleItemChange = (index: number, field: keyof PurchaseInvoiceItem, value: any) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'costPrice') {
        const qty = field === 'quantity' ? Number(value) : item.quantity;
        const cost = field === 'costPrice' ? Number(value) : item.costPrice;
        item.total = Math.round(qty * cost);
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleSelectExistingPart = (index: number, partNumber: string) => {
    const existing = parts.find(p => p.partNumber === partNumber || p.id === partNumber);
    if (!existing) return;

    setInvoiceItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        partId: existing.id,
        partNumber: existing.partNumber,
        partName: existing.name,
        category: existing.category,
        costPrice: existing.costPrice,
        salePrice: existing.salePrice,
        total: Math.round(updated[index].quantity * existing.costPrice)
      };
      return updated;
    });
  };

  const handleAddItemRow = () => {
    setInvoiceItems(prev => [
      ...prev,
      {
        partNumber: '',
        partName: '',
        category: 'فرامل ومكابح',
        quantity: 5,
        costPrice: 200,
        salePrice: 320,
        total: 1000
      }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (invoiceItems.length === 1) return;
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || invoiceItems.length === 0) return;

    const validItems = invoiceItems.filter(it => it.partName.trim() && it.quantity > 0);
    if (validItems.length === 0) return;

    const finalAmountPaid = paymentStatus === 'مدفوعة نقداً' ? grandTotal : (paymentStatus === 'آجل' ? 0 : amountPaid);

    const newInvoice: PurchaseInvoice = {
      id: `pur-${Date.now()}`,
      invoiceNumber: `PUR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
      date: invoiceDate,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      items: validItems,
      subtotal,
      tax: taxAmount,
      discount,
      grandTotal,
      originalGrandTotal: grandTotal,
      paymentStatus,
      amountPaid: finalAmountPaid,
      remainingBalance: Math.max(0, grandTotal - finalAmountPaid),
      paymentMethod,
      notes: notes.trim() || undefined,
      receivedBy,
    };

    onAddPurchaseInvoice(newInvoice);
    setShowCreateModal(false);

    setSupplierInvoiceNumber('');
    setInvoiceItems([
      {
        partNumber: '',
        partName: '',
        category: 'فرامل ومكابح',
        quantity: 10,
        costPrice: 250,
        salePrice: 380,
        total: 2500
      }
    ]);
    setNotes('');
  };

  const handleOpenReturnModal = (inv: PurchaseInvoice) => {
    setReturnPurchaseInvoice(inv);
    const initialQtys: { [key: string]: number } = {};
    inv.items.forEach(it => {
      initialQtys[it.partNumber] = 0;
    });
    setReturnItems(initialQtys);
    setReturnNotes('');
  };

  const returnCalculation = useMemo(() => {
    if (!returnPurchaseInvoice) {
      return { totalReturnAmount: 0, unpaidBefore: 0, debtReduction: 0, unpaidAfter: 0, excessCash: 0, newGrandTotal: 0 };
    }

    const totalReturnAmount = returnPurchaseInvoice.items.reduce((acc, it) => {
      const qty = returnItems[it.partNumber] || 0;
      return acc + (qty * it.costPrice);
    }, 0);

    const unpaidBefore = Math.max(0, returnPurchaseInvoice.grandTotal - returnPurchaseInvoice.amountPaid);
    const debtReduction = Math.min(unpaidBefore, totalReturnAmount);
    const unpaidAfter = unpaidBefore - debtReduction;
    const excessCash = totalReturnAmount > unpaidBefore ? totalReturnAmount - unpaidBefore : 0;
    const newGrandTotal = Math.max(0, returnPurchaseInvoice.grandTotal - totalReturnAmount);

    return { totalReturnAmount, unpaidBefore, debtReduction, unpaidAfter, excessCash, newGrandTotal };
  }, [returnPurchaseInvoice, returnItems]);

  const handleConfirmPurchaseReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnPurchaseInvoice || returnCalculation.totalReturnAmount <= 0) return;

    const returnedItemsList: PurchaseReturnItem[] = returnPurchaseInvoice.items
      .filter(it => (returnItems[it.partNumber] || 0) > 0)
      .map(it => ({
        partNumber: it.partNumber,
        partName: it.partName,
        quantity: returnItems[it.partNumber],
        unitCost: it.costPrice,
        total: returnItems[it.partNumber] * it.costPrice,
        reason: returnReason,
      }));

    if (returnedItemsList.length === 0) return;

    const returnRecord: PurchaseReturn = {
      id: `pret-${Date.now()}`,
      returnNumber: `RET-PUR-${Math.floor(1000 + Math.random() * 9000)}`,
      purchaseInvoiceId: returnPurchaseInvoice.id,
      purchaseInvoiceNumber: returnPurchaseInvoice.invoiceNumber,
      supplierId: returnPurchaseInvoice.supplierId,
      supplierName: returnPurchaseInvoice.supplierName,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      items: returnedItemsList,
      totalReturnAmount: returnCalculation.totalReturnAmount,
      unpaidDebtBeforeReturn: returnCalculation.unpaidBefore,
      unpaidDebtAfterReturn: returnCalculation.unpaidAfter,
      rescheduledDebtReduction: returnCalculation.debtReduction,
      cashRefundToTreasury: excessSettlementOption === 'treasury_cash' ? returnCalculation.excessCash : 0,
      notes: `${returnReason} ${returnNotes ? ` - ${returnNotes}` : ''}`,
      recordedBy: 'مسؤول المشتريات',
    };

    onPurchaseReturn(returnRecord);
    setReturnPurchaseInvoice(null);
  };

  const filteredInvoices = useMemo(() => {
    return purchaseInvoices.filter(inv => {
      const matchesSearch = 
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.supplierInvoiceNumber && inv.supplierInvoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || inv.paymentStatus === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [purchaseInvoices, searchQuery, filterStatus]);

  const filteredReturns = useMemo(() => {
    return purchaseReturns.filter(ret => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          ret.returnNumber.toLowerCase().includes(q) ||
          ret.purchaseInvoiceNumber.toLowerCase().includes(q) ||
          ret.supplierName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [purchaseReturns, searchQuery]);

  const totalPurchasesAmount = useMemo(() => {
    return purchaseInvoices.reduce((acc, i) => acc + i.grandTotal, 0);
  }, [purchaseInvoices]);

  const totalCashPaidFromTreasury = useMemo(() => {
    return purchaseInvoices.reduce((acc, i) => acc + i.amountPaid, 0);
  }, [purchaseInvoices]);

  const totalCreditRemaining = useMemo(() => {
    return purchaseInvoices.reduce((acc, i) => acc + Math.max(0, i.grandTotal - i.amountPaid), 0);
  }, [purchaseInvoices]);

  const totalPurchaseReturnsAmount = useMemo(() => {
    return purchaseReturns.reduce((acc, r) => acc + r.totalReturnAmount, 0);
  }, [purchaseReturns]);

  const handleExportPurchasesExcel = () => {
    const data = purchaseInvoices.map((inv, idx) => ({
      'م': idx + 1,
      'رقم فاتورة المشتريات': inv.invoiceNumber,
      'رقم فاتورة المورد': inv.supplierInvoiceNumber || '-',
      'تاريخ الفاتورة': inv.date,
      'اسم المورد / التاجر': inv.supplierName,
      'عدد الأصناف': inv.items.length,
      'المجموع الفرعي (ج.م)': inv.subtotal,
      'ضريبة القيمة المضافة': inv.tax,
      'الخصم': inv.discount,
      'إجمالي الفاتورة الحالي': inv.grandTotal,
      'القيمة الأصلية قبل المرتجع': inv.originalGrandTotal || inv.grandTotal,
      'إجمالي المرتجع للتاجر': inv.returnedAmount || 0,
      'حالة السداد': inv.paymentStatus,
      'المسدد نقداً من الخزينة': inv.amountPaid,
      'المتبقي آجل (المجدول للتاجر)': Math.max(0, inv.grandTotal - inv.amountPaid),
      'طريقة الدفع': inv.paymentMethod,
      'المستلم': inv.receivedBy
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'فواتير المشتريات والتوريد');
    XLSX.writeFile(wb, `MALVIA_Purchases_Invoices_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#151B2B] via-[#101420] to-[#151B2B] p-5 rounded-3xl border border-neutral-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">فواتير المشتريات والتوريد والمرتجعات</h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                تعديل أسعار الشراء وجدولة الدفعات
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              تسجيل بضائع التجار، تعديل أسعار الشراء، إجراء مرتجع مشتريات مع إعادة جدولة المتبقي وحذف المرتجعات
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="p-1 rounded-2xl bg-[#0E121B] border border-neutral-700 flex items-center gap-1">
            <button
              onClick={() => setCurrentTab('invoices')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentTab === 'invoices'
                  ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              فواتير المشتريات ({purchaseInvoices.length})
            </button>
            <button
              onClick={() => setCurrentTab('returns')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                currentTab === 'returns'
                  ? 'bg-rose-500 text-white font-black shadow-sm'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مرتجعات الموردين ({purchaseReturns.length})</span>
            </button>
          </div>

          <button
            onClick={handleExportPurchasesExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-500 text-neutral-200 hover:text-emerald-400 text-xs font-bold transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={() => {
              setShowCreateModal(true);
              setAmountPaid(grandTotal);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة مشتريات جديدة</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121622] border border-neutral-800 hover:border-blue-500/40 p-4 rounded-2xl shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-400">إجمالي المشتريات الصافية</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-blue-400 font-mono">
              {totalPurchasesAmount.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-neutral-400">ج.م</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">إجمالي التوريدات بعد خصم المرتجعات</p>
        </div>

        <div className="bg-[#121622] border border-neutral-800 hover:border-emerald-500/40 p-4 rounded-2xl shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-400">مسدد نقداً من الخزينة</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400 font-mono">
              {totalCashPaidFromTreasury.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-neutral-400">ج.م</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">مبالغ خرجت من الخزينة للموردين</p>
        </div>

        <div className="bg-[#121622] border border-neutral-800 hover:border-amber-500/40 p-4 rounded-2xl shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-400">دفعات آجلة متبقية (المجدولة)</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-400 font-mono">
              {totalCreditRemaining.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-neutral-400">ج.م</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">مبالغ مستحقة قيد السداد للموردين</p>
        </div>

        <div className="bg-[#121622] border border-neutral-800 hover:border-rose-500/40 p-4 rounded-2xl shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-400">إجمالي مرتجعات المشتريات</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-400 font-mono">
              {totalPurchaseReturnsAmount.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-neutral-400">ج.م</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">بضائع معادة خفضت الدفعات أو ردت كاش</p>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-[#141926] border border-neutral-800 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-grow w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={currentTab === 'invoices' 
              ? "ابحث برقم الفاتورة، اسم المورد/التاجر، أو رقم فاتورة المورد..." 
              : "ابحث برقم إذن مرتجع المشتريات، المورد، أو الفاتورة الأصلية..."}
            className="w-full h-11 pr-10 pl-4 rounded-xl bg-[#0E121B] border border-neutral-700 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-400"
          />
        </div>

        {currentTab === 'invoices' && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#0E121B] border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 h-11 focus:outline-none focus:border-amber-400 w-full sm:w-auto"
          >
            <option value="all">كافة حالات السداد</option>
            <option value="مدفوعة نقداً">مدفوعة نقداً</option>
            <option value="مسددة جزئياً">مسددة جزئياً</option>
            <option value="آجل">آجل (قيد السداد)</option>
            <option value="مرتجع جزئي">مرتجع جزئي</option>
          </select>
        )}
      </div>

      {currentTab === 'invoices' && (
        <div className="bg-[#141926] border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-neutral-300">
              <thead className="bg-[#0E121B] text-neutral-400 text-[11px] uppercase border-b border-neutral-800">
                <tr>
                  <th className="p-3.5">رقم الفاتورة</th>
                  <th className="p-3.5">فاتورة المورد</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5">المورد / الشركة</th>
                  <th className="p-3.5">الأصناف</th>
                  <th className="p-3.5">إجمالي الفاتورة</th>
                  <th className="p-3.5">المسدد نقداً</th>
                  <th className="p-3.5">المتبقي المجدول</th>
                  <th className="p-3.5">حالة الفاتورة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-neutral-500">
                      لا توجد فواتير مشتريات مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const remainingDebt = Math.max(0, inv.grandTotal - inv.amountPaid);
                    const hasReturn = (inv.returnedAmount || 0) > 0;

                    return (
                      <tr key={inv.id} className="hover:bg-[#1A2234] transition-colors">
                        <td className="p-3.5 font-mono font-bold text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3.5 font-mono text-neutral-400">
                          {inv.supplierInvoiceNumber || '—'}
                        </td>
                        <td className="p-3.5 font-mono text-neutral-400">
                          {inv.date} · {inv.time}
                        </td>
                        <td className="p-3.5 font-bold text-white">
                          {inv.supplierName}
                        </td>
                        <td className="p-3.5 font-mono text-neutral-300">
                          {inv.items.length} أصناف ({inv.items.reduce((s, it) => s + it.quantity, 0)} قطعة)
                        </td>
                        <td className="p-3.5 font-mono font-black text-white text-sm">
                          {inv.grandTotal.toLocaleString()} ج.م
                          {hasReturn && (
                            <span className="text-[10px] text-rose-400 block font-normal">
                              (خصم مرتجع: {inv.returnedAmount?.toLocaleString()} ج.م)
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-emerald-400 font-bold">
                          {inv.amountPaid.toLocaleString()} ج.م
                        </td>
                        <td className="p-3.5 font-mono">
                          {remainingDebt > 0 ? (
                            <span className="text-amber-400 font-bold">
                              {remainingDebt.toLocaleString()} ج.م
                            </span>
                          ) : (
                            <span className="text-neutral-500 font-normal">0 (خالص)</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {hasReturn ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                              مرتجع جزئي
                            </span>
                          ) : inv.paymentStatus === 'مدفوعة نقداً' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              مدفوعة نقداً
                            </span>
                          ) : inv.paymentStatus === 'مسددة جزئياً' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                              مسددة جزئياً
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                              آجل بالكامل
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenReturnModal(inv)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all flex items-center gap-1"
                              title="إجراء مرتجع مشتريات للمورد وتعديل الفاتورة وإعادة جدولة الدفعات"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                              <span>مرتجع</span>
                            </button>

                            <button
                              onClick={() => setSelectedInvoiceForModal(inv)}
                              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-200 transition-colors"
                              title="معاينة تفاصيل الفاتورة وأسعار الشراء"
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

      {currentTab === 'returns' && (
        <div className="bg-[#141926] border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 bg-rose-950/20 border-b border-rose-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-400" />
              <div>
                <h3 className="text-sm font-bold text-white">سجل مرتجعات المشتريات وإعادة جدولة الدفعات</h3>
                <p className="text-[11px] text-neutral-400">
                  كافة البضائع المعادة للتجار والتي خفضت قيمة الفواتير وأعادت جدولة الدفعات غير المسددة مع إمكانية حذف المرتجع
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-neutral-400 block">إجمالي قيمة المرتجعات</span>
              <span className="text-lg font-black text-rose-400 font-mono">
                {totalPurchaseReturnsAmount.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-neutral-300">
              <thead className="bg-[#0E121B] text-neutral-400 text-[11px] uppercase border-b border-neutral-800">
                <tr>
                  <th className="p-3.5">رقم إذن المرتجع</th>
                  <th className="p-3.5">فاتورة المشتريات</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5">المورد / التاجر</th>
                  <th className="p-3.5">الأصناف المعادة</th>
                  <th className="p-3.5">إجمالي قيمة المرتجع</th>
                  <th className="p-3.5">تخفيض الديون غير المسددة</th>
                  <th className="p-3.5">استرداد نقدي للخزنة</th>
                  <th className="p-3.5 text-center">حذف المرتجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-neutral-500">
                      لا توجد أذونات مرتجعات مشتريات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-[#1A2234] transition-colors">
                      <td className="p-3.5 font-mono font-bold text-rose-400">
                        {ret.returnNumber}
                      </td>
                      <td className="p-3.5 font-mono text-white">
                        {ret.purchaseInvoiceNumber}
                      </td>
                      <td className="p-3.5 font-mono text-neutral-400">
                        {ret.date} · {ret.time}
                      </td>
                      <td className="p-3.5 font-bold text-white">
                        {ret.supplierName}
                      </td>
                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          {ret.items.map((it, idx) => (
                            <div key={idx} className="text-[11px] text-neutral-200">
                              {it.quantity} × {it.partName} ({it.unitCost} ج.م)
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono font-black text-rose-400 text-sm">
                        {ret.totalReturnAmount.toLocaleString()} ج.م
                      </td>
                      <td className="p-3.5 font-mono text-amber-400 font-bold">
                        {ret.rescheduledDebtReduction > 0 ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>تخفيض {ret.rescheduledDebtReduction.toLocaleString()} ج.م</span>
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-emerald-400 font-bold">
                        {ret.cashRefundToTreasury > 0 ? (
                          <span className="flex items-center gap-1">
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                            <span>+{ret.cashRefundToTreasury.toLocaleString()} ج.م</span>
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        {onDeletePurchaseReturn && (
                          <button
                            onClick={() => onDeletePurchaseReturn(ret.id)}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 transition-colors"
                            title="حذف إذن المرتجع وإعادة قيمة الفاتورة للأصل"
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

      {showCreateModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            className="w-full max-w-4xl bg-[#141926] text-white rounded-3xl p-6 shadow-2xl border border-neutral-800 space-y-5 my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">إصدار فاتورة مشتريات وتوريد بضاعة</h3>
                  <p className="text-xs text-neutral-400">
                    متاح إدخال وتعديل سعر الشراء للقطعة بحرية، وزيادة رصيد المستودع، وخصم المبلغ من الخزنة
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0E121B] p-4 rounded-2xl border border-neutral-800">
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">المورد / التاجر:</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-[#161C2C] border border-neutral-700 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (رصيده: {s.balance.toLocaleString()} ج.م)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">رقم فاتورة المورد (الأصلية):</label>
                  <input
                    type="text"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    placeholder="مثال: فاتورة 89201"
                    className="w-full h-9 px-3 rounded-xl bg-[#161C2C] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">تاريخ الفاتورة:</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-[#161C2C] border border-neutral-700 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-amber-400" />
                    <span>أصناف البضاعة الموردة (متاح تعديل سعر الشراء مباشرة):</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-bold flex items-center gap-1 border border-neutral-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صنف آخر</span>
                  </button>
                </div>

                <div className="border border-neutral-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#0E121B] text-neutral-400 text-[11px] border-b border-neutral-800">
                      <tr>
                        <th className="p-2.5">اختيار من المخزن أو صنف جديد</th>
                        <th className="p-2.5">التصنيف</th>
                        <th className="p-2.5 text-center">الكمية</th>
                        <th className="p-2.5 text-center bg-amber-500/10 text-amber-300 font-bold">
                          سعر الشراء / التكلفة (ج.م) ★
                        </th>
                        <th className="p-2.5 text-center">سعر البيع المقترح (ج.م)</th>
                        <th className="p-2.5 text-left">إجمالي الصنف</th>
                        <th className="p-2.5 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {invoiceItems.map((item, index) => (
                        <tr key={index} className="hover:bg-[#1A2234]">
                          <td className="p-2.5 min-w-56">
                            <div className="space-y-1">
                              <select
                                onChange={(e) => handleSelectExistingPart(index, e.target.value)}
                                className="w-full h-7 px-2 rounded-lg bg-[#0E121B] border border-neutral-700 text-[11px] text-neutral-300 focus:outline-none"
                              >
                                <option value="">-- اختر صنف موجود أو اكتب جديد --</option>
                                {parts.map(p => (
                                  <option key={p.id} value={p.partNumber}>
                                    {p.name} ({p.partNumber}) - تكلفة: {p.costPrice} ج.م
                                  </option>
                                ))}
                              </select>

                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={item.partName}
                                  onChange={(e) => handleItemChange(index, 'partName', e.target.value)}
                                  placeholder="اسم القطعة (تيل، بوجيهات...)"
                                  className="w-full h-7 px-2 rounded-lg bg-[#0E121B] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={item.partNumber}
                                  onChange={(e) => handleItemChange(index, 'partNumber', e.target.value)}
                                  placeholder="كود OEM"
                                  className="w-24 h-7 px-2 rounded-lg bg-[#0E121B] border border-neutral-700 text-[11px] font-mono text-amber-400 placeholder-neutral-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </td>

                          <td className="p-2.5">
                            <select
                              value={item.category}
                              onChange={(e) => handleItemChange(index, 'category', e.target.value)}
                              className="h-8 px-2 rounded-lg bg-[#0E121B] border border-neutral-700 text-[11px] text-neutral-300"
                            >
                              {PART_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </td>

                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                              className="w-16 h-8 text-center rounded-lg bg-[#0E121B] border border-neutral-700 text-xs font-mono font-bold text-white"
                            />
                          </td>

                          <td className="p-2.5 text-center bg-amber-500/5">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={item.costPrice}
                              onChange={(e) => handleItemChange(index, 'costPrice', e.target.value)}
                              className="w-20 h-8 text-center rounded-lg bg-[#161C2C] border border-amber-500/60 text-xs font-mono font-black text-amber-300 focus:border-amber-400 focus:outline-none"
                              title="سعر الشراء والتكلفة من التاجر - يمكنك تعديله بحرية"
                            />
                          </td>

                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={item.salePrice}
                              onChange={(e) => handleItemChange(index, 'salePrice', e.target.value)}
                              className="w-20 h-8 text-center rounded-lg bg-[#0E121B] border border-neutral-700 text-xs font-mono text-emerald-400"
                              title="سعر البيع المقترح في المحل للزبائن"
                            />
                          </td>

                          <td className="p-2.5 text-left font-mono font-black text-white">
                            {item.total.toLocaleString()} ج.م
                          </td>

                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(index)}
                              className="text-neutral-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0E121B] p-4 rounded-2xl border border-neutral-800">
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">حالة سداد الفاتورة للتاجر:</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => handlePaymentStatusChange(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-xl bg-[#161C2C] border border-neutral-700 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="مدفوعة نقداً">مدفوعة نقداً (صرف كامل القيمة من الخزنة)</option>
                    <option value="مسددة جزئياً">مسددة جزئياً (عربون/دفعة والباقي آجل مجدول)</option>
                    <option value="آجل">آجل بالكامل (إضافة كامل المبلغ لحساب المورد)</option>
                  </select>
                </div>

                {paymentStatus !== 'آجل' && (
                  <div>
                    <label className="text-xs font-bold text-neutral-400 block mb-1">
                      المبلغ المسدد نقداً (يخصم من الخزينة):
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={grandTotal}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-xl bg-[#161C2C] border border-emerald-500/50 text-xs text-emerald-300 font-mono font-bold focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">طريقة الدفع:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-[#161C2C] border border-neutral-700 text-xs text-white focus:outline-none"
                  >
                    <option value="كاش (نقدي)">كاش (نقدي من الخزنة)</option>
                    <option value="إنستاباي / InstaPay">إنستاباي InstaPay</option>
                    <option value="فودافون كاش ومحافظ إلكترونية">فودافون كاش</option>
                    <option value="فيزا / بطاقة بنكية">تحويل بنكي / فيزا</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0E121B] border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-4 text-xs text-neutral-400">
                    <span>المجموع: <strong className="text-white font-mono">{subtotal.toLocaleString()} ج.م</strong></span>
                    <span>·</span>
                    <span>الضريبة (14%): <strong className="text-white font-mono">{taxAmount.toLocaleString()} ج.م</strong></span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-neutral-400 font-bold">إجمالي الفاتورة النهائي:</span>
                    <span className="text-2xl font-black text-amber-400 font-mono">{grandTotal.toLocaleString()} ج.م</span>
                    {paymentStatus !== 'مدفوعة نقداً' && (
                      <span className="text-xs text-rose-400 font-bold font-mono">
                        (المتبقي آجل للمورد: {Math.max(0, grandTotal - amountPaid).toLocaleString()} ج.م)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-xs font-black shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ وتوريد البضاعة وتحديث الخزنة</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {returnPurchaseInvoice && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setReturnPurchaseInvoice(null)}
        >
          <div 
            className="w-full max-w-3xl bg-[#141926] text-white rounded-3xl p-6 shadow-2xl border border-neutral-800 space-y-5 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">إجراء مرتجع مشتريات (رد بضاعة للتاجر / المورد)</h3>
                  <p className="text-xs text-neutral-400">
                    فاتورة رقم: <span className="font-mono text-amber-400 font-bold">{returnPurchaseInvoice.invoiceNumber}</span> · المورد: <span className="text-white font-bold">{returnPurchaseInvoice.supplierName}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setReturnPurchaseInvoice(null)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0E121B] p-3.5 rounded-2xl border border-neutral-800 text-xs">
              <div>
                <span className="text-neutral-400 block">إجمالي الفاتورة قبل المرتجع:</span>
                <span className="text-sm font-bold font-mono text-white">{returnPurchaseInvoice.grandTotal.toLocaleString()} ج.م</span>
              </div>
              <div>
                <span className="text-neutral-400 block">المسدد نقداً من الخزنة:</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{returnPurchaseInvoice.amountPaid.toLocaleString()} ج.م</span>
              </div>
              <div>
                <span className="text-neutral-400 block">الدفعات غير المسددة (الآجل):</span>
                <span className="text-sm font-bold font-mono text-amber-400">
                  {returnCalculation.unpaidBefore.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmPurchaseReturn} className="space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-bold text-neutral-300 block">حدد القطع المعادة للمورد والكمية:</span>
                <div className="border border-neutral-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#0E121B] text-neutral-400 text-[11px] border-b border-neutral-800">
                      <tr>
                        <th className="p-2.5">الصنف</th>
                        <th className="p-2.5 text-center">الكمية المستلمة</th>
                        <th className="p-2.5 text-center">سعر الشراء بالفاتورة</th>
                        <th className="p-2.5 text-center">كمية المرتجع</th>
                        <th className="p-2.5 text-left">قيمة المرتجع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {returnPurchaseInvoice.items.map((it) => {
                        const currentReturnQty = returnItems[it.partNumber] || 0;
                        const rowReturnTotal = currentReturnQty * it.costPrice;

                        return (
                          <tr key={it.partNumber} className="hover:bg-[#1A2234]">
                            <td className="p-2.5">
                              <span className="font-bold text-white block">{it.partName}</span>
                              <span className="font-mono text-[10px] text-amber-400">{it.partNumber}</span>
                            </td>
                            <td className="p-2.5 text-center font-mono">
                              {it.quantity}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-amber-300">
                              {it.costPrice} ج.م
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setReturnItems(prev => ({
                                    ...prev,
                                    [it.partNumber]: Math.max(0, (prev[it.partNumber] || 0) - 1)
                                  }))}
                                  className="w-6 h-6 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max={it.quantity}
                                  value={currentReturnQty}
                                  onChange={(e) => {
                                    const val = Math.min(it.quantity, Math.max(0, parseInt(e.target.value) || 0));
                                    setReturnItems(prev => ({ ...prev, [it.partNumber]: val }));
                                  }}
                                  className="w-14 h-7 text-center rounded bg-[#0E121B] border border-neutral-700 text-white font-mono text-xs font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => setReturnItems(prev => ({
                                    ...prev,
                                    [it.partNumber]: Math.min(it.quantity, (prev[it.partNumber] || 0) + 1)
                                  }))}
                                  className="w-6 h-6 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-2.5 text-left font-mono font-black text-rose-400">
                              {rowReturnTotal.toLocaleString()} ج.م
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>أثر المرتجع التلقائي على الفاتورة وجدولة الدفعات غير المسددة:</span>
                  </span>
                  <span className="font-mono font-black text-rose-400 text-sm">
                    إجمالي المرتجع: {returnCalculation.totalReturnAmount.toLocaleString()} ج.م
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-neutral-300 pt-1">
                  <div>
                    <span className="text-neutral-400 block">قيمة الفاتورة الجديدة بعد التعديل:</span>
                    <strong className="text-white font-mono text-sm">{returnCalculation.newGrandTotal.toLocaleString()} ج.م</strong>
                  </div>

                  <div>
                    <span className="text-neutral-400 block">المبلغ المخصوم من الدفعات غير المسددة:</span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      {returnCalculation.debtReduction.toLocaleString()} ج.م (تخفيض فوري للآجل)
                    </strong>
                  </div>

                  <div>
                    <span className="text-neutral-400 block">الدفعات غير المسددة المتبقية بعد الجدولة:</span>
                    <strong className="text-amber-400 font-mono text-sm">
                      {returnCalculation.unpaidAfter.toLocaleString()} ج.م
                    </strong>
                  </div>
                </div>

                {returnCalculation.excessCash > 0 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-purple-300 font-bold block">
                        فائض المرتجع يتجاوز الديون غير المسددة بمقدار: {returnCalculation.excessCash.toLocaleString()} ج.م
                      </span>
                      <span className="text-[11px] text-neutral-400">اختر طريقة تسوية الفائض:</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExcessSettlementOption('treasury_cash')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          excessSettlementOption === 'treasury_cash'
                            ? 'bg-emerald-500 text-neutral-950'
                            : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        استرداد نقدي للخزنة (توريد كاش)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcessSettlementOption('supplier_credit')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          excessSettlementOption === 'supplier_credit'
                            ? 'bg-amber-500 text-neutral-950'
                            : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        إيداع رصيد دائن للمحل عند المورد
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">سبب إرجاع البضاعة للتاجر:</label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-xs text-white focus:outline-none focus:border-rose-400"
                  >
                    <option value="بضاعة معيبة / تلف مصنعي">بضاعة معيبة / تلف مصنعي</option>
                    <option value="غير مطابقة للمواصفات أو الطلبية">غير مطابقة للمواصفات أو الطلبية</option>
                    <option value="خطأ في سعر الشراء المسجل">خطأ في سعر الشراء المسجل</option>
                    <option value="فائض مخزون متفق على إرجاعه">فائض مخزون متفق على إرجاعه للتاجر</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-400 block mb-1">ملاحظات إضافية / إذن الاسترجاع:</label>
                  <input
                    type="text"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="رقم إذن الاسترجاع مع مندوب المورد..."
                    className="w-full h-9 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-400"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0E121B] border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-neutral-400 block">إجمالي قيمة المرتجع المحسوم:</span>
                  <span className="text-2xl font-black text-rose-400 font-mono">
                    {returnCalculation.totalReturnAmount.toLocaleString()} ج.م
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnPurchaseInvoice(null)}
                    className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={returnCalculation.totalReturnAmount <= 0}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-600/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد المرتجع وتعديل الفاتورة وإعادة الجدولة</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedInvoiceForModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedInvoiceForModal(null)}
        >
          <div 
            className="w-full max-w-2xl bg-[#141926] text-white rounded-3xl p-6 shadow-2xl border border-neutral-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">تفاصيل فاتورة المشتريات والتوريد</h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForModal(null)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#0E121B] p-3 rounded-2xl">
              <div>
                <span className="text-neutral-400 block">رقم الفاتورة:</span>
                <span className="font-mono font-bold text-white">{selectedInvoiceForModal.invoiceNumber}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">المورد:</span>
                <span className="font-bold text-amber-400">{selectedInvoiceForModal.supplierName}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">التاريخ والوقت:</span>
                <span className="font-mono text-neutral-300">{selectedInvoiceForModal.date} · {selectedInvoiceForModal.time}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">رقم فاتورة المورد:</span>
                <span className="font-mono text-neutral-300">{selectedInvoiceForModal.supplierInvoiceNumber || '—'}</span>
              </div>
            </div>

            <div className="border border-neutral-800 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0E121B] text-neutral-400 text-[11px]">
                  <tr>
                    <th className="p-2.5">الصنف</th>
                    <th className="p-2.5 text-center">الكمية</th>
                    <th className="p-2.5 text-center">سعر الشراء / التكلفة</th>
                    <th className="p-2.5 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {selectedInvoiceForModal.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-bold text-white">{it.partName}</td>
                      <td className="p-2.5 text-center font-mono">{it.quantity}</td>
                      <td className="p-2.5 text-center font-mono text-amber-400">{it.costPrice} ج.م</td>
                      <td className="p-2.5 text-left font-mono font-bold text-white">{it.total.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-[#0E121B] rounded-2xl flex items-center justify-between text-xs">
              <span className="text-neutral-400">إجمالي الفاتورة:</span>
              <span className="text-base font-black text-amber-400 font-mono">{selectedInvoiceForModal.grandTotal.toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
