import React, { useState } from 'react';
import { 
  Car, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles,
  Calendar,
  Layers,
  Check
} from 'lucide-react';
import { CarBrand, CarModel } from '../types/autoParts';
import { CAR_BRANDS } from '../data/autoPartsData';

interface CarModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  carModels: CarModel[];
  onAddCarModel: (model: CarModel) => void;
  onDeleteCarModel: (modelId: string) => void;
  onUpdateCarModel?: (model: CarModel) => void;
}

export const CarModelsModal: React.FC<CarModelsModalProps> = ({
  isOpen,
  onClose,
  carModels,
  onAddCarModel,
  onDeleteCarModel,
  onUpdateCarModel,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('all');
  const [editingModel, setEditingModel] = useState<CarModel | null>(null);

  // New Car Model Form State
  const [brand, setBrand] = useState<CarBrand>('تويوتا');
  const [modelName, setModelName] = useState('');
  const [yearFrom, setYearFrom] = useState<number>(2018);
  const [yearTo, setYearTo] = useState<number>(2025);
  const [engineSpecs, setEngineSpecs] = useState('');
  const [generation, setGeneration] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmitNewModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim()) return;

    const newModel: CarModel = {
      id: `cm-${Date.now()}`,
      brand,
      modelName: modelName.trim(),
      yearFrom: Number(yearFrom) || 2015,
      yearTo: Number(yearTo) || 2025,
      engineSpecs: engineSpecs.trim() || undefined,
      generation: generation.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onAddCarModel(newModel);
    setShowAddForm(false);
    setModelName('');
    setEngineSpecs('');
    setGeneration('');
    setNotes('');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModel || !onUpdateCarModel) return;
    onUpdateCarModel(editingModel);
    setEditingModel(null);
  };

  const filteredModels = carModels.filter((m) => {
    const matchesBrand = selectedBrandFilter === 'all' || m.brand === selectedBrandFilter;
    const matchesSearch = 
      m.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.generation && m.generation.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.engineSpecs && m.engineSpecs.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesBrand && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0F1422] rounded-3xl border border-amber-500/40 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-[#182033] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  إدارة موديلات وماركات السيارات (Car Models Management)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {carModels.length} موديل مسجل
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                إضافة وحذف وتعديل موديلات وسنوات صنع السيارات لربط قطع الغيار بموديلات السيارات المتوافقة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة موديل سيارة جديد</span>
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
          
          {/* Search & Brand Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#131828] p-3 rounded-2xl border border-neutral-800 text-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الموديل (كورولا، إلنترا، صني، كامري، تيجو)..."
                className="w-full h-9 pr-9 pl-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 text-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedBrandFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                  selectedBrandFilter === 'all'
                    ? 'bg-amber-500 text-neutral-950'
                    : 'bg-[#0E121B] text-neutral-400 hover:text-white border border-neutral-800'
                }`}
              >
                الكل
              </button>
              {CAR_BRANDS.filter(b => b !== 'شامل').map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrandFilter(b)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                    selectedBrandFilter === b
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-[#0E121B] text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Car Models Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredModels.length === 0 ? (
              <div className="col-span-full py-12 text-center text-xs text-neutral-500 bg-[#121622] rounded-2xl border border-neutral-800">
                لا توجد موديلات سيارات مطابقة لبحثك
              </div>
            ) : (
              filteredModels.map((model) => (
                <div
                  key={model.id}
                  className="bg-[#121624] border border-neutral-800 hover:border-neutral-700 p-4 rounded-2xl flex flex-col justify-between shadow-md space-y-3 group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {model.brand}
                      </span>
                      <span className="text-xs font-mono font-bold text-neutral-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{model.yearFrom} - {model.yearTo}</span>
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                      {model.modelName}
                    </h4>

                    {model.generation && (
                      <div className="text-[11px] text-neutral-400 mt-1">
                        الجيل: <span className="text-neutral-300">{model.generation}</span>
                      </div>
                    )}

                    {model.engineSpecs && (
                      <div className="text-[11px] text-neutral-400">
                        المحرك: <span className="text-neutral-300 font-mono">{model.engineSpecs}</span>
                      </div>
                    )}

                    {model.notes && (
                      <p className="text-[10px] text-neutral-500 mt-2 italic bg-[#0C101A] p-2 rounded-xl border border-neutral-800/80">
                        {model.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                    <button
                      onClick={() => setEditingModel(model)}
                      className="flex items-center gap-1 text-[11px] text-neutral-300 hover:text-amber-400 font-bold transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>تعديل الموديل</span>
                    </button>

                    <button
                      onClick={() => onDeleteCarModel(model.id)}
                      className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-bold transition-colors"
                      title="حذف هذا الموديل من النظام"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal: Add New Car Model Form */}
        {showAddForm && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowAddForm(false)}
          >
            <div 
              className="w-full max-w-lg bg-[#121624] rounded-3xl border border-amber-500/50 p-6 text-white shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-black text-white">إضافة موديل سيارة جديد للنظام</h3>
                </div>
                <button onClick={() => setShowAddForm(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitNewModel} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">الماركة الرئيسية *</label>
                    <select
                      value={brand}
                      onChange={(e) => setBrand(e.target.value as CarBrand)}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold"
                    >
                      {CAR_BRANDS.filter(b => b !== 'شامل').map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">اسم الموديل *</label>
                    <input
                      type="text"
                      required
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="مثلاً: كورولا (Corolla)"
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">سنة الصنع (من) *</label>
                    <input
                      type="number"
                      required
                      min="1980"
                      max="2030"
                      value={yearFrom}
                      onChange={(e) => setYearFrom(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">سنة الصنع (إلى) *</label>
                    <input
                      type="number"
                      required
                      min="1980"
                      max="2030"
                      value={yearTo}
                      onChange={(e) => setYearTo(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">مواصفات المحرك (سعة وسلندرات)</label>
                  <input
                    type="text"
                    value={engineSpecs}
                    onChange={(e) => setEngineSpecs(e.target.value)}
                    placeholder="مثال: 1.6L 4-Cylinder / Turbo"
                    className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">الجيل / الشكل (Generation / Body)</label>
                  <input
                    type="text"
                    value={generation}
                    onChange={(e) => setGeneration(e.target.value)}
                    placeholder="مثال: الشكل الجديد E210 / AD"
                    className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">ملاحظات إضافية وتوافق القطع</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="مثال: مشتركة مع كيا سيراتو في الفحمات والفلاتر..."
                    className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  حفظ وإدراج موديل السيارة في النظام
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Car Model */}
        {editingModel && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setEditingModel(null)}
          >
            <div 
              className="w-full max-w-lg bg-[#121624] rounded-3xl border border-amber-500/50 p-6 text-white shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <h3 className="text-sm font-black text-white">تعديل موديل السيارة: {editingModel.modelName}</h3>
                <button onClick={() => setEditingModel(null)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">الماركة</label>
                    <select
                      value={editingModel.brand}
                      onChange={(e) => setEditingModel({ ...editingModel, brand: e.target.value as CarBrand })}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold"
                    >
                      {CAR_BRANDS.filter(b => b !== 'شامل').map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">اسم الموديل</label>
                    <input
                      type="text"
                      required
                      value={editingModel.modelName}
                      onChange={(e) => setEditingModel({ ...editingModel, modelName: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">سنة الصنع (من)</label>
                    <input
                      type="number"
                      required
                      value={editingModel.yearFrom}
                      onChange={(e) => setEditingModel({ ...editingModel, yearFrom: Number(e.target.value) })}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">سنة الصنع (إلى)</label>
                    <input
                      type="number"
                      required
                      value={editingModel.yearTo}
                      onChange={(e) => setEditingModel({ ...editingModel, yearTo: Number(e.target.value) })}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg"
                >
                  حفظ التعديلات
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
