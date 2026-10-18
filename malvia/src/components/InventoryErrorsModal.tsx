import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Plus, 
  CheckCircle2, 
  X, 
  Trash2, 
  RotateCcw, 
  Image as ImageIcon, 
  Share2, 
  Check, 
  Sparkles,
  Boxes,
  DollarSign,
  Wrench,
  Search,
  Camera,
  Upload
} from 'lucide-react';
import { AutoPart, InventoryDiscrepancyError } from '../types/autoParts';

interface InventoryErrorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  errors: InventoryDiscrepancyError[];
  onAddError: (error: InventoryDiscrepancyError) => void;
  onCorrectError: (errorId: string, action: InventoryDiscrepancyError['correctionAction']) => void;
  onDeleteError: (errorId: string) => void;
}

export const InventoryErrorsModal: React.FC<InventoryErrorsModalProps> = ({
  isOpen,
  onClose,
  parts,
  errors,
  onAddError,
  onCorrectError,
  onDeleteError,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'corrected'>('all');

  // New Error Form State
  const [selectedPartId, setSelectedPartId] = useState<string>(parts[0]?.id || '');
  const [actualPhysicalStock, setActualPhysicalStock] = useState<number>(0);
  const [errorType, setErrorType] = useState<InventoryDiscrepancyError['errorType']>('عجز / نقص مخزني');
  const [notes, setNotes] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedPart = parts.find(p => p.id === selectedPartId) || parts[0];
  const systemStock = selectedPart?.stockQuantity || 0;
  const difference = actualPhysicalStock - systemStock;
  const estimatedImpact = Math.abs(difference) * (selectedPart?.costPrice || 0);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitError = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPart) return;

    const newRecord: InventoryDiscrepancyError = {
      id: `err-${Date.now()}`,
      errorNumber: `ERR-${Math.floor(1000 + Math.random() * 9000)}`,
      partId: selectedPart.id,
      partNumber: selectedPart.partNumber,
      partName: selectedPart.name,
      shelfLocation: selectedPart.shelfLocation,
      systemStock: selectedPart.stockQuantity,
      actualPhysicalStock,
      differenceQty: difference,
      errorType,
      estimatedFinancialImpact: estimatedImpact,
      recordedDate: new Date().toISOString().split('T')[0],
      isCorrected: false,
      correctionAction: 'قيد انتظار',
      imageUrl: imageUrl || selectedPart.imageUrl || undefined,
      notes: notes.trim() || `تم رصد خطأ وفارق جردي ${difference > 0 ? `فائض +${difference}` : `عجز ${difference}`} قطعة`,
      auditorName: 'أمين المستودع / الجرد',
    };

    onAddError(newRecord);
    setShowAddForm(false);
    setNotes('');
    setImageUrl('');
    setActualPhysicalStock(0);
  };

  const handleShareWhatsApp = (err: InventoryDiscrepancyError) => {
    const text = encodeURIComponent(
      `⚠️ *تقرير خطأ وفارق جرد مخزني - نظام MALVIA*\n` +
      `رقم الخطأ: ${err.errorNumber}\n` +
      `الصنف: ${err.partName} (${err.partNumber})\n` +
      `الرف: ${err.shelfLocation}\n` +
      `الرصيد الدفتري بالنظام: ${err.systemStock}\n` +
      `الرصيد الفعلي المعدود: ${err.actualPhysicalStock}\n` +
      `الفارق: ${err.differenceQty > 0 ? `+${err.differenceQty} فائض` : `${err.differenceQty} عجز`}\n` +
      `نوع الخطأ: ${err.errorType}\n` +
      `الأثر المالي المقدر: ${err.estimatedFinancialImpact.toLocaleString()} ج.م\n` +
      `الحالة: ${err.isCorrected ? 'تم التصحيح والتسوية ✓' : 'قيد الانتظار والمعالجة'}\n` +
      `الملاحظات: ${err.notes}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setCopiedId(err.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredErrors = errors.filter(err => {
    const matchesSearch = 
      err.partName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      err.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      err.errorNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || err.errorType === filterType;
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'pending' && !err.isCorrected) || 
      (filterStatus === 'corrected' && err.isCorrected);

    return matchesSearch && matchesType && matchesStatus;
  });

  const totalDeficitCost = errors.filter(e => e.differenceQty < 0).reduce((sum, e) => sum + e.estimatedFinancialImpact, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0F1422] rounded-3xl border border-rose-500/40 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-[#22151D] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  إدارة أخطاء وفروقات المخزون والمحل التجاري
                </h2>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                  تسويات الجرد وتصحيح العجز
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                تسجيل العجز، الفائض، التلف، وكسر القطع مع معالجة وتصحيح رصيد المخزن المالي والفعلي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-600/30 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل خطأ / فارق جرد جديد</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-[#141A28] border border-neutral-800 space-y-1">
              <span className="text-neutral-400 block">إجمالي أخطاء وفروقات الجرد المسجلة</span>
              <span className="text-xl font-black font-mono text-white block">{errors.length} خطأ مسجل</span>
              <span className="text-[10px] text-neutral-500">يشمل العجز والفائض والكسر</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#22151A] border border-rose-500/30 space-y-1">
              <span className="text-rose-400 block font-bold">إجمالي الأثر المالي المقدر للعجز والتلف</span>
              <span className="text-xl font-black font-mono text-rose-300 block">{totalDeficitCost.toLocaleString()} ج.م</span>
              <span className="text-[10px] text-neutral-400">قيمة القطع المفقودة بسعر التكلفة</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#12241F] border border-emerald-500/30 space-y-1">
              <span className="text-emerald-400 block font-bold">الأخطاء التي تم تصحيحها وتسويتها</span>
              <span className="text-xl font-black font-mono text-emerald-300 block">
                {errors.filter(e => e.isCorrected).length} من أصل {errors.length}
              </span>
              <span className="text-[10px] text-neutral-400">تم تعديل رصيد المخزن ومطابقة الرف</span>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#131828] p-3 rounded-2xl border border-neutral-800 text-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الصنف، كود القطعة، رقم الخطأ..."
                className="w-full h-9 pr-9 pl-3 rounded-xl bg-[#0E121C] border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-rose-500 text-xs"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-9 px-3 rounded-xl bg-[#0E121C] border border-neutral-700 text-white text-xs font-bold"
            >
              <option value="all">كافة أنواع الأخطاء</option>
              <option value="عجز / نقص مخزني">عجز / نقص مخزني</option>
              <option value="فائض غير مسجل">فائض غير مسجل</option>
              <option value="تلف / كسر في المخزن">تلف / كسر في المخزن</option>
              <option value="خطأ في التوريد">خطأ في التوريد</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="h-9 px-3 rounded-xl bg-[#0E121C] border border-neutral-700 text-white text-xs font-bold"
            >
              <option value="all">كافة الحالات</option>
              <option value="pending">قيد الانتظار والمعالجة</option>
              <option value="corrected">تم التصحيح والتسوية</option>
            </select>
          </div>

          {/* List of Discrepancies */}
          <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-[#121624]">
            <table className="w-full text-right text-xs text-neutral-300">
              <thead className="bg-[#0C101A] text-neutral-400 text-[11px] border-b border-neutral-800">
                <tr>
                  <th className="p-3">رقم الخطأ</th>
                  <th className="p-3">الصنف ومكان الرف</th>
                  <th className="p-3">نوع الخطأ</th>
                  <th className="p-3 text-center">الرصيد الدفتري</th>
                  <th className="p-3 text-center">الرصيد الفعلي</th>
                  <th className="p-3 text-center">الفارق</th>
                  <th className="p-3">الأثر المالي</th>
                  <th className="p-3">حالة التصحيح</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredErrors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-neutral-500">
                      لا توجد أخطاء جردية مسجلة مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filteredErrors.map((err) => (
                    <tr key={err.id} className="hover:bg-[#181F30] transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-400">{err.errorNumber}</td>
                      <td className="p-3">
                        <div className="font-bold text-white">{err.partName}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {err.partNumber} · الرف: <span className="text-amber-300 font-bold">{err.shelfLocation}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          err.errorType === 'عجز / نقص مخزني' || err.errorType === 'تلف / كسر في المخزن'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {err.errorType}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-neutral-300">{err.systemStock}</td>
                      <td className="p-3 text-center font-mono font-bold text-white">{err.actualPhysicalStock}</td>
                      <td className="p-3 text-center font-mono font-black">
                        <span className={err.differenceQty < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                          {err.differenceQty > 0 ? `+${err.differenceQty}` : err.differenceQty}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-400">
                        {err.estimatedFinancialImpact.toLocaleString()} ج.م
                      </td>
                      <td className="p-3">
                        {err.isCorrected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>مصحح ({err.correctionAction})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            <span>قيد الانتظار</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Correct error button */}
                          {!err.isCorrected ? (
                            <button
                              onClick={() => onCorrectError(err.id, 'تعديل رصيد المخزن')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-sm"
                              title="تصحيح رصيد المخزن فوراً لمطابقة الواقع الفعلي"
                            >
                              تصحيح المخزن
                            </button>
                          ) : (
                            <button
                              onClick={() => onCorrectError(err.id, 'تسوية جردية أرباح وخسائر')}
                              className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-400 text-[10px] hover:text-white"
                            >
                              تسوية مالية
                            </button>
                          )}

                          {/* Share via WhatsApp */}
                          <button
                            onClick={() => handleShareWhatsApp(err)}
                            className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-emerald-400"
                            title="مشاركة تقرير الخطأ عبر الواتساب"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete error record */}
                          <button
                            onClick={() => onDeleteError(err.id)}
                            className="p-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400"
                            title="حذف هذا السجل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Error Form */}
        {showAddForm && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowAddForm(false)}
          >
            <div 
              className="w-full max-w-lg bg-[#121624] rounded-3xl border border-rose-500/50 p-6 text-white shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h3 className="text-sm font-black text-white">تسجيل خطأ أو فارق جردي في المخزن والمحل</h3>
                </div>
                <button onClick={() => setShowAddForm(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitError} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">اختر الصنف المتأثر بالخطأ أو العجز *</label>
                  <select
                    value={selectedPartId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setSelectedPartId(pId);
                      const part = parts.find(p => p.id === pId);
                      if (part) setActualPhysicalStock(part.stockQuantity);
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold"
                  >
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.partNumber}) - رصيد النظام: {p.stockQuantity} {p.unit}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPart && (
                  <div className="p-3 rounded-2xl bg-[#0E121B] border border-neutral-800 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">الرصيد الدفتري المسجل بالنظام:</span>
                      <strong className="text-white font-mono text-sm">{selectedPart.stockQuantity} {selectedPart.unit}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">مكان الرف بالمستودع:</span>
                      <strong className="text-amber-400 font-mono">{selectedPart.shelfLocation}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">سعر التكلفة:</span>
                      <strong className="text-neutral-200 font-mono">{selectedPart.costPrice} ج.م</strong>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">الرصيد الفعلي المعدود بالرف *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={actualPhysicalStock}
                      onChange={(e) => setActualPhysicalStock(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">نوع وتصنيف الخطأ</label>
                    <select
                      value={errorType}
                      onChange={(e) => setErrorType(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold"
                    >
                      <option value="عجز / نقص مخزني">عجز / نقص مخزني</option>
                      <option value="فائض غير مسجل">فائض غير مسجل</option>
                      <option value="تلف / كسر في المخزن">تلف / كسر في المخزن</option>
                      <option value="خطأ في التوريد">خطأ في التوريد</option>
                      <option value="صنف منتهي الصلاحية">صنف منتهي الصلاحية</option>
                    </select>
                  </div>
                </div>

                {/* Live Impact Calculation */}
                <div className={`p-3 rounded-2xl border text-xs flex justify-between items-center font-bold ${
                  difference < 0 ? 'bg-rose-950/20 border-rose-500/40 text-rose-300' : 'bg-blue-950/20 border-blue-500/40 text-blue-300'
                }`}>
                  <span>الفارق المحسوب: {difference > 0 ? `فائض +${difference}` : `عجز ${difference}`} قطعة</span>
                  <span className="font-mono text-sm">الأثر المالي: {estimatedImpact.toLocaleString()} ج.م</span>
                </div>

                {/* Photo upload / Camera */}
                <div>
                  <label className="text-neutral-300 font-bold block mb-1 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-400" />
                    <span>صورة توثيق التلف أو الخطأ (اختياري):</span>
                  </label>
                  <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[#0E121B] hover:bg-neutral-800 border border-dashed border-neutral-700 cursor-pointer text-xs text-neutral-300 transition-colors">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>{imageUrl ? 'تم إرفاق صورة ✓ (اضغط للتغيير)' : 'رفع صورة من الكاميرا أو المعرض'}</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">سبب الخطأ وملاحظات الجرد</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="مثال: كسر أثناء النقل، خطأ في كود الفاتورة 1092..."
                    className="w-full p-2.5 rounded-xl bg-[#0E121B] border border-neutral-700 text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 text-white font-black text-xs shadow-lg shadow-rose-600/30 active:scale-95 transition-all"
                >
                  تأكيد وقيد الخطأ الجردي بالنظام
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
