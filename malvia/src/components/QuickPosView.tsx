import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AutoPart, CartItem, Customer, Invoice, CarBrand, PartCategory, PaymentMethod } from '../types/autoParts';
import { CAR_BRANDS, PART_CATEGORIES } from '../data/autoPartsData';

interface QuickPosViewProps {
  parts: AutoPart[];
  customers: Customer[];
  cart: CartItem[];
  onAddToCart: (part: AutoPart) => void;
  onUpdateCartQuantity: (partId: string, quantity: number) => void;
  onUpdateCartPrice: (partId: string, price: number) => void;
  onRemoveFromCart: (partId: string) => void;
  onClearCart: () => void;
  onCheckoutComplete: (invoice: Invoice) => void;
  onOpenVoiceAssistant?: () => void;
  onOpenReturns?: () => void;
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
  onOpenVoiceAssistant,
  onOpenReturns,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<CarBrand>('شامل');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cash');
  const [customerNameInput, setCustomerNameInput] = useState('زبون نقدي (قطاعي)');
  const [carDetailsInput, setCarDetailsInput] = useState('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('كاش (نقدي)');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [applyVat, setApplyVat] = useState<boolean>(false);

  const filteredParts = useMemo(() => {
    return parts.filter((part) => {
      if (selectedBrand !== 'شامل' && part.brand !== selectedBrand) return false;
      if (selectedCategory !== 'الكل' && part.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          part.partNumber.toLowerCase().includes(q) ||
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

  const discount = Math.min(subtotal, Math.max(0, discountAmount));
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = applyVat ? taxableAmount * 0.14 : 0;
  const grandTotal = taxableAmount + tax;

  const changeDue = paymentMethod === 'كاش (نقدي)' && Number(cashGiven) > grandTotal
    ? Number(cashGiven) - grandTotal
    : 0;

  const handleCompleteSale = () => {
    if (cart.length === 0) return;

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
    });

    const customerObj = customers.find((c) => c.id === selectedCustomerId);
    const finalCustomerName = selectedCustomerId === 'cash' ? customerNameInput : customerObj?.name || customerNameInput;
    const finalCustomerType = customerObj?.type === 'ورشة فنية' ? 'ورشة' : 'تجزئة';

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      customerName: finalCustomerName,
      customerPhone: customerObj?.phone || '',
      customerType: finalCustomerType,
      carDetails: carDetailsInput || undefined,
      items: cart.map((item) => {
        const effectivePrice = item.customPrice !== undefined ? item.customPrice : item.part.salePrice;
        return {
          partNumber: item.part.partNumber,
          partName: item.part.name,
          quantity: item.quantity,
          unitPrice: effectivePrice,
          originalPrice: effectivePrice,
          total: effectivePrice * item.quantity,
        };
      }),
      subtotal,
      discount,
      tax: Number(tax.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      paymentMethod,
      cashierName: 'كاشير المحل',
      status: 'مسددة',
    };

    onCheckoutComplete(newInvoice);
    onClearCart();
    setDiscountAmount(0);
    setCashGiven('');
    setCarDetailsInput('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-12">
      <div className="lg:col-span-7 space-y-4">
        <div className="p-3.5 rounded-2xl bg-[#141926] border border-neutral-800 shadow-md flex items-center gap-3">
          <div className="relative flex-grow">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم القطعة أو رقم OEM أو موقع الرف..."
              className="w-full h-11 pr-10 pl-4 rounded-xl bg-[#0E121B] border border-neutral-700 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          {onOpenVoiceAssistant && (
            <button
              onClick={onOpenVoiceAssistant}
              className="px-3.5 h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center gap-2 text-xs font-bold shadow-md transition-all shrink-0 active:scale-95"
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

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {CAR_BRANDS.map((brand) => (
            <button
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedBrand === brand
                  ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                  : 'bg-[#141926] text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>

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
            <div className="col-span-full py-12 text-center text-xs text-neutral-500 bg-[#141926] rounded-2xl border border-neutral-800">
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
                      : 'bg-[#141926] border-neutral-800 hover:border-neutral-700 hover:bg-[#181f30]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {part.partNumber}
                      </span>
                      <div className="flex items-center gap-1">
                        {part.isScreenOrDisplay && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
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
                          part.stockQuantity <= part.minAlertStock
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {part.stockQuantity} {part.unit}
                      </span>

                      <button
                        type="button"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                          inCartItem
                            ? 'bg-amber-500 text-neutral-950 font-black'
                            : 'bg-[#222A3C] text-neutral-200 hover:bg-amber-500 hover:text-neutral-950'
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

      <div className="lg:col-span-5 bg-[#141926] rounded-3xl border border-neutral-800 p-5 flex flex-col justify-between shadow-xl space-y-4">
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
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="bg-[#0E121B] border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400"
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
                className="w-full h-8 px-3 rounded-lg bg-[#0E121B] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
              />
            ) : (
              <div className="p-2 rounded-lg bg-[#0E121B] text-[11px] text-amber-300 flex justify-between">
                <span>رصيد الحساب الآجل (شكك):</span>
                <span className="font-bold">
                  {customers.find((c) => c.id === selectedCustomerId)?.balance.toLocaleString()} ج.م
                </span>
              </div>
            )}

            <input
              type="text"
              value={carDetailsInput}
              onChange={(e) => setCarDetailsInput(e.target.value)}
              placeholder="بيانات العربية (مثال: كورولا 2021 فيراني - لوحة س ن ص 182)"
              className="w-full h-8 px-3 rounded-lg bg-[#0E121B] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
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
                        <div className="flex items-center gap-1 bg-[#0E121B] border border-neutral-700 rounded-lg p-0.5">
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

                    <div className="flex items-center justify-between bg-[#0E121B] p-2 rounded-xl border border-neutral-800">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-neutral-400 font-bold">سعر البيع للقطعة:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={effectivePrice}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              onUpdateCartPrice(item.part.id, isNaN(val) ? 0 : val);
                            }}
                            className="w-20 h-6 px-1.5 text-center text-xs font-mono font-bold text-amber-300 bg-[#161C2C] border border-amber-500/50 rounded focus:border-amber-400 focus:bg-[#1E273D] focus:outline-none"
                            title="تعديل سعر البيع مباشرة لهذه الفاتورة"
                          />
                          <span className="text-[10px] text-neutral-400 font-bold">ج.م</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onUpdateCartPrice(item.part.id, Math.round(item.part.salePrice * 0.9))}
                            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[9px] text-neutral-300 font-medium"
                            title="خصم 10% جملة ورش"
                          >
                            -10% ورش
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
                value={discountAmount || ''}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                placeholder="0"
                className="w-20 h-7 px-2 text-left rtl:text-right rounded bg-[#0E121B] border border-neutral-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
              />
              <span className="text-[10px] text-neutral-400">ج.م</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-[#0E121B] border border-neutral-700/80 text-xs">
            <div className="flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-neutral-300 font-bold">ضريبة القيمة المضافة (14%):</span>
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
              {applyVat ? 'مطبقة (+14%) ✓' : 'بدون ضريبة (0%)'}
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
            <div className="flex justify-between">
              <span>ضريبة القيمة المضافة:</span>
              <span className={`font-mono ${applyVat ? 'text-amber-400 font-bold' : 'text-neutral-500'}`}>
                {applyVat ? `${tax.toFixed(2)} ج.م (14%)` : 'معفى / 0.00 ج.م'}
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
                        : 'bg-[#0E121B] text-neutral-300 border-neutral-700 hover:border-neutral-600'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethod === 'كاش (نقدي)' && (
            <div className="p-2.5 rounded-xl bg-[#0E121B] border border-neutral-700 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">المبلغ المستلم من الزبون:</span>
                <input
                  type="number"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  placeholder="المبلغ المدفوع كاش..."
                  className="w-24 h-7 px-2 rounded bg-[#161C2C] border border-neutral-600 text-white text-xs font-mono text-left rtl:text-right"
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
    </div>
  );
};
