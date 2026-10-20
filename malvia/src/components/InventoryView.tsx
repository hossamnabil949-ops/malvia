import { BarcodeField } from './BarcodeField';
import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Boxes, 
  AlertTriangle, 
  CheckCircle2, 
  Edit, 
  X, 
  ShoppingCart,
  Layers,
  ArrowUpDown,
  Edit3,
  DollarSign,
  Tag,
  Check,
  FileSpreadsheet,
  Car,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { AutoPart, CarBrand, PartCategory } from '../types/autoParts';
import { CAR_BRANDS, PART_CATEGORIES } from '../data/autoPartsData';

interface InventoryViewProps {
  parts: AutoPart[];
  onAddNewPart: (newPart: AutoPart) => void;
  onUpdateStock: (partId: string, addedStock: number) => void;
  onUpdatePartPrices?: (partId: string, costPrice: number, salePrice: number, barcode?: string) => void;
  onQuickSalePart: (part: AutoPart) => void;
  onOpenInventoryErrors?: () => void;
  onOpenCarModels?: () => void;
  onOpenPhotoSharing?: () => void;
  onOpenExcelModal?: () => void;
  isAddModalOpenInitially?: boolean;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  parts,
  onAddNewPart,
  onUpdateStock,
  onUpdatePartPrices,
  onQuickSalePart,
  onOpenInventoryErrors,
  onOpenCarModels,
  onOpenPhotoSharing,
  onOpenExcelModal,
  isAddModalOpenInitially = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<CarBrand>('شامل');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'out'>('all');

  const [showAddModal, setShowAddModal] = useState(isAddModalOpenInitially);
  const [restockPart, setRestockPart] = useState<AutoPart | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);

  const [editPricePart, setEditPricePart] = useState<AutoPart | null>(null);
  const [editCostPrice, setEditCostPrice] = useState<number>(0);
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editBarcode, setEditBarcode] = useState<string>('');

  const [newPartForm, setNewPartForm] = useState<Partial<AutoPart>>({
    partNumber: '',
    name: '',
    brand: 'تويوتا',
    compatibleModels: '',
    category: 'فرامل ومكابح',
    origin: 'أصلي وكالة OEM',
    shelfLocation: 'رف A-01',
    costPrice: 200,
    salePrice: 320,
    stockQuantity: 10,
    minAlertStock: 3,
    unit: 'طقم',
  });

  const filteredParts = useMemo(() => {
    return parts.filter((part) => {
      if (selectedBrand !== 'شامل' && part.brand !== selectedBrand) return false;
      if (selectedCategory !== 'الكل' && part.category !== selectedCategory) return false;
      if (stockStatusFilter === 'low' && part.stockQuantity > part.minAlertStock) return false;
      if (stockStatusFilter === 'out' && part.stockQuantity > 0) return false;

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
  }, [parts, selectedBrand, selectedCategory, stockStatusFilter, searchQuery]);

  const handleSaveNewPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartForm.partNumber || !newPartForm.name) return;

    const part: AutoPart = {
      id: `p-${Date.now()}`,
      partNumber: newPartForm.partNumber.trim(),
      name: newPartForm.name.trim(),
      brand: newPartForm.brand as CarBrand,
      compatibleModels: newPartForm.compatibleModels || 'عام',
      category: newPartForm.category as PartCategory,
      origin: newPartForm.origin as any,
      shelfLocation: newPartForm.shelfLocation || 'مستودع رئيسي',
      costPrice: Number(newPartForm.costPrice) || 0,
      salePrice: Number(newPartForm.salePrice) || 0,
      stockQuantity: Number.isFinite(Number(newPartForm.stockQuantity)) ? Number(newPartForm.stockQuantity) : 0,
      minAlertStock: Number.isFinite(Number(newPartForm.minAlertStock)) ? Number(newPartForm.minAlertStock) : 2,
      unit: newPartForm.unit || 'طقم',
      barcode: newPartForm.barcode?.trim() || undefined,
    };

    onAddNewPart(part);
    setShowAddModal(false);
    setNewPartForm({
      partNumber: '',
      name: '',
      brand: 'تويوتا',
      compatibleModels: '',
      category: 'فرامل ومكابح',
      origin: 'أصلي وكالة OEM',
      shelfLocation: 'رف A-01',
      costPrice: 200,
      salePrice: 320,
      stockQuantity: 10,
      minAlertStock: 3,
      unit: 'طقم',
      barcode: '',
    });
  };

  const handleConfirmRestock = () => {
    if (!restockPart) return;
    onUpdateStock(restockPart.id, restockAmount);
    setRestockPart(null);
  };

  const handleConfirmEditPrices = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPricePart || !onUpdatePartPrices) return;
    onUpdatePartPrices(editPricePart.id, editCostPrice, editSalePrice, editBarcode.trim());
    setEditPricePart(null);
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase mb-1">
            <Boxes className="w-4 h-4" />
            <span>إدارة المخزون والمحل</span>
          </div>
          <h2 className="text-xl font-black text-white">قطع الغيار، الأسعار، وأماكن الرفوف</h2>
          <p className="text-xs text-neutral-400 mt-1">
            متاح تعديل أسعار الشراء والبيع مباشرة، تتبع كميات المستودع وتنبيهات النواقص
          </p>
        </div>

        {/* Feature Shortcut Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenExcelModal && (
            <button
              onClick={onOpenExcelModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-500 text-emerald-400 text-xs font-bold transition-all shadow-sm"
              title="استيراد وتصدير شيتات إكسيل"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>إكسيل (استيراد/تصدير)</span>
            </button>
          )}

          {onOpenCarModels && (
            <button
              onClick={onOpenCarModels}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-amber-300 text-xs font-bold transition-all shadow-sm"
              title="إضافة أو حذف موديل السيارة"
            >
              <Car className="w-4 h-4" />
              <span>موديلات السيارات</span>
            </button>
          )}



          {onOpenInventoryErrors && (
            <button
              onClick={onOpenInventoryErrors}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold transition-all shadow-sm"
              title="تسجيل وتصحيح أخطاء وفروقات الجرد"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>أخطاء وفروقات المخزون</span>
            </button>
          )}

          {onOpenPhotoSharing && (
            <button
              onClick={onOpenPhotoSharing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-amber-300 text-xs font-bold transition-all shadow-sm"
              title="مساحة مشاركة صور القطع على واتساب"
            >
              <Camera className="w-4 h-4 text-amber-400" />
              <span>مشاركة الصور</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة قطعة جديدة للمخزن</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-grow w-full">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم القطعة أو رقم OEM أو موقع الرف..."
              className="w-full h-11 pr-10 pl-4 rounded-xl bg-surface-1 border border-neutral-700 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-400"
            />
          </div>


          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value as any)}
            className="bg-surface-1 border border-neutral-700 text-neutral-200 text-xs rounded-xl px-3 h-11 focus:outline-none focus:border-amber-400 w-full sm:w-auto"
          >
            <option value="all">كافة الكميات</option>
            <option value="low">أوشكت على النفاد (حرج)</option>
            <option value="out">المنتهية تماماً (0 قطع)</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          {CAR_BRANDS.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedBrand === b
                  ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                  : 'bg-surface-1 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Parts Table */}
      <div className="rounded-3xl bg-surface-2 border border-neutral-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-neutral-300">
            <thead className="bg-surface-1 text-neutral-400 text-[11px] uppercase border-b border-neutral-800">
              <tr>
                <th className="p-3.5">رقم القطعة (OEM)</th>
                <th className="p-3.5">اسم القطعة</th>
                <th className="p-3.5">السيارات المتوافقة</th>
                <th className="p-3.5">مكان الرف</th>
                <th className="p-3.5">أسعار القطعة (بيع / شراء)</th>
                <th className="p-3.5">الكمية المتوفرة</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80">
              {filteredParts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-neutral-500">
                    لا توجد أصناف تطابق معايير البحث
                  </td>
                </tr>
              ) : (
                filteredParts.map((part) => {
                  const isLow = part.stockQuantity <= part.minAlertStock;
                  const isOut = part.stockQuantity <= 0;

                  return (
                    <tr key={part.id} className="hover:bg-surface-3 transition-colors">
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {part.partNumber}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{part.name}</span>
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          {part.brand} · {part.origin}
                        </div>
                      </td>

                      <td className="p-3.5 max-w-[200px] text-neutral-300">
                        {part.compatibleModels}
                      </td>

                      <td className="p-3.5 font-mono text-neutral-200">
                        {part.shelfLocation}
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-black text-white font-mono text-xs">
                              بيع: {part.salePrice.toLocaleString()} <span className="text-[10px] text-amber-400">ج.م</span>
                            </div>
                            <div className="text-[10px] text-neutral-400 font-mono">
                              شراء: {part.costPrice.toLocaleString()} ج.م
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setEditPricePart(part);
                              setEditCostPrice(part.costPrice);
                              setEditSalePrice(part.salePrice);
                              setEditBarcode(part.barcode || '');
                            }}
                            className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-amber-400"
                            title="تعديل سعر البيع وسعر الشراء"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                            isOut
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : isLow
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {isLow && <AlertTriangle className="w-3 h-3" />}
                          <span>{part.stockQuantity} {part.unit}</span>
                        </span>
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onQuickSalePart(part)}
                            disabled={isOut}
                            className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                            title="إضافة للفاتورة"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setRestockPart(part)}
                            className="p-1.5 rounded-lg bg-surface-3 hover:bg-surface-4 text-neutral-200"
                            title="توريد / تزويد كمية"
                          >
                            <Plus className="w-3.5 h-3.5" />
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

      {editPricePart && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditPricePart(null)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-surface-2 border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">تعديل أسعار القطعة</h3>
              </div>
              <button onClick={() => setEditPricePart(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs font-bold text-white">{editPricePart.name}</p>
              <span className="font-mono text-[11px] text-amber-400">{editPricePart.partNumber}</span>
            </div>

            <form onSubmit={handleConfirmEditPrices} className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  سعر الشراء / التكلفة من التاجر (ج.م) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editCostPrice}
                  onChange={(e) => setEditCostPrice(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-sm font-bold focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  سعر البيع قطاعي / بالمحل (ج.م) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editSalePrice}
                  onChange={(e) => setEditSalePrice(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-amber-400 font-mono text-sm font-bold focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">الباركود</label>
                <BarcodeField value={editBarcode} onChange={setEditBarcode} />
              </div>

              <div className="p-2.5 rounded-xl bg-surface-1 text-[11px] text-neutral-400 flex justify-between">
                <span>هامش الربح المتوقع:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {(editSalePrice - editCostPrice).toFixed(2)} ج.م ({editCostPrice > 0 ? (((editSalePrice - editCostPrice) / editCostPrice) * 100).toFixed(0) : 0}%)
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditPricePart(null)}
                  className="w-1/2 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md"
                >
                  حفظ الأسعار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restockPart && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRestockPart(null)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-surface-2 border border-neutral-800 p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold">توريد كمية جديدة للمخزن</h3>
              <button onClick={() => setRestockPart(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div>
                <span className="text-neutral-400">القطعة:</span>
                <p className="font-bold text-white text-sm mt-0.5">{restockPart.name}</p>
                <span className="font-mono text-amber-400 text-xs">{restockPart.partNumber}</span>
              </div>

              <div>
                <span className="text-neutral-400">الكمية المتوفرة حالياً:</span>
                <p className="font-bold font-mono text-neutral-200">{restockPart.stockQuantity} {restockPart.unit}</p>
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  الكمية الجديدة الموردة ({restockPart.unit}):
                </label>
                <input
                  type="number"
                  min="1"
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(Math.max(1, Number(e.target.value)))}
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleConfirmRestock}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md"
            >
              تأكيد إضافة {restockAmount} {restockPart.unit} للمخزون
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="w-full max-w-lg rounded-3xl bg-surface-2 border border-neutral-800 p-6 text-white shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <span>إضافة قطعة غيار جديدة للمستودع</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewPart} className="py-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    رقم القطعة OEM / الكود *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPartForm.partNumber}
                    onChange={(e) => setNewPartForm({ ...newPartForm, partNumber: e.target.value })}
                    placeholder="مثال: 04465-33470"
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    ماركة السيارة الرئيسية *
                  </label>
                  <select
                    value={newPartForm.brand}
                    onChange={(e) => setNewPartForm({ ...newPartForm, brand: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    {CAR_BRANDS.filter((b) => b !== 'شامل').map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  اسم القطعة بالتفصيل *
                </label>
                <input
                  type="text"
                  required
                  value={newPartForm.name}
                  onChange={(e) => setNewPartForm({ ...newPartForm, name: e.target.value })}
                  placeholder="مثال: طقم تيل فرامل أمامي كوري أصلي"
                  className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  الباركود (اختياري)
                </label>
                <BarcodeField
                  value={newPartForm.barcode || ''}
                  onChange={(v) => setNewPartForm({ ...newPartForm, barcode: v })}
                />
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  السيارات والموديلات المتوافقة
                </label>
                <input
                  type="text"
                  value={newPartForm.compatibleModels}
                  onChange={(e) => setNewPartForm({ ...newPartForm, compatibleModels: e.target.value })}
                  placeholder="مثال: النترا 2017-2024 / كيا سيراتو"
                  className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    قسم القطعة
                  </label>
                  <select
                    value={newPartForm.category}
                    onChange={(e) => setNewPartForm({ ...newPartForm, category: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    {PART_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    المنشأ / الجودة
                  </label>
                  <select
                    value={newPartForm.origin}
                    onChange={(e) => setNewPartForm({ ...newPartForm, origin: e.target.value as any })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    <option value="أصلي وكالة OEM">أصلي وكالة OEM</option>
                    <option value="ياباني Denso">ياباني Denso</option>
                    <option value="كوري Mobis">كوري Mobis</option>
                    <option value="ألماني Bosch">ألماني Bosch</option>
                    <option value="تجاري درجة 1">تجاري درجة 1</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    سعر الشراء / التكلفة (ج.م) *
                  </label>
                  <input
                    type="number"
                    value={newPartForm.costPrice}
                    onChange={(e) => setNewPartForm({ ...newPartForm, costPrice: Number(e.target.value) })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    سعر البيع (ج.م) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newPartForm.salePrice}
                    onChange={(e) => setNewPartForm({ ...newPartForm, salePrice: Number(e.target.value) })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    مكان الرف بالمخزن
                  </label>
                  <input
                    type="text"
                    value={newPartForm.shelfLocation}
                    onChange={(e) => setNewPartForm({ ...newPartForm, shelfLocation: e.target.value })}
                    placeholder="مثال: رف B-05"
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    الكمية الأولية بالمخزن
                  </label>
                  <input
                    type="number"
                    value={newPartForm.stockQuantity}
                    onChange={(e) => setNewPartForm({ ...newPartForm, stockQuantity: Number(e.target.value) })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">
                    حد التنبيه الأدنى
                  </label>
                  <input
                    type="number"
                    value={newPartForm.minAlertStock}
                    onChange={(e) => setNewPartForm({ ...newPartForm, minAlertStock: Number(e.target.value) })}
                    className="w-full h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg mt-4"
              >
                حفظ وإدراج القطعة في النظام
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
