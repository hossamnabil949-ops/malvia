import React, { useState } from 'react';
import { 
  X, 
  Boxes, 
  MapPin, 
  Layers, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  Printer, 
  Share2, 
  Plus, 
  ShoppingCart,
  CarFront,
  Clock,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import { AutoPart } from '../types/autoParts';

interface InventoryAuditModalProps {
  part: AutoPart | null;
  isOpen: boolean;
  onClose: () => void;
  onQuickRestock: (partId: string, amount: number) => void;
  onQuickSale: (part: AutoPart) => void;
}

export const InventoryAuditModal: React.FC<InventoryAuditModalProps> = ({
  part,
  isOpen,
  onClose,
  onQuickRestock,
  onQuickSale,
}) => {
  const [restockAmount, setRestockAmount] = useState<number>(5);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !part) return null;

  const isLow = part.stockQuantity <= part.minAlertStock;
  const isOutOfStock = part.stockQuantity === 0;
  const profitPerUnit = part.salePrice - part.costPrice;
  const profitMarginPercent = Math.round((profitPerUnit / part.salePrice) * 100);
  const totalCostValue = part.stockQuantity * part.costPrice;
  const totalSaleValue = part.stockQuantity * part.salePrice;
  const expectedTotalProfit = totalSaleValue - totalCostValue;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyAuditText = () => {
    const text = `📋 تقرير جرد صنف معتمد (Auto Parts Audit):\n- الصنف: ${part.name}\n- الكود OEM: ${part.partNumber}\n- الماركة: ${part.brand} | المنشأ: ${part.origin}\n- مكان التخزين: ${part.shelfLocation}\n- الرصيد الحالي: ${part.stockQuantity} ${part.unit} (الحد الأدنى: ${part.minAlertStock})\n- حالة المخزون: ${isOutOfStock ? 'نفد تماماً ⚠️' : isLow ? 'منخفض وحرج ⚠️' : 'متوفر وممتاز ✅'}\n- سعر البيع: ${part.salePrice} ج.م | سعر التكلفة: ${part.costPrice} ج.م\n- إجمالي قيمة البضاعة بالمخزن: ${totalCostValue.toLocaleString()} ج.م\n- تاريخ الجرد: ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in print:p-0 print:bg-white print:static">
      <div className="bg-[#101522] border border-amber-500/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] print:border-none print:shadow-none print:max-h-full print:bg-white print:text-black">
        <div className="p-4 sm:p-6 bg-gradient-to-r from-neutral-900 via-[#171D2E] to-neutral-900 border-b border-neutral-800 flex items-center justify-between print:border-b-2 print:border-black">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 print:text-black">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> جرد مخزني آلي فوري (AI Audit)
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {new Date().toLocaleTimeString('ar-EG')}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-1 print:text-black">
                {part.name}
              </h2>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors print:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#151B2B] rounded-2xl border border-neutral-800">
              <span className="text-xs text-neutral-400 block mb-1">رقم القطعة OEM</span>
              <span className="font-mono font-bold text-amber-400 text-sm">{part.partNumber}</span>
            </div>
            <div className="p-3 bg-[#151B2B] rounded-2xl border border-neutral-800">
              <span className="text-xs text-neutral-400 block mb-1">الماركة والمنشأ</span>
              <span className="font-bold text-white text-sm">{part.brand} - {part.origin}</span>
            </div>
            <div className="p-3 bg-[#151B2B] rounded-2xl border border-neutral-800">
              <span className="text-xs text-neutral-400 block mb-1">الموقع / الرف</span>
              <span className="font-bold text-emerald-400 text-sm flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {part.shelfLocation}
              </span>
            </div>
            <div className="p-3 bg-[#151B2B] rounded-2xl border border-neutral-800">
              <span className="text-xs text-neutral-400 block mb-1">القسم والتصنيف</span>
              <span className="font-bold text-sky-400 text-sm">{part.category}</span>
            </div>
          </div>

          <div className="p-3.5 bg-neutral-900/60 rounded-2xl border border-neutral-800 flex items-start gap-2.5">
            <CarFront className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-neutral-400 block font-semibold">الموديلات المتوافقة:</span>
              <span className="text-sm font-medium text-neutral-200">{part.compatibleModels}</span>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border ${
            isOutOfStock 
              ? 'bg-rose-950/20 border-rose-500/40 text-rose-300' 
              : isLow 
              ? 'bg-amber-950/20 border-amber-500/40 text-amber-300' 
              : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isOutOfStock ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                ) : isLow ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
                <span className="font-bold text-base">
                  {isOutOfStock ? 'نفد المخزون بالكامل (0 حبة)' : isLow ? 'تنبيه: المخزون منخفض وأقل من حد الخطر' : 'حالة المخزون ممتازة ومتوفرة'}
                </span>
              </div>
              <div className="text-left font-mono">
                <span className="text-2xl font-black">{part.stockQuantity}</span>
                <span className="text-xs text-neutral-400 mr-1.5">{part.unit}</span>
              </div>
            </div>

            <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden my-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isOutOfStock ? 'w-0' : isLow ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, (part.stockQuantity / Math.max(1, part.minAlertStock * 2)) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-neutral-400">
              <span>حد التنبيه الأدنى: {part.minAlertStock} {part.unit}</span>
              <span>الفارق عن حد الأمان: {part.stockQuantity >= part.minAlertStock ? `+${part.stockQuantity - part.minAlertStock} أمان` : `عجز ${part.minAlertStock - part.stockQuantity} مطلوب`}</span>
            </div>
          </div>

          <div className="p-4 bg-[#141A29] rounded-2xl border border-neutral-800 space-y-3">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400" /> التدقيق المالي وهوامش الربح للصنف
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-neutral-900/80 border border-neutral-800/80">
                <span className="text-xs text-neutral-400 block">سعر التكلفة</span>
                <span className="text-base font-bold text-neutral-200">{part.costPrice} ج.م</span>
              </div>
              <div className="p-2.5 rounded-xl bg-neutral-900/80 border border-neutral-800/80">
                <span className="text-xs text-neutral-400 block">سعر البيع للقطاعي</span>
                <span className="text-base font-bold text-amber-400">{part.salePrice} ج.م</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20">
                <span className="text-xs text-emerald-400 block">ربح الحبة الواحدة</span>
                <span className="text-base font-bold text-emerald-300">+{profitPerUnit} ج.م ({profitMarginPercent}%)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-950/30 border border-sky-500/20">
                <span className="text-xs text-sky-400 block">قيمة الرصيد الحالي</span>
                <span className="text-base font-bold text-sky-300">{totalCostValue.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gradient-to-r from-amber-500/5 via-[#161C2C] to-emerald-500/5 rounded-2xl border border-neutral-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-300 font-bold">توريد فوري للمستودع:</span>
              <div className="flex items-center gap-1.5">
                {[5, 10, 20].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      onQuickRestock(part.id, num);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onQuickSale(part);
                  onClose();
                }}
                disabled={part.stockQuantity <= 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                بيع الصنف فوراً
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAuditText}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700"
            >
              <Share2 className="w-4 h-4 text-amber-400" />
              {copied ? 'تم النسخ!' : 'نسخ التقرير للواتساب'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700"
            >
              <Printer className="w-4 h-4 text-sky-400" />
              طباعة كشف الجرد
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
