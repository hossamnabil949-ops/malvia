import React, { useState, useMemo } from 'react';
import { 
  X, 
  Bell, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Boxes, 
  Plus, 
  Printer, 
  Copy, 
  Check, 
  ShoppingCart, 
  ArrowRight,
  TrendingDown,
  Warehouse,
  Filter,
  Truck,
  MinusCircle,
  RotateCcw
} from 'lucide-react';
import { AutoPart } from '../types/autoParts';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  onUpdateStock: (partId: string, addedStock: number) => void;
  onQuickSalePart: (part: AutoPart) => void;
  onNavigateToInventory: () => void;
  chequesAttention?: { count: number; overdue: number };  // شيكات تستحق خلال 3 أيام أو متأخرة
  onNavigateToCheques?: () => void;
  expiryAttention?: { expired: number; soon: number };   // دفعات منتهية أو تنتهي خلال 30 يوماً
  onNavigateToTracking?: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  parts,
  onUpdateStock,
  onQuickSalePart,
  onNavigateToInventory,
  chequesAttention,
  onNavigateToCheques,
  expiryAttention,
  onNavigateToTracking,
}) => {
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [copiedSupplierList, setCopiedSupplierList] = useState(false);
  const [restockInputs, setRestockInputs] = useState<Record<string, number>>({});
  const [successRestockId, setSuccessRestockId] = useState<string | null>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  // أصناف أُلغيت من طلب التوريد (لا تظهر في الطلب المنسوخ أو المطبوع ولا في الإجماليات)
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const outOfStockParts = useMemo(() => {
    return parts.filter((p) => p.stockQuantity <= 0);
  }, [parts]);

  const filteredParts = useMemo(() => {
    return outOfStockParts.filter((p) => selectedBrand === 'all' || p.brand === selectedBrand);
  }, [outOfStockParts, selectedBrand]);

  const availableBrands = useMemo(() => {
    const brands = new Set(outOfStockParts.map((p) => p.brand));
    return Array.from(brands);
  }, [outOfStockParts]);

  const neededQty = (p: AutoPart) => restockInputs[p.id] ?? 1;

  // الأصناف المطلوبة فعلاً في طلب التوريد (بعد استبعاد الملغي منها)
  const orderParts = useMemo(
    () => outOfStockParts.filter((p) => !excludedIds.includes(p.id)),
    [outOfStockParts, excludedIds]
  );

  const toggleExcluded = (partId: string) => {
    setExcludedIds((prev) => (prev.includes(partId) ? prev.filter((id) => id !== partId) : [...prev, partId]));
  };

  const totalDeficitUnits = useMemo(() => {
    return orderParts.reduce((sum, p) => sum + neededQty(p), 0);
  }, [orderParts, restockInputs]);

  const estimatedRestockCost = useMemo(() => {
    return orderParts.reduce((sum, p) => sum + neededQty(p) * p.costPrice, 0);
  }, [orderParts, restockInputs]);

  if (!isOpen) return null;

  const handleRestock = (part: AutoPart) => {
    const qty = restockInputs[part.id] ?? 1;
    if (qty <= 0) return;
    onUpdateStock(part.id, qty);
    setSuccessRestockId(part.id);
    setTimeout(() => {
      setSuccessRestockId(null);
    }, 2500);
  };

  const handleSetRestockQty = (partId: string, qty: number) => {
    setRestockInputs((prev) => ({
      ...prev,
      [partId]: Math.max(1, qty),
    }));
  };

  const handleCopySupplierRequisition = () => {
    const dateStr = new Date().toLocaleDateString('ar-EG');
    let text = `📦 *طلب توريد ونواقص قطع غيار - ${dateStr}*\n`;
    text += `إجمالي الأصناف المطلوبة: ${orderParts.length} صنف\n`;
    text += `------------------------------------\n`;
    
    orderParts.forEach((p, idx) => {
      const needed = neededQty(p);
      text += `${idx + 1}. [${p.partNumber}] ${p.name}\n`;
      text += `   - الماركة: ${p.brand} | التوافق: ${p.compatibleModels}\n`;
      text += `   - المتوفر حالياً: ${p.stockQuantity} ${p.unit} (الحد الأدنى: ${p.minAlertStock})\n`;
      text += `   - الكمية المطلوبة للتوريد: *${needed} ${p.unit}*\n\n`;
    });

    text += `يرجى موافاتنا بالأسعار وموعد التسليم. شكراً لكم.`;

    navigator.clipboard.writeText(text);
    setCopiedSupplierList(true);
    setTimeout(() => setCopiedSupplierList(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl max-h-[92vh] rounded-3xl bg-surface-2 border border-neutral-800 shadow-2xl flex flex-col text-neutral-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-neutral-800 bg-gradient-to-r from-surface-3 via-surface-2 to-surface-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 relative">
              <Bell className="w-6 h-6" />
              {outOfStockParts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-bold text-[#ffffff] items-center justify-center">
                    {outOfStockParts.length}
                  </span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">
                  مركز إشعارات الأصناف المستنفدة
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {outOfStockParts.length} أصناف مستنفدة
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                تنبيهات الأصناف التي نفد رصيدها بالكامل. الأصناف تحت الحد الأدنى مع وجود رصيد تظهر في قسم المخزون الحرج.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrintView(!showPrintView)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-xs font-bold text-neutral-200 border border-neutral-700 transition-colors"
              title="طباعة أمر الشراء"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>{showPrintView ? 'العودة للقائمة' : 'طباعة أمر شراء'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {chequesAttention && chequesAttention.count > 0 && onNavigateToCheques && !showPrintView && (
          <div className="px-5 sm:px-6 py-3 border-b border-neutral-800 bg-indigo-500/10 flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-indigo-200">
              {chequesAttention.count} شيك يستحق خلال 3 أيام أو متأخر
              {chequesAttention.overdue > 0 && <span className="text-rose-300"> (منها {chequesAttention.overdue} متأخر)</span>}
            </div>
            <button type="button" onClick={onNavigateToCheques} className="px-3 h-8 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/40 text-indigo-100 text-xs font-bold">
              فتح الشيكات
            </button>
          </div>
        )}

        {expiryAttention && (expiryAttention.expired + expiryAttention.soon) > 0 && onNavigateToTracking && !showPrintView && (
          <div className="px-5 sm:px-6 py-3 border-b border-neutral-800 bg-rose-500/10 flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-rose-200">
              {expiryAttention.expired > 0 && <span>{expiryAttention.expired} دفعة منتهية الصلاحية</span>}
              {expiryAttention.expired > 0 && expiryAttention.soon > 0 && <span> · </span>}
              {expiryAttention.soon > 0 && <span className="text-amber-200">{expiryAttention.soon} دفعة تنتهي خلال 30 يوماً</span>}
            </div>
            <button type="button" onClick={onNavigateToTracking} className="px-3 h-8 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 text-xs font-bold">
              فتح الدفعات
            </button>
          </div>
        )}

        {showPrintView ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 paper bg-white text-neutral-900 font-sans">
            <div className="flex justify-between items-start border-b-2 border-neutral-800 pb-4">
              <div>
                <h2 className="text-xl font-bold">أمر شراء ونواقص مستودع قطع الغيار</h2>
                <p className="text-xs text-neutral-600 mt-1">
                  تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')} - {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="text-left">
                <span className="text-sm font-bold block">مؤسسة مبيعات قطع الغيار</span>
                <span className="text-xs text-neutral-500">قسم إدارة المخزون والمشتريات</span>
              </div>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-300">
                  <th className="p-2 text-right">#</th>
                  <th className="p-2 text-right">رقم القطعة OEM</th>
                  <th className="p-2 text-right">اسم القطعة</th>
                  <th className="p-2 text-right">الماركة والموديل</th>
                  <th className="p-2 text-center">الموقع</th>
                  <th className="p-2 text-center">المتوفر</th>
                  <th className="p-2 text-center">الحد الأدنى</th>
                  <th className="p-2 text-center font-bold text-black">الكمية المطلوبة</th>
                  <th className="p-2 text-left">التكلفة التقديرية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {orderParts.map((p, index) => {
                  const needed = neededQty(p);
                  return (
                    <tr key={p.id}>
                      <td className="p-2">{index + 1}</td>
                      <td className="p-2 font-mono font-bold">{p.partNumber}</td>
                      <td className="p-2 font-bold">{p.name}</td>
                      <td className="p-2">{p.brand} ({p.compatibleModels})</td>
                      <td className="p-2 text-center">{p.shelfLocation}</td>
                      <td className={`p-2 text-center font-bold ${p.stockQuantity <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                        {p.stockQuantity} {p.unit}
                      </td>
                      <td className="p-2 text-center text-neutral-600">{p.minAlertStock}</td>
                      <td className="p-2 text-center font-bold text-amber-700 bg-amber-50">
                        {needed} {p.unit}
                      </td>
                      <td className="p-2 text-left font-mono">
                        {(needed * p.costPrice).toLocaleString()} ج.م
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-800">
                  <td colSpan={7} className="p-2.5 text-right">الإجمالي التقديري لطلب الشراء:</td>
                  <td className="p-2.5 text-center text-amber-800">{totalDeficitUnits} قطعة</td>
                  <td className="p-2.5 text-left font-mono text-emerald-800">{estimatedRestockCost.toLocaleString()} ج.م</td>
                </tr>
              </tfoot>
            </table>

            <div className="flex justify-between items-center pt-8 border-t border-neutral-300 text-xs text-neutral-600">
              <div>
                <p className="font-bold">توقيع مسؤول المخزن والمشتريات:</p>
                <div className="mt-8 border-b border-neutral-400 w-48"></div>
              </div>
              <div>
                <p className="font-bold">اعتماد الإدارة المالية:</p>
                <div className="mt-8 border-b border-neutral-400 w-48"></div>
              </div>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-neutral-800"
              >
                <Printer className="w-4 h-4" />
                <span>إرسال لأمر الطباعة</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 bg-surface-2 border-b border-neutral-800/80 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-surface-1 border border-rose-500/20">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span>نفد بالكامل (0 حبة)</span>
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-xl font-black text-rose-400 font-mono mt-1">
                  {outOfStockParts.length}{' '}
                  <span className="text-xs font-normal text-neutral-400">صنف</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-surface-1 border border-amber-500/20">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span>القطع المطلوبة للتوريد ({orderParts.length} صنف)</span>
                  <Boxes className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-black text-amber-400 font-mono mt-1">
                  {totalDeficitUnits}{' '}
                  <span className="text-xs font-normal text-neutral-400">قطعة</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-surface-1 border border-emerald-500/20">
                <div className="flex items-center justify-between text-neutral-400 text-xs">
                  <span>التكلفة التقديرية للتوريد</span>
                  <Truck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                  {estimatedRestockCost.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-neutral-400">ج.م</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-b border-neutral-800 bg-surface-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  الأصناف المستنفدة بالكامل ({outOfStockParts.length})
                </span>

                {availableBrands.length > 1 && (
                  <select
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="px-3 py-1.5 rounded-xl text-xs bg-surface-2 text-neutral-200 border border-neutral-700 focus:outline-none focus:border-amber-400"
                  >
                    <option value="all">كل الماركات</option>
                    {availableBrands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2">
                {excludedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExcludedIds([])}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة {excludedIds.length} ملغي للطلبية</span>
                  </button>
                )}

                <button
                  onClick={handleCopySupplierRequisition}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-3 hover:bg-surface-4 text-xs font-bold text-amber-400 border border-amber-500/30 transition-all active:scale-95"
                >
                  {copiedSupplierList ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">تم نسخ الطلب للواتساب!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ قائمة النواقص للواتساب</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onNavigateToInventory();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 transition-colors"
                >
                  <span>المخزن</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-neutral-800/80 max-h-[50vh] no-scrollbar">
              {filteredParts.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-bold text-white">لا توجد نواقص ضمن هذا التصنيف</h4>
                  <p className="text-xs text-neutral-400 mt-1">
                    مستويات المخزون كافية ومستقرة للأصناف المحددة
                  </p>
                </div>
              ) : (
                filteredParts.map((part) => {
                  const isOutOfStock = part.stockQuantity <= 0;
                  const isCritical = false; // القائمة هنا للأصناف المستنفدة فقط
                  const recommendedRestock = 1;
                  const currentRestockInput = restockInputs[part.id] ?? recommendedRestock;
                  const isSuccess = successRestockId === part.id;
                  const progressPct = Math.min(100, (part.stockQuantity / (part.minAlertStock || 1)) * 100);

                  return (
                    <div 
                      key={part.id}
                      className={`py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-800/20 px-3 rounded-2xl transition-colors ${
                        excludedIds.includes(part.id) ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {part.partNumber}
                          </span>
                          <span className="text-sm font-bold text-white truncate">
                            {part.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold">
                            {part.brand}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400">
                            {part.shelfLocation}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                          <span>التوافق: <strong className="text-neutral-300">{part.compatibleModels}</strong></span>
                          <span>·</span>
                          <span>سعر التكلفة: <strong className="text-neutral-200 font-mono">{part.costPrice} ج.م</strong></span>
                          <span>·</span>
                          <span>سعر البيع: <strong className="text-emerald-400 font-mono">{part.salePrice} ج.م</strong></span>
                        </div>

                        <div className="pt-1 max-w-md">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="flex items-center gap-1.5">
                              {isOutOfStock ? (
                                <span className="text-rose-400 font-bold flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" /> نفد تماماً من المستودع!
                                </span>
                              ) : isCritical ? (
                                <span className="text-amber-400 font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> مستوى حرج جداً
                                </span>
                              ) : (
                                <span className="text-amber-400 font-bold">
                                  منخفض أقل من الحد الأدنى
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-neutral-400">
                              المتوفر: <strong className={`text-sm ${isOutOfStock ? 'text-rose-400' : 'text-amber-400'}`}>{part.stockQuantity}</strong> / الحد الأدنى: {part.minAlertStock} {part.unit}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                isOutOfStock ? 'bg-rose-500 w-0' : isCritical ? 'bg-amber-500' : 'bg-amber-400'
                              }`}
                              style={{ width: `${Math.max(4, progressPct)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-neutral-700/80">
                          <input
                            type="number"
                            min="1"
                            value={currentRestockInput}
                            onChange={(e) => handleSetRestockQty(part.id, parseInt(e.target.value) || 1)}
                            className="w-14 h-7 text-center font-mono text-xs font-bold bg-surface-1 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          />
                          <span className="text-[10px] text-neutral-400 px-1">{part.unit}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExcluded(part.id)}
                          title={excludedIds.includes(part.id) ? 'إعادة الصنف إلى طلب التوريد' : 'إلغاء الصنف من طلب التوريد'}
                          className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                            excludedIds.includes(part.id)
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                          }`}
                        >
                          {excludedIds.includes(part.id) ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>إعادة للطلبية</span>
                            </>
                          ) : (
                            <>
                              <MinusCircle className="w-3.5 h-3.5" />
                              <span>إلغاء من الطلبية</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRestock(part)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                            isSuccess
                              ? 'bg-emerald-500 text-neutral-950 font-black'
                              : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-md shadow-amber-500/20'
                          }`}
                        >
                          {isSuccess ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>تم التوريد!</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>توريد فوري</span>
                            </>
                          )}
                        </button>

                        {part.stockQuantity > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              onQuickSalePart(part);
                              onClose();
                            }}
                            title="بيع القطعة المتبقية في الكاشير"
                            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                          >
                            <ShoppingCart className="w-4 h-4 text-emerald-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-neutral-800 bg-surface-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>النظام يفحص مستويات المخزون تلقائياً بعد كل فاتورة بيع صادرة</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPrintView(true)}
                  className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>معاينة جدول أمر الشراء للموردين</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
