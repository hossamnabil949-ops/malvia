import React, { useState } from 'react';
import { Plus, X, Pencil, Check } from 'lucide-react';
import { GENERAL_BRAND, normalizeBrand } from '../data/brands';

interface BrandBarProps {
  brands: string[]; // تشمل «شامل» في أولها
  selected: string;
  onSelect: (brand: string) => void;
  onAddBrand?: (brand: string) => void;
  onRemoveBrand?: (brand: string) => void;
  countByBrand?: Record<string, number>;
  inactiveClass?: string;
}

// شريط الماركات: اختيار ماركة للتصفية، مع إضافة ماركة جديدة أو حذف ماركة لا يتعامل بها المحل
export const BrandBar: React.FC<BrandBarProps> = ({
  brands,
  selected,
  onSelect,
  onAddBrand,
  onRemoveBrand,
  countByBrand = {},
  inactiveClass = 'bg-surface-1 text-neutral-400 hover:text-white border border-neutral-800',
}) => {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const canManage = !!(onAddBrand || onRemoveBrand);

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeBrand(name);
    if (!clean || clean === GENERAL_BRAND) return;
    onAddBrand?.(clean);
    onSelect(clean);
    setName('');
    setAdding(false);
  };

  const handleRemove = (b: string) => {
    const count = countByBrand[b] || 0;
    const msg = count > 0
      ? `ماركة «${b}» عليها ${count} صنف. سيُحذف زر الماركة فقط، وتبقى الأصناف ظاهرة تحت «شامل». هل تريد الحذف؟`
      : `حذف ماركة «${b}» من القائمة؟`;
    if (!window.confirm(msg)) return;
    onRemoveBrand?.(b);
    if (selected === b) onSelect(GENERAL_BRAND);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-1">
        {brands.map((b) => {
          const isGeneral = b === GENERAL_BRAND;
          return (
            <div key={b} className="relative shrink-0">
              <button
                type="button"
                onClick={() => onSelect(b)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selected === b ? 'bg-amber-500 text-neutral-950 font-black shadow-sm' : inactiveClass
                } ${editing && !isGeneral ? 'pl-7' : ''}`}
              >
                {b}
              </button>
              {editing && !isGeneral && onRemoveBrand && (
                <button
                  type="button"
                  onClick={() => handleRemove(b)}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center"
                  title={`حذف ${b}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {onAddBrand && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border border-dashed border-amber-500/60 text-amber-300 hover:bg-neutral-800 flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ماركة</span>
          </button>
        )}

        {onRemoveBrand && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1 whitespace-nowrap ${
              editing ? 'bg-rose-600 border-rose-500 text-white' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            <span>{editing ? 'تم' : 'حذف ماركة'}</span>
          </button>
        )}
      </div>

      {canManage && adding && onAddBrand && (
        <form onSubmit={submitAdd} className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم الماركة (مثال: شيفروليه أو Chevrolet)"
            className="flex-grow h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-amber-400"
          />
          <button type="submit" className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs">
            إضافة
          </button>
        </form>
      )}
    </div>
  );
};
