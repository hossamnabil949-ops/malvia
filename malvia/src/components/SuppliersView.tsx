import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Phone, 
  MapPin, 
  FileText, 
  DollarSign, 
  CreditCard, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  Download, 
  Printer, 
  FileSpreadsheet, 
  Filter, 
  Building2, 
  Sparkles,
  Banknote,
  Zap,
  Wrench,
  Receipt,
  RotateCcw,
  BadgeAlert,
  Wallet,
  ArrowRightLeft
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  Supplier, 
  SupplierPayment, 
  PurchaseInvoice, 
  PurchaseReturn, 
  PaymentMethod 
} from '../types/autoParts';

interface SuppliersViewProps {
  suppliers: Supplier[];
  supplierPayments: SupplierPayment[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseReturns?: PurchaseReturn[];
  treasuryBalance: number;
  onAddSupplier: (supplier: Supplier) => void;
  onUpdateSupplier?: (supplier: Supplier) => void;
  onSettleSupplierPayment: (
    supplierId: string, 
    amount: number, 
    paymentDate: string, 
    paymentMethod: PaymentMethod | string, 
    treasurySource: string, 
    notes: string
  ) => void;
  onAddPurchaseReturn?: (returnData: PurchaseReturn) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  supplierPayments,
  purchaseInvoices,
  purchaseReturns = [],
  treasuryBalance,
  onAddSupplier,
  onUpdateSupplier,
  onSettleSupplierPayment,
  onAddPurchaseReturn,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'suppliers' | 'payments' | 'returns'>('suppliers');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [settleModalSupplier, setSettleModalSupplier] = useState<Supplier | null>(null);
  const [returnModalSupplier, setReturnModalSupplier] = useState<Supplier | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);

  // Settle Payment State
  const [settleAmount, setSettleAmount] = useState<number>(1000);
  const [settleDate, setSettleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod | string>('نقدي');
  const [treasurySource, setTreasurySource] = useState<string>('خزينة المحل النقدية');
  const [settleNotes, setSettleNotes] = useState<string>('');

  // Goods Return State
  const [returnAmount, setReturnAmount] = useState<number>(500);
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [returnInvoiceNumber, setReturnInvoiceNumber] = useState<string>('');
  const [returnItemName, setReturnItemName] = useState<string>('');
  const [returnQty, setReturnQty] = useState<number>(1);
  const [returnUnitCost, setReturnUnitCost] = useState<number>(500);
  const [returnReason, setReturnReason] = useState<string>('عيب صناعة / عدم تطابق');
  const [returnNotes, setReturnNotes] = useState<string>('');

  // Add Supplier Form State
  const [newCode, setNewCode] = useState(`SUP-00${suppliers.length + 1}`);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('قطع غيار ياباني وكوري');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newTaxNumber, setNewTaxNumber] = useState('');
  const [newInitialDebt, setNewInitialDebt] = useState<number>(0);
  const [newNotes, setNewNotes] = useState('');

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchQuery =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phone.includes(searchQuery) ||
        s.contactPerson.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'all' || s.category === selectedCategory;
      return matchQuery && matchCat;
    });
  }, [suppliers, searchQuery, selectedCategory]);

  // Aggregate KPI Calculations
  const totalDeferredDebt = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.deferredDebt ?? s.balance ?? 0), 0);
  }, [suppliers]);

  const totalStoreCredit = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.storeCredit || 0), 0);
  }, [suppliers]);

  const totalPurchasesSum = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.totalSupplied || 0), 0);
  }, [suppliers]);

  const totalPaidSum = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
  }, [suppliers]);

  // Handle open payment modal
  const handleOpenSettle = (supplier: Supplier) => {
    setSettleModalSupplier(supplier);
    const currentDebt = supplier.deferredDebt ?? supplier.balance ?? 0;
    setSettleAmount(currentDebt > 0 ? currentDebt : 1000);
    setSettleDate(new Date().toISOString().split('T')[0]);
    setSettleMethod('نقدي');
    setSettleNotes(`سداد دفعة حساب للمورد ${supplier.name}`);
  };

  // Handle submit payment
  const handleSubmitSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalSupplier || settleAmount <= 0) return;

    onSettleSupplierPayment(
      settleModalSupplier.id,
      settleAmount,
      settleDate,
      settleMethod,
      treasurySource,
      settleNotes || `دفعة سداد للمورد ${settleModalSupplier.name}`
    );

    setSettleModalSupplier(null);
  };

  // Handle open return modal
  const handleOpenReturn = (supplier: Supplier) => {
    setReturnModalSupplier(supplier);
    setReturnAmount(500);
    setReturnUnitCost(500);
    setReturnQty(1);
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReturnInvoiceNumber(`PUR-${Math.floor(100 + Math.random() * 900)}`);
    setReturnItemName('');
    setReturnNotes(`مرتجع بضاعة للمورد ${supplier.name}`);
  };

  // Calculate automated return allocation: deferred deduction vs store credit
  const returnAllocation = useMemo(() => {
    if (!returnModalSupplier) return { deductedFromDebt: 0, creditedToStore: 0 };
    const debt = returnModalSupplier.deferredDebt ?? returnModalSupplier.balance ?? 0;
    const calcTotal = returnUnitCost * returnQty;

    if (debt > 0) {
      const deducted = Math.min(calcTotal, debt);
      const credit = Math.max(0, calcTotal - debt);
      return { deductedFromDebt: deducted, creditedToStore: credit, totalReturn: calcTotal };
    } else {
      return { deductedFromDebt: 0, creditedToStore: calcTotal, totalReturn: calcTotal };
    }
  }, [returnModalSupplier, returnUnitCost, returnQty]);

  // Handle submit goods return
  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalSupplier) return;

    const totalReturnVal = returnUnitCost * returnQty;
    if (totalReturnVal <= 0) return;

    const currentDebt = returnModalSupplier.deferredDebt ?? returnModalSupplier.balance ?? 0;
    const currentCredit = returnModalSupplier.storeCredit || 0;

    let newDebt = currentDebt;
    let newCredit = currentCredit;
    let deductedFromDeferred = 0;
    let creditedToStore = 0;

    if (currentDebt > 0) {
      if (totalReturnVal <= currentDebt) {
        deductedFromDeferred = totalReturnVal;
        newDebt = currentDebt - totalReturnVal;
      } else {
        deductedFromDeferred = currentDebt;
        creditedToStore = totalReturnVal - currentDebt;
        newDebt = 0;
        newCredit = currentCredit + creditedToStore;
      }
    } else {
      creditedToStore = totalReturnVal;
      newCredit = currentCredit + totalReturnVal;
    }

    const returnRecord: PurchaseReturn = {
      id: `PRET-${Date.now()}`,
      returnNumber: `PR-${Math.floor(1000 + Math.random() * 9000)}`,
      purchaseInvoiceId: `INV-${returnInvoiceNumber}`,
      purchaseInvoiceNumber: returnInvoiceNumber || 'بدون فاتورة',
      supplierId: returnModalSupplier.id,
      supplierName: returnModalSupplier.name,
      date: returnDate,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      items: [
        {
          partNumber: 'RET-PART',
          partName: returnItemName || 'صنف مرتجع للمورد',
          quantity: returnQty,
          unitCost: returnUnitCost,
          total: totalReturnVal,
          reason: returnReason
        }
      ],
      totalReturnAmount: totalReturnVal,
      deductedFromDeferredDebt: deductedFromDeferred,
      creditedToStoreBalance: creditedToStore,
      cashRefundToTreasury: 0,
      notes: `${returnNotes} (تم تخفيض ${deductedFromDeferred} ج.م من المؤجل، و ${creditedToStore} ج.م كرصيد للمحل)`,
      recordedBy: 'مسؤول المشتريات والمخزن'
    };

    if (onAddPurchaseReturn) {
      onAddPurchaseReturn(returnRecord);
    }

    // تحديث رصيد المورد (تخفيض المديونية / الرصيد الدائن) يتم مركزياً داخل onAddPurchaseReturn
    // حتى لا يُحتسب المرتجع مرتين.
    setReturnModalSupplier(null);
  };

  // Handle create new supplier
  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const created: Supplier = {
      id: `sup-${Date.now()}`,
      code: newCode.trim() || `SUP-00${suppliers.length + 1}`,
      name: newName.trim(),
      category: newCategory,
      contactPerson: newContact.trim(),
      phone: newPhone.trim(),
      address: newAddress.trim() || 'القاهرة',
      taxNumber: newTaxNumber.trim() || undefined,
      balance: newInitialDebt,
      deferredDebt: newInitialDebt,
      storeCredit: 0,
      totalSupplied: newInitialDebt,
      totalPaid: 0,
      totalReturned: 0,
      lastPaymentDate: new Date().toISOString().split('T')[0],
      notes: newNotes.trim()
    };

    onAddSupplier(created);
    setShowAddModal(false);

    // Reset form
    setNewName('');
    setNewContact('');
    setNewPhone('');
    setNewAddress('');
    setNewTaxNumber('');
    setNewInitialDebt(0);
    setNewNotes('');
    setNewCode(`SUP-00${suppliers.length + 2}`);
  };

  // Build Supplier Statement
  const supplierStatement = useMemo(() => {
    if (!statementSupplier) return [];

    const list: Array<{
      id: string;
      date: string;
      type: string;
      ref: string;
      amountIn: number;
      amountOut: number;
      method: string;
      notes: string;
      balanceBadge?: string;
    }> = [];

    // Purchases
    purchaseInvoices
      .filter((inv) => inv.supplierId === statementSupplier.id || inv.supplierName === statementSupplier.name)
      .forEach((inv) => {
        list.push({
          id: inv.id,
          date: inv.date,
          type: 'فاتورة مشتريات (له)',
          ref: inv.invoiceNumber,
          amountIn: inv.grandTotal,
          amountOut: inv.amountPaid || 0,
          method: inv.paymentMethod || 'آجل',
          notes: `فاتورة بضاعة (${inv.items.length} أصناف)`
        });
      });

    // Payments
    supplierPayments
      .filter((p) => p.supplierId === statementSupplier.id || p.supplierName === statementSupplier.name)
      .forEach((p) => {
        list.push({
          id: p.id,
          date: p.paymentDate,
          type: 'سند صرف وسداد (منه)',
          ref: p.paymentNumber,
          amountIn: 0,
          amountOut: p.amount,
          method: p.paymentMethod,
          notes: p.notes || 'سداد دفعة نقدية مخصومة من الخزينة'
        });
      });

    // Returns
    purchaseReturns
      .filter((r) => r.supplierId === statementSupplier.id || r.supplierName === statementSupplier.name)
      .forEach((r) => {
        list.push({
          id: r.id,
          date: r.date,
          type: 'مرتجع بضائع للمورد',
          ref: r.returnNumber,
          amountIn: 0,
          amountOut: r.totalReturnAmount,
          method: 'تسوية حساب',
          notes: r.notes || `مرتجع بضاعة بقيمة ${r.totalReturnAmount} ج.م`,
          balanceBadge: r.creditedToStoreBalance && r.creditedToStoreBalance > 0
            ? `تخفيض مؤجل: ${r.deductedFromDeferredDebt || 0} ج | رصيد للمحل: ${r.creditedToStoreBalance} ج`
            : `تخفيض من الفواتير المؤجلة: ${r.totalReturnAmount} ج`
        });
      });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [statementSupplier, purchaseInvoices, supplierPayments, purchaseReturns]);

  // Export Suppliers to Excel
  const handleExportExcel = () => {
    const data = suppliers.map((s) => ({
      'كود المورد': s.code,
      'اسم المورد': s.name,
      'التصنيف': s.category,
      'المسؤول': s.contactPerson,
      'رقم الهاتف': s.phone,
      'العنوان': s.address,
      'فواتير مؤجلة (علينا)': s.deferredDebt ?? s.balance,
      'رصيد دائن للمحل (لنا)': s.storeCredit || 0,
      'إجمالي التوريدات': s.totalSupplied,
      'إجمالي المسدد له': s.totalPaid,
      'إجمالي المرتجعات': s.totalReturned || 0,
      'تاريخ آخر حركة': s.lastPaymentDate || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الموردين والحسابات');
    XLSX.writeFile(wb, `كشف_حسابات_الموردين_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
            <Truck className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">الموردين وحسابات الموردين</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                مرتبط بالخزينة
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              إدارة كشوف الحسابات، فواتير الشراء المؤجلة، دفعات السداد، وتسوية مرتجعات البضائع كرصيد للمحل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Total Deferred Debt (Payable) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>فواتير مؤجلة مستحقة للموردين</span>
            <BadgeAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400">
            {totalDeferredDebt.toLocaleString()} <span className="text-xs text-rose-300 font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span className="text-rose-400 font-bold">ذمم دائنة</span> علينا تسديدها
          </div>
        </div>

        {/* Store Credit with Suppliers (Receivable from Returns) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>رصيد دائن للمحل لدى الموردين</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">
            {totalStoreCredit.toLocaleString()} <span className="text-xs text-emerald-300 font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-1">
            ناتج عن مرتجعات بضائع بدون فواتير مؤجلة
          </div>
        </div>

        {/* Total Purchases */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>إجمالي المشتريات والتوريدات</span>
            <ArrowDownLeft className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400">
            {totalPurchasesSum.toLocaleString()} <span className="text-xs text-amber-300 font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            قيمة جميع بضائع قطع الغيار الموردة
          </div>
        </div>

        {/* Treasury Available Balance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>الرصيد المتاح بالخزينة لسداد الدفعات</span>
            <Banknote className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400">
            {treasuryBalance.toLocaleString()} <span className="text-xs text-amber-300 font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            خزينة المحل النقدية الجاهزة للصرف
          </div>
        </div>

      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'suppliers'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>كشف حسابات الموردين ({suppliers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'payments'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>سجل دفعات السداد وتواريخها ({supplierPayments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('returns')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'returns'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>مرتجعات البضائع والأرصدة ({purchaseReturns.length})</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="ابحث باسم المورد، كود المورد، رقم الهاتف، أو اسم المسؤول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">جميع تصنيفات الموردين</option>
            <option value="قطع غيار ياباني وكوري">قطع غيار ياباني وكوري</option>
            <option value="فلاتر وزيوت مستوردة">فلاتر وزيوت مستوردة</option>
            <option value="فرامل ومكابح">فرامل ومكابح</option>
            <option value="عضلات ومساعدات">عضلات ومساعدات</option>
            <option value="محرك وكهرباء">محرك وكهرباء</option>
            <option value="كهرباء وإلكترونيات">كهرباء وإلكترونيات</option>
          </select>
        </div>
      </div>

      {/* Tab 1: Suppliers Grid */}
      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => {
            const currentDebt = supplier.deferredDebt ?? supplier.balance ?? 0;
            const currentCredit = supplier.storeCredit || 0;

            return (
              <div
                key={supplier.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {supplier.code}
                        </span>
                        <span className="text-xs text-slate-400">
                          {supplier.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-white text-sm mt-1">
                        {supplier.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span className="font-mono">{supplier.phone}</span>
                        <span>· المسؤول: {supplier.contactPerson}</span>
                      </p>
                    </div>
                  </div>

                  {/* Account Balance Summary Cards */}
                  <div className="grid grid-cols-2 gap-2 my-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">فواتير مؤجلة (علينا):</span>
                      <span className={`font-black text-sm block mt-0.5 ${currentDebt > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {currentDebt.toLocaleString()} ج.م
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">رصيد دائن للمحل (لنا):</span>
                      <span className={`font-black text-sm block mt-0.5 ${currentCredit > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {currentCredit.toLocaleString()} ج.م
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span>إجمالي المشتريات:</span>
                      <span className="font-bold text-slate-200">{supplier.totalSupplied.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between">
                      <span>إجمالي المسدد له:</span>
                      <span className="font-bold text-emerald-400">{supplier.totalPaid.toLocaleString()} ج.م</span>
                    </div>
                    {supplier.totalReturned !== undefined && (
                      <div className="flex justify-between">
                        <span>إجمالي المرتجعات:</span>
                        <span className="font-bold text-amber-400">{supplier.totalReturned.toLocaleString()} ج.م</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supplier Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => handleOpenSettle(supplier)}
                    className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold text-xs transition border border-emerald-500/30"
                    title="سداد دفعة للمورد من الخزينة"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>سداد دفعة</span>
                  </button>

                  <button
                    onClick={() => handleOpenReturn(supplier)}
                    className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-bold text-xs transition border border-amber-500/30"
                    title="تسجيل مرتجع بضاعة وتخفيض المؤجل أو حسابه كرصيد للمحل"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>مرتجع بضاعة</span>
                  </button>

                  <button
                    onClick={() => setStatementSupplier(supplier)}
                    className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition border border-slate-700"
                    title="كشف حساب تفصيلي"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>كشف حساب</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Payments History Table */}
      {activeTab === 'payments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div>
              <h3 className="text-sm font-black text-white">سجل دفعات سداد الموردين بتواريخ السداد والربط المالي</h3>
              <p className="text-[11px] text-slate-400">سندات الصرف المعتمدة والمخصومة من الخزينة</p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 border border-slate-700">
              إجمالي السندات: {supplierPayments.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">رقم السند</th>
                  <th className="py-3 px-4 font-bold">تاريخ السداد</th>
                  <th className="py-3 px-4 font-bold">اسم المورد</th>
                  <th className="py-3 px-4 font-bold">المبلغ المسدد</th>
                  <th className="py-3 px-4 font-bold">طريقة الدفع</th>
                  <th className="py-3 px-4 font-bold">المصدر المالي</th>
                  <th className="py-3 px-4 font-bold">بيان وملاحظات</th>
                  <th className="py-3 px-4 font-bold">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {supplierPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">{p.paymentNumber}</td>
                    <td className="py-3 px-4 font-mono text-white">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.paymentDate}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-white">{p.supplierName}</td>
                    <td className="py-3 px-4 font-black text-emerald-400 text-sm">
                      {p.amount.toLocaleString()} ج.م
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold text-[11px] border border-slate-700">
                        {p.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <span className="flex items-center gap-1 text-[11px] text-amber-400">
                        <Banknote className="w-3.5 h-3.5" />
                        {p.treasurySource}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{p.notes || '-'}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{p.recordedBy}</td>
                  </tr>
                ))}
                {supplierPayments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      لم يتم تسجيل دفعات سداد موردين بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Goods Returns & Credits Table */}
      {activeTab === 'returns' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div>
              <h3 className="text-sm font-black text-white">سجل مرتجعات البضائع للموردين والأرصدة المحتسبة</h3>
              <p className="text-[11px] text-slate-400">
                تسوية قيمة المرتجع تلقائياً: تخفيض الفواتير المؤجلة أو الإضافة كرصيد دائن للمحل
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-amber-400 border border-slate-700">
              إجمالي المرتجعات: {purchaseReturns.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">رقم المرتجع</th>
                  <th className="py-3 px-4 font-bold">التاريخ</th>
                  <th className="py-3 px-4 font-bold">اسم المورد</th>
                  <th className="py-3 px-4 font-bold">قيمة المرتجع</th>
                  <th className="py-3 px-4 font-bold">تخفيض من المؤجل</th>
                  <th className="py-3 px-4 font-bold">رصيد دائن للمحل</th>
                  <th className="py-3 px-4 font-bold">البيان والأصناف</th>
                  <th className="py-3 px-4 font-bold">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {purchaseReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">{r.returnNumber}</td>
                    <td className="py-3 px-4 font-mono text-white">{r.date}</td>
                    <td className="py-3 px-4 font-bold text-white">{r.supplierName}</td>
                    <td className="py-3 px-4 font-black text-amber-400 text-sm">
                      {r.totalReturnAmount.toLocaleString()} ج.م
                    </td>
                    <td className="py-3 px-4">
                      {r.deductedFromDeferredDebt && r.deductedFromDeferredDebt > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-bold border border-rose-500/25">
                          -{r.deductedFromDeferredDebt.toLocaleString()} ج.م
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {r.creditedToStoreBalance && r.creditedToStoreBalance > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/25">
                          +{r.creditedToStoreBalance.toLocaleString()} ج.م رصيد للمحل
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{r.notes || '-'}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{r.recordedBy}</td>
                  </tr>
                ))}
                {purchaseReturns.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      لا توجد مرتجعات بضائع مسجلة للموردين
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL 1: Settle Supplier Payment ================= */}
      {settleModalSupplier && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">سداد دفعة للمورد</h3>
                  <p className="text-xs text-slate-400">
                    {settleModalSupplier.name} (كود: {settleModalSupplier.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettleModalSupplier(null)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block">فواتير مؤجلة مستحقة:</span>
                <span className="text-base font-black text-rose-400 block mt-0.5">
                  {(settleModalSupplier.deferredDebt ?? settleModalSupplier.balance ?? 0).toLocaleString()} ج.م
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">رصيد الخزينة المتاح:</span>
                <span className="text-base font-black text-amber-400 block mt-0.5">
                  {treasuryBalance.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitSettle} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  المبلغ المسدد (ج.م) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-emerald-400 text-base font-black focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">تاريخ السداد</label>
                  <input
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">طريقة السداد</label>
                  <select
                    value={settleMethod}
                    onChange={(e) => setSettleMethod(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="نقدي">نقدي (كاش من الخزينة)</option>
                    <option value="إنستاباي / InstaPay">إنستاباي / InstaPay</option>
                    <option value="فودافون كاش ومحافظ إلكترونية">فودافون كاش ومحافظ إلكترونية</option>
                    <option value="فيزا / بطاقة بنكية">تحويل بنكي / بطاقة</option>
                    <option value="شيك بنكي">شيك بنكي</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">بيان وملاحظات السداد</label>
                <input
                  type="text"
                  placeholder="رقم الحوالة، أو إيصال الإيداع، أو تفاصيل الفاتورة..."
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSettleModalSupplier(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/25 active:scale-95 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد سداد الدفعة وخصم الخزينة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: Goods Return to Supplier ================= */}
      {returnModalSupplier && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">تسجيل مرتجع بضاعة للمورد</h3>
                  <p className="text-xs text-slate-400">
                    {returnModalSupplier.name} (كود: {returnModalSupplier.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReturnModalSupplier(null)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Supplier Balances */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block">فواتير مؤجلة حالية (علينا):</span>
                <span className="text-base font-black text-rose-400 block mt-0.5">
                  {(returnModalSupplier.deferredDebt ?? returnModalSupplier.balance ?? 0).toLocaleString()} ج.م
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">رصيد دائن للمحل حالي (لنا):</span>
                <span className="text-base font-black text-emerald-400 block mt-0.5">
                  {(returnModalSupplier.storeCredit || 0).toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitReturn} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">اسم الصنف أو قطعة الغيار المرتجعة</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فحمات فرامل كامري تالفة، أو فلتر زيت به عيب..."
                  value={returnItemName}
                  onChange={(e) => setReturnItemName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">الكمية المرتجعة</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnQty}
                    onChange={(e) => setReturnQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">سعر تكلفة الشراء للقطعة</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnUnitCost}
                    onChange={(e) => setReturnUnitCost(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">تاريخ المرتجع</label>
                  <input
                    type="date"
                    required
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">سبب المرتجع</label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="عيب صناعة / عدم تطابق">عيب صناعة / عدم تطابق</option>
                    <option value="تلف أثناء الشحن والتوريد">تلف أثناء الشحن والتوريد</option>
                    <option value="زيادة عن حاجة المخزون">زيادة عن حاجة المخزون</option>
                    <option value="خطأ في كود القطعة">خطأ في كود القطعة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">رقم فاتورة الشراء الأصلية (اختياري)</label>
                <input
                  type="text"
                  placeholder="PUR-..."
                  value={returnInvoiceNumber}
                  onChange={(e) => setReturnInvoiceNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Dynamic Automated Settlement Allocation Notice */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300">إجمالي قيمة المرتجع المحتسب:</span>
                  <span className="text-sm font-black text-amber-400">{returnAllocation.totalReturn.toLocaleString()} ج.م</span>
                </div>

                <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-amber-500/20">
                  {returnAllocation.deductedFromDebt > 0 && (
                    <div className="flex items-center justify-between text-rose-300">
                      <span>✓ تخفيض مباشر من الفواتير المؤجلة:</span>
                      <span className="font-bold">-{returnAllocation.deductedFromDebt.toLocaleString()} ج.م</span>
                    </div>
                  )}

                  {returnAllocation.creditedToStore > 0 && (
                    <div className="flex items-center justify-between text-emerald-400 font-bold">
                      <span>✓ إضافة كرصيد دائن للمحل لدى المورد:</span>
                      <span>+{returnAllocation.creditedToStore.toLocaleString()} ج.م</span>
                    </div>
                  )}

                  {returnAllocation.deductedFromDebt === 0 && (
                    <div className="text-emerald-300 text-[10px]">
                      * لا توجد فواتير مؤجلة للمورد، سيتم إضافة كامل قيمة المرتجع ({returnAllocation.totalReturn.toLocaleString()} ج.م) كرصيد دائن للمحل للاستفادة به في طلبيات قادمة.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReturnModalSupplier(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد المرتجع وتسوية الحساب</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: Add New Supplier ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Truck className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">إضافة مورد أو شركة جديدة</h3>
                  <p className="text-xs text-slate-400">تسجيل بيانات المورد وفتح حساب جاري له</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">كود المورد</label>
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">تصنيف النشاط</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="قطع غيار ياباني وكوري">قطع غيار ياباني وكوري</option>
                    <option value="فلاتر وزيوت مستوردة">فلاتر وزيوت مستوردة</option>
                    <option value="فرامل ومكابح">فرامل ومكابح</option>
                    <option value="عضلات ومساعدات">عضلات ومساعدات</option>
                    <option value="محرك وكهرباء">محرك وكهرباء</option>
                    <option value="كهرباء وإلكترونيات">كهرباء وإلكترونيات</option>
                    <option value="ورش خراطة وتصنيع">ورش خراطة وتصنيع</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  اسم المورد / الشركة <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مؤسسة النور لقطع غيار تويوتا"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    الشخص المسؤول <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: الحاج مصطفى"
                    value={newContact}
                    onChange={(e) => setNewContact(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    رقم الهاتف / الواتساب <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="010XXXXXXXX"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">العنوان أو المقر</label>
                <input
                  type="text"
                  placeholder="مثال: شارع التوفيقية، وسط البلد"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">الرقم الضريبي (اختياري)</label>
                  <input
                    type="text"
                    placeholder="EG-XXXXXXXXX"
                    value={newTaxNumber}
                    onChange={(e) => setNewTaxNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">رصيد افتتاحي مؤجل (علينا)</label>
                  <input
                    type="number"
                    min="0"
                    value={newInitialDebt}
                    onChange={(e) => setNewInitialDebt(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-rose-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">ملاحظات وشروط التعامل</label>
                <textarea
                  rows={2}
                  placeholder="فترة السماح، الخصومات المتفق عليها، مواعيد التوريد..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ المورد</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: Supplier Statement of Account ================= */}
      {statementSupplier && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Receipt className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    كشف حساب المورد: {statementSupplier.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    كود: {statementSupplier.code} | هاتف: {statementSupplier.phone} | المسؤول: {statementSupplier.contactPerson}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStatementSupplier(null)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Status Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">إجمالي التوريدات:</span>
                <p className="text-sm font-bold text-amber-400 mt-0.5">
                  {statementSupplier.totalSupplied.toLocaleString()} ج.م
                </p>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">إجمالي المسدد له:</span>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">
                  {statementSupplier.totalPaid.toLocaleString()} ج.م
                </p>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">فواتير مؤجلة (علينا):</span>
                <p className="text-sm font-black text-rose-400 mt-0.5">
                  {(statementSupplier.deferredDebt ?? statementSupplier.balance ?? 0).toLocaleString()} ج.م
                </p>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">رصيد دائن للمحل (لنا):</span>
                <p className="text-sm font-black text-emerald-400 mt-0.5">
                  {(statementSupplier.storeCredit || 0).toLocaleString()} ج.م
                </p>
              </div>
            </div>

            {/* Statement Ledger Table */}
            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">التاريخ</th>
                    <th className="py-2.5 px-3 font-bold">النوع والبيان</th>
                    <th className="py-2.5 px-3 font-bold">رقم المرجع</th>
                    <th className="py-2.5 px-3 font-bold">قيمة الفاتورة (له)</th>
                    <th className="py-2.5 px-3 font-bold">المسدد أو المرتجع (منه)</th>
                    <th className="py-2.5 px-3 font-bold">طريقة الدفع والتسوية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {supplierStatement.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-300">{rec.date}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.type.includes('سداد')
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                            : rec.type.includes('مرتجع')
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                        }`}>
                          {rec.type}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-sm">{rec.notes}</div>
                        {rec.balanceBadge && (
                          <div className="text-[10px] text-emerald-400 font-bold mt-0.5">{rec.balanceBadge}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-400">{rec.ref}</td>
                      <td className="py-2.5 px-3 font-bold text-amber-400">
                        {rec.amountIn > 0 ? `${rec.amountIn.toLocaleString()} ج.م` : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">
                        {rec.amountOut > 0 ? `${rec.amountOut.toLocaleString()} ج.م` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{rec.method}</td>
                    </tr>
                  ))}
                  {supplierStatement.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        لا توجد حركات مسجلة لهذا المورد بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const s = statementSupplier;
                    setStatementSupplier(null);
                    handleOpenSettle(s);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>سداد دفعة لهذا المورد</span>
                </button>

                <button
                  onClick={() => {
                    const s = statementSupplier;
                    setStatementSupplier(null);
                    handleOpenReturn(s);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>تسجيل مرتجع بضاعة</span>
                </button>
              </div>

              <button
                onClick={() => setStatementSupplier(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
