import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  Check, 
  Receipt, 
  CreditCard, 
  DollarSign, 
  Layers, 
  RotateCcw,
  Sparkles,
  Barcode,
  Zap,
  Smartphone,
  Banknote,
  Clock,
  Mic,
  Edit3,
  Percent,
  CheckCircle2,
  Tag,
  CarFront,
  Lock,
  Unlock,
  ShieldCheck,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { nextSalesInvoiceNumber } from '../utils/invoiceNumber';
import { SaleError, computeTotals, validateSale, validateDiscountPolicy, toEgp, isCreditPayment } from '../utils/saleLogic';
import { AutoPart, CartItem, Customer, Invoice, CarBrand, CarModel, PartCategory, PaymentMethod, Employee, Warehouse, StockLevel } from '../types/autoParts';
import { MAIN_WAREHOUSE_ID, MAIN_WAREHOUSE_NAME, availableIn } from '../utils/warehouseLogic';
import { LoyaltySettings, resolveLoyalty, earnedPoints, pointsValue, maxRedeemablePoints } from '../utils/loyaltyLogic';
import { verifyOwnerPassword } from '../services/approvalService';
import { CAR_BRANDS, PART_CATEGORIES } from '../data/autoPartsData';
import { BrandBar } from './BrandBar';

interface QuickPosViewProps {
  parts: AutoPart[];
  customers: Customer[];
  cart: CartItem[];
  onAddToCart: (part: AutoPart) => void;
  onUpdateCartQuantity: (partId: string, quantity: number) => void;
  onUpdateCartPrice: (partId: string, price: number) => void;
  onRemoveFromCart: (partId: string) => void;
  onClearCart: () => void;
  onCheckoutComplete: (invoice: Invoice) => boolean | void;
  vatRate?: number;            // نسبة الضريبة من إعدادات المحل (%)
  canSellBelowCost?: boolean;  // (غير مستخدم) البيع بأقل من التكلفة ممنوع للجميع حسب سياسة الخصم
  employees?: Employee[];      // للتحقق من باسورد المالك عند فتح تعديل السعر
  warehouses?: Warehouse[];    // المخازن/الفروع (لو فيه أكثر من مخزن يظهر اختيار مخزن البيع)
  stockLevels?: StockLevel[];
  loyalty?: LoyaltySettings;   // برنامج الولاء (غير ممرَّر أو مغلق = لا يظهر)
  maxDiscountPercent?: number; // الحد الأقصى للخصم % (افتراضي 10)
  cashierName?: string;
  cashierId?: string;
  onOpenVoiceAssistant?: () => void;
  onOpenReturns?: () => void;
  shiftOpen?: boolean;         // هل توجد وردية مفتوحة؟
  shiftRequired?: boolean;     // هل فتح الوردية إلزامي قبل البيع؟
  onOpenShifts?: () => void;
  carBrands?: string[];
  carModels?: CarModel[];
  invoices?: Invoice[];
  onAddBrand?: (brand: string) => void;
  onRemoveBrand?: (brand: string) => void;
}

export const QuickPosView: React.FC<QuickPosViewProps> = ({
  parts,
  customers,
  cart,
  onAddToCart,
  onUpdateCartQuantity,
  onUpdateCartPrice,
  onRemoveFromCart,
  onClearCart,
  onCheckoutComplete,
  vatRate = 14,
  canSellBelowCost = false,
  employees = [],
  warehouses = [],
  stockLevels = [],
  loyalty,
  maxDiscountPercent = 10,
  cashierName,
  cashierId,
  onOpenVoiceAssistant,
  onOpenReturns,
  shiftOpen = true,
  shiftRequired = false,
  onOpenShifts,
  carBrands = CAR_BRANDS,
  carModels = [],
  invoices = [],
  onAddBrand,
  onRemoveBrand,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<CarBrand>('شامل');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cash');

  // مخزن البيع: يُحفظ على هذا الجهاز (كاشير كل فرع يبيع من مخزنه)
  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.active), [warehouses]);
  const [warehouseChoice, setWarehouseChoice] = useState<string>(() => {
    try { return localStorage.getItem('malvia.pos.warehouse') || MAIN_WAREHOUSE_ID; } catch { return MAIN_WAREHOUSE_ID; }
  });
  const saleWarehouseId =
    warehouseChoice === MAIN_WAREHOUSE_ID || activeWarehouses.some((w) => w.id === warehouseChoice) ? warehouseChoice : MAIN_WAREHOUSE_ID;
  const chooseWarehouse = (id: string) => {
    setWarehouseChoice(id);
    try { localStorage.setItem('malvia.pos.warehouse', id); } catch { /* ignore */ }
  };
  const stockHere = (p: AutoPart): number => availableIn(p.stockQuantity, stockLevels, p.id, saleWarehouseId);
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const loyaltyCfg = resolveLoyalty(loyalty);
  useEffect(() => { setRedeemPoints(0); }, [selectedCustomerId, cart.length]);
  const [customerNameInput, setCustomerNameInput] = useState('زبون نقدي (قطاعي)');
  const [carDetailsInput, setCarDetailsInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [carBrandInput, setCarBrandInput] = useState('');
  const [carModelInput, setCarModelInput] = useState('');
  const [carYearInput, setCarYearInput] = useState('');

  // موديلات الماركة المختارة (من قائمة موديلات السيارات المسجلة بالمخزن)
  const modelsForBrand = useMemo(
    () => carModels.filter((m) => m.brand === carBrandInput),
    [carModels, carBrandInput]
  );
  const yearsForModel = useMemo(() => {
    const m = modelsForBrand.find((x) => x.modelName === carModelInput);
    if (!m || !m.yearFrom || !m.yearTo) return [] as number[];
    const list: number[] = [];
    for (let y = m.yearTo; y >= m.yearFrom && list.length < 60; y--) list.push(y);
    return list;
  }, [modelsForBrand, carModelInput]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // قفل تعديل السعر: يُفتح بباسورد المالك لفاتورة واحدة فقط ثم يُقفل تلقائياً
  const [priceUnlocked, setPriceUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [ownerPass, setOwnerPass] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);

  useEffect(() => {
    if (cart.length === 0) setPriceUnlocked(false);
  }, [cart.length]);

  const closeUnlockModal = () => {
    setShowUnlockModal(false);
    setOwnerPass('');
    setUnlockError('');
  };

  const handleUnlockPrices = async () => {
    setUnlockBusy(true);
    setUnlockError('');
    try {
      const owner = await verifyOwnerPassword(employees, ownerPass);
      if (!owner) { setUnlockError('باسورد المالك غير صحيح'); return; }
      setPriceUnlocked(true);
      closeUnlockModal();
    } finally {
      setUnlockBusy(false);
    }
  };

  // أقل سعر مسموح للقطعة: لا يقل عن التكلفة ولا عن (100 - الحد الأقصى للخصم)% من سعرها الأصلي
  const minAllowedPrice = (part: AutoPart): number =>
    Math.max(part.costPrice, Math.ceil(part.salePrice * (100 - maxDiscountPercent)) / 100);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('كاش (نقدي)');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [splitEnabled, setSplitEnabled] = useState<boolean>(false);
  const [splitMethod, setSplitMethod] = useState<string>('فيزا / بطاقة بنكية');
  const [splitAmount, setSplitAmount] = useState<string>('');
  const [saleError, setSaleError] = useState<string>('');
  const [applyVat, setApplyVat] = useState<boolean>(false);

  const brandCounts = useMemo(() => {
    const m: Record<string, number> = {};
    parts.forEach((p) => { m[p.brand] = (m[p.brand] || 0) + 1; });
    return m;
  }, [parts]);

  const filteredParts = useMemo(() => {
    return parts.filter((part) => {
      if (selectedBrand !== 'شامل' && part.brand !== selectedBrand) return false;
      if (selectedCategory !== 'الكل' && part.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          part.partNumber.toLowerCase().includes(q) ||
          (part.barcode || '').toLowerCase().includes(q) ||
          part.name.includes(q) ||
          part.compatibleModels.includes(q) ||
          part.shelfLocation.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [parts, selectedBrand, selectedCategory, searchQuery]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const effectivePrice = item.customPrice !== undefined ? item.customPrice : item.part.salePrice;
      return acc + (effectivePrice * item.quantity);
    }, 0);
  }, [cart]);

  // أقصى خصم للفاتورة: ضمن حد الخصم الكلي (شامل أي تخفيض في أسعار الأصناف) ولا يهبط بالصافي تحت إجمالي التكلفة
  const maxInvoiceDiscount = useMemo(() => {
    const listTotal = cart.reduce((a, i) => a + i.part.salePrice * i.quantity, 0);
    const costTotal = cart.reduce((a, i) => a + i.part.costPrice * i.quantity, 0);
    const byPercent = listTotal * (maxDiscountPercent / 100) - (listTotal - subtotal);
    const byCost = subtotal - costTotal;
    return Math.max(0, Math.floor(Math.min(byPercent, byCost) * 100) / 100);
  }, [cart, subtotal, maxDiscountPercent]);

  const discount = Math.min(subtotal, Math.max(0, discountAmount));

  // استبدال نقاط الولاء: جزء من إجمالي الخصم، فيخضع لنفس سقف الخصم وحد التكلفة
  const customerPoints = Math.max(0, selectedCustomer?.loyaltyPoints ?? 0);
  const loyaltyActive = loyaltyCfg.enabled && Boolean(selectedCustomer);
  const maxPts = loyaltyActive
    ? maxRedeemablePoints({ balance: customerPoints, pointValueEgp: loyaltyCfg.pointValueEgp, minRedeemPoints: loyaltyCfg.minRedeemPoints, capEgp: Math.max(0, maxInvoiceDiscount - discount) })
    : 0;
  const redeemUsed = loyaltyActive && redeemPoints >= loyaltyCfg.minRedeemPoints ? Math.min(Math.floor(redeemPoints), maxPts) : 0;
  const loyaltyDiscount = pointsValue(redeemUsed, loyaltyCfg.pointValueEgp);
  const discountAll = Math.min(subtotal, Math.round((discount + loyaltyDiscount) * 100) / 100);

  const taxableAmount = Math.max(0, subtotal - discountAll);
  const tax = applyVat ? Math.round((taxableAmount * vatRate) / 100 * 100) / 100 : 0;
  const grandTotal = Math.round((taxableAmount + tax) * 100) / 100;

  // الدفع المقسّم: الطريقة الأساسية تغطي الباقي بعد المبلغ الثاني
  const splitValue = splitEnabled ? Math.min(grandTotal, Math.max(0, Number(splitAmount) || 0)) : 0;
  const primaryValue = Math.round((grandTotal - splitValue) * 100) / 100;

  const changeDue = paymentMethod === 'كاش (نقدي)' && Number(cashGiven) > primaryValue
    ? Number(cashGiven) - primaryValue
    : 0;

  const handleCompleteSale = () => {
    if (cart.length === 0) return;
    setSaleError('');

    const payments = splitEnabled && splitValue > 0
      ? [{ method: paymentMethod as string, amount: primaryValue }, { method: splitMethod, amount: splitValue }]
      : [{ method: paymentMethod as string, amount: grandTotal }];

    // تحقق قبل أي تأثير: رصيد، أسعار، خصم، دفع، آجل
    try {
      const lines = cart.map((item) => ({
        partId: item.part.id,
        qty: item.quantity,
        unitPrice: item.customPrice !== undefined ? item.customPrice : item.part.salePrice,
        unitCost: item.part.costPrice,
      }));
      validateDiscountPolicy(
        cart.map((item) => ({
          qty: item.quantity,
          listPrice: item.part.salePrice,
          unitPrice: item.customPrice !== undefined ? item.customPrice : item.part.salePrice,
          unitCost: item.part.costPrice,
        })),
        discountAll,
        maxDiscountPercent
      );
      const totals = computeTotals(lines, discountAll, vatRate, applyVat);
      const hasCredit = payments.some((p) => isCreditPayment(p.method));
      const hasNewName = selectedCustomerId === 'cash' && customerNameInput.trim().length > 0;
      validateSale(
        lines,
        parts.map((p) => ({ id: p.id, stockQuantity: stockHere(p) })),
        totals,
        payments,
        {
          allowBelowCost: false, // سياسة المحل: لا بيع بأقل من التكلفة لأي مستخدم
          customerId: hasCredit ? (selectedCustomerId !== 'cash' ? selectedCustomerId : hasNewName ? 'new' : undefined) : undefined,
          customerBalance: selectedCustomer?.balance ?? 0,
          customerCreditLimit: selectedCustomer?.creditLimit ?? 0,
        }
      );
    } catch (e) {
      const code = e instanceof SaleError ? e.code : 'UNKNOWN';
      const messages: Record<string, string> = {
        OUT_OF_STOCK: activeWarehouses.length > 0 ? 'الكمية المطلوبة أكبر من الرصيد المتاح في هذا المخزن لأحد الأصناف' : 'الكمية المطلوبة أكبر من الرصيد المتاح لأحد الأصناف',
        PRICE_BELOW_COST: 'لا يمكن البيع بأقل من سعر التكلفة',
        DISCOUNT_OVER_LIMIT: `الخصم أكبر من الحد المسموح (${maxDiscountPercent}%)`,
        INVALID_QTY: 'كمية غير صالحة في الفاتورة',
        INVALID_PRICE: 'سعر غير صالح في الفاتورة',
        DISCOUNT_EXCEEDS_SUBTOTAL: 'الخصم أكبر من قيمة الفاتورة',
        PAYMENT_MISMATCH: 'مجموع المدفوعات لا يساوي إجمالي الفاتورة',
        CREDIT_REQUIRES_CUSTOMER: 'البيع الآجل يتطلب اختيار عميل أو كتابة اسمه',
        CREDIT_LIMIT_EXCEEDED: `البيع الآجل يتجاوز حد ائتمان العميل (الحد ${(selectedCustomer?.creditLimit ?? 0).toLocaleString()} ج.م، مديونيته الحالية ${Math.max(0, selectedCustomer?.balance ?? 0).toLocaleString()} ج.م)`,
        EMPTY_CART: 'السلة فارغة',
      };
      setSaleError(messages[code] || 'تعذّر إتمام الفاتورة');
      return;
    }

    const customerObj = customers.find((c) => c.id === selectedCustomerId);
    const finalCustomerName = selectedCustomerId === 'cash' ? customerNameInput : customerObj?.name || customerNameInput;
    const finalCustomerType = customerObj?.type === 'ورشة فنية' ? 'ورشة' : 'تجزئة';

    const phone = customerPhoneInput.trim() || customerObj?.phone || '';
    const carDetailsFull = [carBrandInput, carModelInput.trim(), carYearInput.trim(), carDetailsInput.trim()]
      .filter(Boolean)
      .join(' ');

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: nextSalesInvoiceNumber(invoices),
      warehouseId: saleWarehouseId === MAIN_WAREHOUSE_ID ? undefined : saleWarehouseId,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      customerName: finalCustomerName,
      customerPhone: phone,
      customerId: selectedCustomerId !== 'cash' ? selectedCustomerId : undefined,
      customerType: finalCustomerType,
      carDetails: carDetailsFull || undefined,
      carBrand: carBrandInput || undefined,
      carModel: carModelInput.trim() || undefined,
      carYear: carYearInput.trim() || undefined,
      items: cart.map((item) => {
        const effectivePrice = item.customPrice !== undefined ? item.customPrice : item.part.salePrice;
        return {
          partId: item.part.id,
          partNumber: item.part.partNumber,
          partName: item.part.name,
          quantity: item.quantity,
          unitPrice: effectivePrice,
          originalPrice: item.part.salePrice,
          costPrice: item.part.costPrice,
          total: effectivePrice * item.quantity,
        };
      }),
      subtotal,
      discount: discountAll,
      loyaltyRedeemedPoints: redeemUsed > 0 ? redeemUsed : undefined,
      loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
      tax: Number(tax.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      paymentMethod: payments.length > 1 ? 'مختلط (دفع مقسّم)' : paymentMethod,
      payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
      cashierId,
      cashierName: cashierName || 'كاشير المحل',
      status: 'مسددة',
    };

    const accepted = onCheckoutComplete(newInvoice);
    if (accepted === false) return; // رُفضت الفاتورة (مثلاً رصيد تغيّر): لا نمسح السلة

    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    onClearCart();
    setPriceUnlocked(false);
    setSplitEnabled(false);
    setSplitAmount('');
    setDiscountAmount(0);
    setCashGiven('');
    setCarDetailsInput('');
    setCustomerPhoneInput('');
    setCarBrandInput('');
    setCarModelInput('');
    setCarYearInput('');
  };

  const buildLabel = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-12">
      {activeWarehouses.length > 0 && (
        <div className="lg:col-span-12 flex items-center gap-2 text-xs">
          <span className="font-bold text-neutral-400">البيع من:</span>
          <select
            value={saleWarehouseId}
            onChange={(e) => chooseWarehouse(e.target.value)}
            className="h-8 px-3 rounded-xl bg-surface-1 border border-amber-500/40 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-400"
          >
            <option value={MAIN_WAREHOUSE_ID}>{MAIN_WAREHOUSE_NAME}</option>
            {activeWarehouses.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
          </select>
        </div>
      )}
      <div className="lg:col-span-12 -mb-3 text-[10px] text-neutral-600 flex items-center gap-1.5">
        <Lock className="w-3 h-3" />
        <span>قفل الأسعار مفعّل · حد الخصم {maxDiscountPercent}% · إصدار {buildLabel}</span>
      </div>
      <div className="lg:col-span-7 space-y-4">
        {!shiftOpen && onOpenShifts && (
          <button
            onClick={onOpenShifts}
            className={`w-full p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 text-right transition-all ${
              shiftRequired
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20'
            }`}
          >
            <span>
              {shiftRequired
                ? 'مفيش وردية مفتوحة — لازم تفتح وردية وتعدّ كاش الدرج قبل البيع'
                : 'مفيش وردية مفتوحة — المبيعات مش هتتحسب على درج وردية. افتح وردية'}
            </span>
            <span className="shrink-0 underline">فتح وردية ›</span>
          </button>
        )}
        <div className="p-3.5 rounded-2xl bg-surface-2 border border-neutral-800 shadow-md flex items-center gap-3">
          <div className="relative flex-grow">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم القطعة أو رقم OEM أو موقع الرف..."
              className="w-full h-11 pr-10 pl-4 rounded-xl bg-surface-1 border border-neutral-700 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          {onOpenVoiceAssistant && (
            <button
              onClick={onOpenVoiceAssistant}
              className="px-3.5 h-11 rounded-xl bg-gradient-to-r from-amber-600 to-amber-600 hover:from-amber-500 hover:to-amber-500 text-[#ffffff] flex items-center gap-2 text-xs font-bold shadow-md transition-all shrink-0 active:scale-95"
              title="تسجيل وتنفيذ عمليات البيع والجرد بصوتك بالذكاء الاصطناعي"
            >
              <Mic className="w-4 h-4 text-amber-300 animate-pulse" />
              <span className="hidden sm:inline">أمر صوتي AI</span>
            </button>
          )}



          {onOpenReturns && (
            <button
              onClick={onOpenReturns}
              className="px-3 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-300 flex items-center gap-1.5 text-xs font-bold transition-all shrink-0"
              title="إجراء مرتجع مبيعات لزبون وصرف النقدية من الخزنة"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مرتجع مبيعات</span>
            </button>
          )}
        </div>

        <BrandBar
          brands={carBrands}
          selected={selectedBrand}
          onSelect={setSelectedBrand}
          onAddBrand={onAddBrand}
          onRemoveBrand={onRemoveBrand}
          countByBrand={brandCounts}
          inactiveClass="bg-surface-2 text-neutral-400 hover:text-white border border-neutral-800"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setSelectedCategory('الكل')}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
              selectedCategory === 'الكل'
                ? 'bg-neutral-200 text-neutral-900 font-bold'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            كافة الأصناف
          </button>
          {PART_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-neutral-200 text-neutral-900 font-bold'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[580px] overflow-y-auto no-scrollbar p-0.5">
          {filteredParts.length === 0 ? (
            <div className="col-span-full py-12 text-center text-xs text-neutral-500 bg-surface-2 rounded-2xl border border-neutral-800">
              لا توجد قطع غيار مطابقة للبحث أو الماركة المحددة
            </div>
          ) : (
            filteredParts.map((part) => {
              const inCartItem = cart.find((item) => item.part.id === part.id);
              return (
                <div
                  key={part.id}
                  onClick={() => onAddToCart(part)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                    inCartItem
                      ? 'bg-amber-950/20 border-amber-500/50 shadow-md shadow-amber-500/5'
                      : 'bg-surface-2 border-neutral-800 hover:border-neutral-700 hover:bg-surface-3'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {part.partNumber}
                      </span>
                      <div className="flex items-center gap-1">
                        {part.isScreenOrDisplay && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-400 bg-neutral-800/80 px-2 py-0.5 rounded-full font-medium">
                          {part.brand}
                        </span>
                      </div>
                    </div>

                    <h4 className="text-xs font-bold text-white mt-1.5 line-clamp-1">
                      {part.name}
                    </h4>

                    <p className="text-[10px] text-neutral-400 mt-0.5 line-clamp-1">
                      {part.compatibleModels}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-black text-white font-mono flex items-baseline gap-1">
                        {part.salePrice.toLocaleString()} <span className="text-[10px] font-bold text-amber-400">ج.م</span>
                      </div>
                      <span className="text-[10px] text-neutral-400">
                        {part.origin} · {part.shelfLocation}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          stockHere(part) <= part.minAlertStock
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {stockHere(part)} {part.unit}
                      </span>

                      <button
                        type="button"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                          inCartItem
                            ? 'bg-amber-500 text-neutral-950 font-black'
                            : 'bg-surface-3 text-neutral-200 hover:bg-amber-500 hover:text-neutral-950'
                        }`}
                      >
                        {inCartItem ? inCartItem.quantity : '+'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-5 bg-surface-2 rounded-3xl border border-neutral-800 p-5 flex flex-col justify-between shadow-xl space-y-4">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">فاتورة البيع الحالية (الكاشير)</h3>
                <span className="text-[10px] text-emerald-400 font-bold block">
                  ★ متاح تعديل سعر البيع مباشرة لكل صنف
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-bold">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} قطعة
              </span>

              {cart.length > 0 && (
                <button
                  onClick={onClearCart}
                  className="text-xs text-rose-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إلغاء</span>
                </button>
              )}
            </div>
          </div>

          <div className="py-3 space-y-2 border-b border-neutral-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-bold">الزبون / الورشة:</span>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCustomerId(id);
                  const c = customers.find((x) => x.id === id);
                  setCustomerPhoneInput(c?.phone || '');
                }}
                className="bg-surface-1 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400"
              >
                <option value="cash">زبون نقدي / قطاعي</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomerId === 'cash' ? (
              <input
                type="text"
                value={customerNameInput}
                onChange={(e) => setCustomerNameInput(e.target.value)}
                placeholder="اسم الزبون (اختياري)..."
                className="w-full h-8 px-3 rounded-lg bg-surface-1 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
              />
            ) : (
              <div className="p-2 rounded-lg bg-surface-1 text-[11px] text-amber-300 flex justify-between">
                <span>رصيد الحساب الآجل (شكك):</span>
                <span className="font-bold">
                  {customers.find((c) => c.id === selectedCustomerId)?.balance.toLocaleString()} ج.م
                </span>
              </div>
            )}
            {selectedCustomer && (selectedCustomer.creditLimit ?? 0) > 0 && (
              <div className="p-2 rounded-lg bg-surface-1 text-[11px] text-sky-300 flex justify-between">
                <span>حد الائتمان / المتاح:</span>
                <span className="font-bold font-mono">
                  {(selectedCustomer.creditLimit as number).toLocaleString()} / {Math.max(0, (selectedCustomer.creditLimit as number) - Math.max(0, selectedCustomer.balance)).toLocaleString()} ج.م
                </span>
              </div>
            )}

            <input
              type="tel"
              inputMode="tel"
              value={customerPhoneInput}
              onChange={(e) => setCustomerPhoneInput(e.target.value)}
              placeholder="رقم تليفون العميل (اختياري)"
              className="w-full h-8 px-3 rounded-lg bg-surface-1 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono"
            />

            <div className="grid grid-cols-3 gap-2">
              <select
                value={carBrandInput}
                onChange={(e) => { setCarBrandInput(e.target.value); setCarModelInput(''); setCarYearInput(''); }}
                className="h-8 px-2 rounded-lg bg-surface-1 border border-neutral-700 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="">ماركة السيارة</option>
                {carBrands.filter((b) => b !== 'شامل').map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <input
                type="text"
                list="pos-car-models"
                value={carModelInput}
                onChange={(e) => { setCarModelInput(e.target.value); setCarYearInput(''); }}
                placeholder={carBrandInput ? 'الموديل' : 'اختر الماركة أولاً'}
                className="h-8 px-2 rounded-lg bg-surface-1 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
              />
              <datalist id="pos-car-models">
                {modelsForBrand.map((m) => (
                  <option key={m.id} value={m.modelName} />
                ))}
              </datalist>

              <input
                type="text"
                inputMode="numeric"
                list="pos-car-years"
                value={carYearInput}
                onChange={(e) => setCarYearInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="السنة"
                className="h-8 px-2 rounded-lg bg-surface-1 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono"
              />
              <datalist id="pos-car-years">
                {yearsForModel.map((y) => (
                  <option key={y} value={String(y)} />
                ))}
              </datalist>
            </div>

            <input
              type="text"
              value={carDetailsInput}
              onChange={(e) => setCarDetailsInput(e.target.value)}
              placeholder="ملاحظات السيارة / رقم اللوحة (اختياري)"
              className="w-full h-8 px-3 rounded-lg bg-surface-1 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="divide-y divide-neutral-800/80 max-h-60 overflow-y-auto no-scrollbar py-2">
            {cart.length === 0 ? (
              <div className="py-10 text-center text-xs text-neutral-500">
                لم تقم بإضافة أي قطعة إلى الفاتورة بعد. اضغط على أي صنف من القائمة لإضافته.
              </div>
            ) : (
              cart.map((item) => {
                const effectivePrice = item.customPrice !== undefined ? item.customPrice : item.part.salePrice;
                const rowTotal = effectivePrice * item.quantity;

                return (
                  <div key={item.part.id} className="py-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-grow min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-amber-400">
                            {item.part.partNumber}
                          </span>
                          <span className="text-xs font-semibold text-white truncate">
                            {item.part.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-1 bg-surface-1 border border-neutral-700 rounded-lg p-0.5">
                          <button
                            onClick={() => onUpdateCartQuantity(item.part.id, item.quantity - 1)}
                            className="w-5 h-5 rounded flex items-center justify-center text-neutral-400 hover:text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xs font-bold text-white min-w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateCartQuantity(item.part.id, item.quantity + 1)}
                            className="w-5 h-5 rounded flex items-center justify-center text-neutral-400 hover:text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => onRemoveFromCart(item.part.id)}
                          className="text-neutral-500 hover:text-rose-400 p-1"
                          title="حذف من الفاتورة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-surface-1 p-2 rounded-xl border border-neutral-800">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-neutral-400 font-bold">سعر البيع للقطعة:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={effectivePrice}
                            readOnly={!priceUnlocked}
                            onChange={(e) => {
                              if (!priceUnlocked) return;
                              const val = parseFloat(e.target.value);
                              onUpdateCartPrice(item.part.id, isNaN(val) ? 0 : val);
                            }}
                            onBlur={() => {
                              // لا نسمح بالخروج من الحقل بسعر أقل من الحد الأدنى المسموح
                              const floor = minAllowedPrice(item.part);
                              if (priceUnlocked && effectivePrice < floor) onUpdateCartPrice(item.part.id, floor);
                            }}
                            className={`w-20 h-6 px-1.5 text-center text-xs font-mono font-bold rounded focus:outline-none ${
                              priceUnlocked
                                ? 'text-amber-300 bg-surface-2 border border-amber-500/50 focus:border-amber-400 focus:bg-surface-3'
                                : 'text-neutral-300 bg-surface-1 border border-neutral-700 cursor-not-allowed'
                            }`}
                            title={priceUnlocked ? 'تعديل سعر البيع (لا يقل عن الحد الأدنى المسموح)' : 'السعر مقفول — يحتاج باسورد المالك'}
                          />
                          <span className="text-[10px] text-neutral-400 font-bold">ج.م</span>
                          {priceUnlocked ? (
                            <button
                              type="button"
                              onClick={() => setPriceUnlocked(false)}
                              className="p-1 rounded text-emerald-400 hover:text-emerald-300"
                              title="إعادة قفل تعديل الأسعار"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowUnlockModal(true)}
                              className="p-1 rounded text-amber-400 hover:text-amber-300"
                              title="فتح تعديل السعر بباسورد المالك"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!priceUnlocked}
                            onClick={() => onUpdateCartPrice(item.part.id, minAllowedPrice(item.part))}
                            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-[9px] text-neutral-300 font-medium"
                            title={priceUnlocked ? 'أقصى خصم مسموح' : 'مقفول — يحتاج باسورد المالك'}
                          >
                            -{maxDiscountPercent}% ورش
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateCartPrice(item.part.id, item.part.salePrice)}
                            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[9px] text-neutral-300 font-medium"
                            title="استعادة السعر الأصلي"
                          >
                            الأصلي
                          </button>
                        </div>
                      </div>

                      <div className="text-left rtl:text-right">
                        <span className="text-xs font-mono font-bold text-white">
                          {rowTotal.toFixed(2)} <span className="text-[10px] text-neutral-400">ج.م</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-neutral-800">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400 font-bold">خصم كلي / فصال من الفاتورة:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max={Math.max(0, maxInvoiceDiscount - loyaltyDiscount)}
                value={discountAmount || ''}
                onChange={(e) => setDiscountAmount(Math.min(Math.max(0, Number(e.target.value) || 0), Math.max(0, maxInvoiceDiscount - loyaltyDiscount)))}
                placeholder="0"
                className="w-20 h-7 px-2 text-left rtl:text-right rounded bg-surface-1 border border-neutral-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
              />
              <span className="text-[10px] text-neutral-400">ج.م</span>
            </div>
          </div>
          {cart.length > 0 && (
            <div className="text-[10px] text-neutral-500 -mt-1">
              الحد الأقصى المسموح للخصم: {maxInvoiceDiscount.toLocaleString()} ج.م ({maxDiscountPercent}% كحد أقصى، ولا يقل عن التكلفة)
            </div>
          )}

          {loyaltyCfg.enabled && selectedCustomer && cart.length > 0 && (
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-300">نقاط الولاء: {customerPoints.toLocaleString()} نقطة</span>
                <span className="text-[10px] text-neutral-400">≈ {pointsValue(customerPoints, loyaltyCfg.pointValueEgp).toLocaleString()} ج.م</span>
              </div>
              {maxPts > 0 ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={maxPts}
                    step="1"
                    value={redeemPoints || ''}
                    onChange={(e) => setRedeemPoints(Math.min(Math.max(0, Math.floor(Number(e.target.value) || 0)), maxPts))}
                    placeholder="نقاط للاستبدال"
                    className="flex-1 h-7 px-2 rounded bg-surface-1 border border-neutral-700 text-white text-xs font-mono focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => setRedeemPoints(maxPts)}
                    className="px-2 h-7 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[10px] font-bold whitespace-nowrap"
                  >
                    الحد الأقصى ({maxPts})
                  </button>
                </div>
              ) : (
                customerPoints > 0 && (
                  <div className="text-[10px] text-neutral-500">
                    الاستبدال يحتاج {loyaltyCfg.minRedeemPoints} نقطة على الأقل، وفي حدود سقف الخصم المتاح للفاتورة.
                  </div>
                )
              )}
              <div className="text-[10px] text-emerald-400">
                سيكسب العميل {earnedPoints(grandTotal, loyaltyCfg.egpPerPoint)} نقطة من هذه الفاتورة
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-2 rounded-xl bg-surface-1 border border-neutral-700/80 text-xs">
            <div className="flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-neutral-300 font-bold">ضريبة القيمة المضافة ({vatRate}%):</span>
            </div>
            <button
              type="button"
              onClick={() => setApplyVat(!applyVat)}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all border ${
                applyVat
                  ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-sm'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
              }`}
            >
              {applyVat ? `مطبقة (+${vatRate}%) ✓` : 'بدون ضريبة (0%)'}
            </button>
          </div>

          <div className="space-y-1 text-xs text-neutral-400 border-t border-neutral-800/60 pt-2">
            <div className="flex justify-between">
              <span>المجموع قبل الضريبة:</span>
              <span className="text-white font-mono">{subtotal.toFixed(2)} ج.م</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-rose-400">
                <span>الخصم / التخفيض:</span>
                <span className="font-mono">-{discount.toFixed(2)} ج.م</span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-sky-300">
                <span>خصم نقاط الولاء ({redeemUsed} نقطة):</span>
                <span className="font-mono">-{loyaltyDiscount.toFixed(2)} ج.م</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>ضريبة القيمة المضافة:</span>
              <span className={`font-mono ${applyVat ? 'text-amber-400 font-bold' : 'text-neutral-500'}`}>
                {applyVat ? `${tax.toFixed(2)} ج.م (${vatRate}%)` : 'معفى / 0.00 ج.م'}
              </span>
            </div>
            <div className="flex justify-between text-base font-black text-white pt-1.5 border-t border-neutral-800">
              <span>الإجمالي النهائي المستحق:</span>
              <span className="text-amber-400 font-mono text-lg">{grandTotal.toFixed(2)} ج.م</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-neutral-400 font-bold block">طريقة الدفع والتوريد للخزنة:</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'كاش (نقدي)', label: 'كاش (نقدي)', icon: Banknote },
                { id: 'إنستاباي / InstaPay', label: 'إنستاباي (Instapay)', icon: Zap },
                { id: 'فودافون كاش ومحافظ إلكترونية', label: 'فودافون كاش ومحافظ', icon: Smartphone },
                { id: 'فيزا / بطاقة بنكية', label: 'فيزا / بنك', icon: CreditCard },
                { id: 'آجل (شكك / حساب ورشة)', label: 'شكك / آجل ورشة', icon: Clock },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-sm'
                        : 'bg-surface-1 text-neutral-300 border-neutral-700 hover:border-neutral-600'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-1 border border-neutral-700 space-y-2 text-xs">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-neutral-300 font-bold">دفع مقسّم (جزء بطريقة وجزء بأخرى)</span>
              <input type="checkbox" checked={splitEnabled} onChange={(e) => setSplitEnabled(e.target.checked)} className="w-4 h-4 accent-amber-400" />
            </label>
            {splitEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={splitMethod}
                  onChange={(e) => setSplitMethod(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-surface-2 border border-neutral-600 text-white text-xs"
                >
                  <option value="كاش (نقدي)">كاش (نقدي)</option>
                  <option value="إنستاباي / InstaPay">إنستاباي</option>
                  <option value="فودافون كاش ومحافظ إلكترونية">محفظة إلكترونية</option>
                  <option value="فيزا / بطاقة بنكية">فيزا / بنك</option>
                  <option value="آجل (شكك / حساب ورشة)">آجل (حساب ورشة)</option>
                </select>
                <input
                  type="number"
                  min="0"
                  value={splitAmount}
                  onChange={(e) => setSplitAmount(e.target.value)}
                  placeholder="المبلغ بالطريقة الثانية"
                  className="h-8 px-2 rounded-lg bg-surface-2 border border-neutral-600 text-white text-xs font-mono"
                />
                <p className="col-span-2 text-[11px] text-neutral-400">
                  الطريقة الأولى المختارة أعلاه: <b className="text-amber-400 font-mono">{primaryValue.toFixed(2)}</b> ج.م
                  {' · '}الثانية: <b className="text-amber-400 font-mono">{splitValue.toFixed(2)}</b> ج.م
                </p>
              </div>
            )}
          </div>

          {paymentMethod === 'كاش (نقدي)' && (
            <div className="p-2.5 rounded-xl bg-surface-1 border border-neutral-700 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">المبلغ المستلم من الزبون:</span>
                <input
                  type="number"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  placeholder="المبلغ المدفوع كاش..."
                  className="w-24 h-7 px-2 rounded bg-surface-2 border border-neutral-600 text-white text-xs font-mono text-left rtl:text-right"
                />
              </div>
              {changeDue > 0 && (
                <div className="flex justify-between font-bold text-emerald-400">
                  <span>باقي الزبون (يرد من درج الكاش):</span>
                  <span className="font-mono">{changeDue.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>
          )}

          {saleError && (
            <div role="alert" className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold">
              {saleError}
            </div>
          )}

          <button
            onClick={handleCompleteSale}
            disabled={cart.length === 0}
            className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
          >
            <Check className="w-5 h-5 stroke-[2.5]" />
            <span>إصدار بون البيع وإيداع الكاش بالخزنة ({grandTotal.toFixed(2)} ج.م)</span>
          </button>
        </div>
      </div>

      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeUnlockModal}>
          <div
            className="w-full max-w-sm rounded-2xl bg-surface-1 border border-amber-500/40 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <ShieldCheck className="w-5 h-5" />
                <span>تعديل السعر — باسورد المالك</span>
              </div>
              <button type="button" onClick={closeUnlockModal} className="text-neutral-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-neutral-400">
              أدخل باسورد المالك لفتح تعديل السعر لهذه الفاتورة. بعد إتمام الفاتورة يُقفل التعديل تلقائياً.
            </p>
            <input
              type="password"
              autoFocus
              value={ownerPass}
              onChange={(e) => { setOwnerPass(e.target.value); setUnlockError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && ownerPass.trim() && !unlockBusy) handleUnlockPrices(); }}
              placeholder="باسورد المالك"
              className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-sm text-white focus:outline-none focus:border-amber-400"
            />
            {unlockError && <div className="text-[11px] font-bold text-rose-400">{unlockError}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUnlockPrices}
                disabled={!ownerPass.trim() || unlockBusy}
                className="flex-1 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-black"
              >
                {unlockBusy ? 'جارٍ التحقق...' : 'فتح التعديل'}
              </button>
              <button
                type="button"
                onClick={closeUnlockModal}
                className="px-4 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
