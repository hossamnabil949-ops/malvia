import React, { useState } from 'react';
import { 
  TrendingUp, 
  Receipt, 
  Boxes, 
  AlertTriangle, 
  Search, 
  Plus, 
  ShoppingCart, 
  ArrowUpRight, 
  Printer, 
  Car,
  CheckCircle2,
  PackageCheck,
  Calculator,
  Bell,
  Truck,
  Mic,
  Sparkles,
  FileSpreadsheet,
  Camera
} from 'lucide-react';
import { AutoPart, Invoice, UserSession } from '../types/autoParts';
import { ActiveTab } from './Navigation';
import { SalesCharts } from './SalesCharts';

interface HomeDashboardProps {
  parts: AutoPart[];
  invoices: Invoice[];
  currentSession?: UserSession | null;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenInvoiceModal: (invoice: Invoice) => void;
  onAddNewPart: () => void;
  onQuickSalePart: (part: AutoPart) => void;
  onOpenNotifications: () => void;
  onOpenVoiceAssistant: () => void;
  onOpenInventoryErrors?: () => void;
  onOpenCarModels?: () => void;
  onOpenPhotoSharing?: () => void;
  onOpenExcelModal?: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  parts,
  invoices,
  currentSession,
  onChangeTab,
  onOpenInvoiceModal,
  onAddNewPart,
  onQuickSalePart,
  onOpenNotifications,
  onOpenVoiceAssistant,
  onOpenInventoryErrors,
  onOpenCarModels,
  onOpenPhotoSharing,
  onOpenExcelModal,
}) => {
  const [quickSearch, setQuickSearch] = useState('');

  const isOwnerOrManager = !currentSession || currentSession.role === 'مدير عام' || (currentSession.permissions?.canViewReports && currentSession.role !== 'كاشير مبيعات');

  const todaySales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalInvoicesCount = invoices.length;
  const totalPartsInStock = parts.reduce((sum, p) => sum + p.stockQuantity, 0);
  const lowStockParts = parts.filter((p) => p.stockQuantity <= p.minAlertStock);
  const outOfStockParts = parts.filter((p) => p.stockQuantity === 0);

  const searchResults = quickSearch.trim()
    ? parts.filter(
        (p) =>
          p.partNumber.toLowerCase().includes(quickSearch.toLowerCase()) ||
          p.name.includes(quickSearch) ||
          p.compatibleModels.includes(quickSearch) ||
          p.brand.includes(quickSearch as any)
      )
    : [];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Quick Navigation Action Hero */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#171E2E] via-[#1A2234] to-[#141A28] border border-neutral-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
              <span>نظام البيع السريع لمحلات وورش قطع الغيار</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white">
              مرحباً بك في لوحة تحكم مبيعات ومخزون المحل
            </h2>
            <p className="text-xs md:text-sm text-neutral-400 mt-1">
              إصدار فواتير بيع ضريبية فورية، استعلام فوري عن أرقام القطع الأصلية والتوافق مع السيارات
            </p>
          </div>

          {/* Core Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenVoiceAssistant}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/40 text-purple-200 border border-purple-500/40 font-bold text-xs transition-all active:scale-95 shadow-md group"
              title="تحدث والذكاء الاصطناعي ينفذ فوراً"
            >
              <Mic className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>المساعد الصوتي AI</span>
            </button>

            <button
              onClick={() => onChangeTab('pos')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/25 transition-all active:scale-95"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>قسم البيع (الكاشير)</span>
            </button>

            {onOpenCarModels && (
              <button
                onClick={onOpenCarModels}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#222A3C] hover:bg-[#2A344A] text-amber-300 border border-amber-500/30 font-bold text-xs transition-all"
                title="إضافة أو حذف موديلات السيارات"
              >
                <Car className="w-4 h-4 text-amber-400" />
                <span>موديلات السيارات</span>
              </button>
            )}

            {onOpenInventoryErrors && (
              <button
                onClick={onOpenInventoryErrors}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs transition-all"
                title="تسجيل وتصحيح أخطاء وفروقات الجرد"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>أخطاء المخزون</span>
              </button>
            )}

            {onOpenExcelModal && (
              <button
                onClick={onOpenExcelModal}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition-all"
                title="استيراد وتصدير شيتات إكسيل"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>إكسيل (استيراد/تصدير)</span>
              </button>
            )}

            {onOpenPhotoSharing && (
              <button
                onClick={onOpenPhotoSharing}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#222A3C] hover:bg-[#2A344A] text-sky-300 border border-sky-500/30 font-bold text-xs transition-all"
                title="مساحة مشاركة صور القطع على واتساب"
              >
                <Camera className="w-4 h-4 text-sky-400" />
                <span>مشاركة الصور</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Low Stock Alert Banner */}
      {lowStockParts.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-950/40 via-[#1B1524] to-amber-950/30 border border-rose-500/30 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0 relative">
              <Bell className="w-6 h-6 animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-black text-white items-center justify-center">
                  {lowStockParts.length}
                </span>
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white tracking-wider">
                  تنبيه المخزون الحرج
                </span>
                <h3 className="text-sm sm:text-base font-black text-white">
                  يوجد {lowStockParts.length} صنف وصل إلى الحد الأدنى المسموح به أو أوشك على النفاد
                </h3>
              </div>
              <p className="text-xs text-neutral-300 mt-1">
                {outOfStockParts.length > 0 && (
                  <span className="text-rose-400 font-bold ml-1.5">
                    ⚠️ {outOfStockParts.length} أصناف نفدت بالكامل (0 حبة)!
                  </span>
                )}
                قم بمراجعة القائمة لتفادي تعطل عمليات البيع وتوليد أمر شراء للموردين فورا.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onOpenNotifications}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/25 transition-all active:scale-95"
            >
              <Bell className="w-4 h-4" />
              <span>عرض الإشعارات والنواقص</span>
            </button>
            <button
              onClick={onOpenNotifications}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#221F2D] hover:bg-[#2C273A] text-amber-300 border border-amber-500/30 font-bold text-xs transition-all"
            >
              <Truck className="w-4 h-4 text-amber-400" />
              <span>طلب توريد سريع</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Key Performance Indicators (KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#141926] border border-neutral-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>مبيعات اليوم</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl md:text-2xl font-black text-emerald-400 font-mono">
              {todaySales.toLocaleString()}{' '}
              <span className="text-xs font-normal text-neutral-400">ج.م</span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">
              شاملة ضريبة القيمة المضافة 14%
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#141926] border border-neutral-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>فواتير اليوم</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl md:text-2xl font-black text-white font-mono">
              {totalInvoicesCount}{' '}
              <span className="text-xs font-normal text-neutral-400">فاتورة</span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">
              متوسط الفاتورة: {(todaySales / (totalInvoicesCount || 1)).toFixed(0)} ج.م
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#141926] border border-neutral-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>إجمالي القطع بالمستودع</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl md:text-2xl font-black text-amber-400 font-mono">
              {totalPartsInStock}{' '}
              <span className="text-xs font-normal text-neutral-400">قطعة</span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">
              في {parts.length} صنف مسجل
            </span>
          </div>
        </div>

        <div 
          onClick={onOpenNotifications}
          className="p-4 rounded-2xl bg-[#141926] border border-neutral-800 hover:border-rose-500/50 hover:bg-[#1A1828] transition-all cursor-pointer shadow-sm flex flex-col justify-between group"
          title="اضغط لفتح مركز إشعارات النواقص والتوريد"
        >
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span className="group-hover:text-rose-300 transition-colors">نواقص المخزن (تحذير)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl md:text-2xl font-black text-rose-400 font-mono">
              {lowStockParts.length}{' '}
              <span className="text-xs font-normal text-neutral-400">أصناف قاربت النفاد</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-neutral-400">
                بحاجة لطلب توريد عاجل
              </span>
              <span className="text-[10px] text-rose-400 font-bold group-hover:underline">
                عرض الإشعارات ←
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sales & Profit Analytics */}
      {isOwnerOrManager && (
        <SalesCharts invoices={invoices} parts={parts} currency="ج.م" />
      )}

      {/* 4. Fast Part & OEM Search Bar */}
      <div className="p-5 rounded-2xl bg-[#141926] border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              بحث واستعلام سريع عن قطعة غيار
            </h3>
          </div>
          <span className="text-[11px] text-neutral-400">
            اكتب رقم القطعة OEM، اسم القطعة، أو موديل السيارة
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="مثال: 04465-33470، فحمات كامري، فلتر زيت..."
            className="w-full h-12 px-4 rounded-xl bg-[#0E121B] border border-neutral-700 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-amber-400 transition-colors"
          />
          {quickSearch && (
            <button
              onClick={() => setQuickSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
            >
              مسح
            </button>
          )}
        </div>

        {quickSearch.trim() && (
          <div className="mt-3 divide-y divide-neutral-800 bg-[#0E121B] rounded-xl border border-neutral-800 max-h-60 overflow-y-auto no-scrollbar">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-400">
                لا توجد قطعة مطابقة لبحثك في المستودع
              </div>
            ) : (
              searchResults.map((p) => (
                <div
                  key={p.id}
                  className="p-3 flex items-center justify-between hover:bg-neutral-800/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-400">
                        {p.partNumber}
                      </span>
                      <span className="text-xs font-bold text-white">{p.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                        {p.brand}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-400 mt-1">
                      <span>التوافق: {p.compatibleModels}</span>
                      <span>·</span>
                      <span className="text-amber-300">المكان: {p.shelfLocation}</span>
                      <span>·</span>
                      <span>المتوفر: {p.stockQuantity} {p.unit}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-white font-mono">
                      {p.salePrice} ج.م
                    </span>
                    <button
                      onClick={() => onQuickSalePart(p)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs"
                    >
                      إضافة للفاتورة
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 5. Two Columns: Low Stock Alerts & Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-[#141926] border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-white">
                أصناف أوشكت على النفاد ({lowStockParts.length})
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenNotifications}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>مركز الإشعارات</span>
              </button>
              <button
                onClick={() => onChangeTab('inventory')}
                className="text-xs text-amber-400 hover:underline font-semibold"
              >
                كامل المخزن
              </button>
            </div>
          </div>

          <div className="divide-y divide-neutral-800/80">
            {lowStockParts.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                جميع مستويات المخزون كافية ومستقرة
              </div>
            ) : (
              lowStockParts.map((part) => (
                <div key={part.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-neutral-300">
                        {part.partNumber}
                      </span>
                      <span className="text-xs font-semibold text-white truncate max-w-[180px]">
                        {part.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      {part.brand} · {part.shelfLocation}
                    </div>
                  </div>

                  <div className="text-left rtl:text-right">
                    <span className="text-xs font-bold text-rose-400 font-mono block">
                      متبقي: {part.stockQuantity} {part.unit}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      الحد الأدنى: {part.minAlertStock}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#141926] border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">
                آخر فواتير البيع الصادرة
              </h3>
            </div>
            <button
              onClick={() => onChangeTab('invoices')}
              className="text-xs text-amber-400 hover:underline font-semibold"
            >
              سجل الفواتير
            </button>
          </div>

          <div className="divide-y divide-neutral-800/80">
            {invoices.slice(0, 4).map((inv) => (
              <div
                key={inv.id}
                onClick={() => onOpenInvoiceModal(inv)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-neutral-800/30 px-2 rounded-xl transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">
                      {inv.invoiceNumber}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                      {inv.customerType}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    {inv.customerName} {inv.carDetails && `· ${inv.carDetails}`}
                  </div>
                </div>

                <div className="text-left rtl:text-right flex items-center gap-3">
                  <div>
                    <span className="text-xs font-black text-emerald-400 font-mono block">
                      {inv.grandTotal.toFixed(2)} ج.م
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {inv.paymentMethod}
                    </span>
                  </div>
                  <Printer className="w-4 h-4 text-neutral-400 hover:text-white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
