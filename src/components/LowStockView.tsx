import React, { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, Boxes, Check, Copy, Plus, Search, ArrowRight } from 'lucide-react';
import { AutoPart } from '../types/autoParts';

interface LowStockViewProps {
  parts: AutoPart[];
  canManage: boolean;
  onUpdateStock: (partId: string, addedStock: number) => void;
  onNavigateToInventory: () => void;
}

type Filter = 'critical' | 'out' | 'all';

// صفحة المخزون الحرج: الأصناف التي وصلت للحد الأدنى أو أقل. لا تدخل في عدّاد الإشعارات (المستنفد فقط يُنبّه).
export const LowStockView: React.FC<LowStockViewProps> = ({ parts, canManage, onUpdateStock, onNavigateToInventory }) => {
  const [filter, setFilter] = useState<Filter>('critical');
  const [brand, setBrand] = useState('all');
  const [query, setQuery] = useState('');
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [doneId, setDoneId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const atOrBelowMin = useMemo(() => parts.filter((p) => p.stockQuantity <= p.minAlertStock), [parts]);
  const criticalParts = useMemo(() => atOrBelowMin.filter((p) => p.stockQuantity > 0), [atOrBelowMin]);
  const outParts = useMemo(() => atOrBelowMin.filter((p) => p.stockQuantity <= 0), [atOrBelowMin]);

  const brands = useMemo(() => Array.from(new Set(atOrBelowMin.map((p) => p.brand))), [atOrBelowMin]);

  const visible = useMemo(() => {
    const base = filter === 'critical' ? criticalParts : filter === 'out' ? outParts : atOrBelowMin;
    const q = query.trim().toLowerCase();
    return base
      .filter((p) => brand === 'all' || p.brand === brand)
      .filter((p) => !q || p.partNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.stockQuantity - b.stockQuantity);
  }, [filter, criticalParts, outParts, atOrBelowMin, brand, query]);

  const parseQty = (partId: string): number => {
    const n = Math.floor(Number(qtyInputs[partId]));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const handleRestock = (part: AutoPart) => {
    const qty = parseQty(part.id);
    if (qty <= 0) return;
    onUpdateStock(part.id, qty);
    setQtyInputs((prev) => ({ ...prev, [part.id]: '' }));
    setDoneId(part.id);
    setTimeout(() => setDoneId(null), 2000);
  };

  const handleCopy = () => {
    const lines = visible.map(
      (p, i) => `${i + 1}. [${p.partNumber}] ${p.name} — المتوفر: ${p.stockQuantity} ${p.unit} (الحد الأدنى: ${p.minAlertStock})`
    );
    const text = `📦 *المخزون الحرج - ${new Date().toLocaleDateString('ar-EG')}*\n${lines.join('\n')}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
      active ? 'bg-amber-500 text-neutral-950 border-amber-400' : 'bg-surface-2 text-neutral-300 border-neutral-700 hover:bg-surface-3'
    }`;

  return (
    <div className="space-y-5 pb-12">
      <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">المخزون الحرج</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              الأصناف التي وصلت للحد الأدنى أو أقل. هذه القائمة للمتابعة فقط ولا تظهر في إشعارات الجرس، الإشعار للأصناف المستنفدة (0 حبة) فقط.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNavigateToInventory}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 self-start md:self-auto"
        >
          <span>المخزن</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-surface-2 border border-amber-500/20">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>وصلت للحد الأدنى (رصيد موجود)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono mt-1">{criticalParts.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-surface-2 border border-rose-500/20">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>نفدت بالكامل</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono mt-1">{outParts.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>إجمالي الأصناف تحت الحد</span>
            <Boxes className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1">{atOrBelowMin.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={tabClass(filter === 'critical')} onClick={() => setFilter('critical')}>
            حرج ({criticalParts.length})
          </button>
          <button type="button" className={tabClass(filter === 'out')} onClick={() => setFilter('out')}>
            مستنفد ({outParts.length})
          </button>
          <button type="button" className={tabClass(filter === 'all')} onClick={() => setFilter('all')}>
            الكل ({atOrBelowMin.length})
          </button>
          {brands.length > 1 && (
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs bg-surface-2 text-neutral-200 border border-neutral-700 focus:outline-none focus:border-amber-400"
            >
              <option value="all">كل الماركات</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الرقم"
              className="pr-8 pl-3 py-1.5 rounded-xl text-xs bg-surface-2 text-neutral-200 border border-neutral-700 focus:outline-none focus:border-amber-400 w-44"
            />
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={visible.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-3 hover:bg-surface-4 text-xs font-bold text-amber-400 border border-amber-500/30 disabled:opacity-40"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'تم النسخ' : 'نسخ القائمة'}</span>
          </button>
        </div>
      </div>

      <div className="rounded-3xl bg-surface-2 border border-neutral-800 divide-y divide-neutral-800/80">
        {visible.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400">لا توجد أصناف في هذا التصنيف</div>
        ) : (
          visible.map((part) => {
            const isOut = part.stockQuantity <= 0;
            const pct = Math.min(100, Math.max(4, (part.stockQuantity / (part.minAlertStock || 1)) * 100));
            return (
              <div key={part.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {part.partNumber}
                    </span>
                    <span className="text-sm font-bold text-white truncate">{part.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold">{part.brand}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400">{part.shelfLocation}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] max-w-md">
                    <span className={`font-bold ${isOut ? 'text-rose-400' : 'text-amber-400'}`}>
                      {isOut ? 'نفد تماماً' : 'مستوى حرج'}
                    </span>
                    <span className="font-mono text-neutral-400">
                      المتوفر: <strong className={isOut ? 'text-rose-400' : 'text-amber-400'}>{part.stockQuantity}</strong> / الحد الأدنى: {part.minAlertStock} {part.unit}
                    </span>
                  </div>
                  <div className="w-full max-w-md h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div className={`h-full ${isOut ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: isOut ? '0%' : `${pct}%` }} />
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                    <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-neutral-700/80">
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        placeholder="الكمية"
                        value={qtyInputs[part.id] ?? ''}
                        onChange={(e) => setQtyInputs((prev) => ({ ...prev, [part.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRestock(part); }}
                        className="w-20 h-7 text-center font-mono text-xs font-bold bg-surface-1 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                      />
                      <span className="text-[10px] text-neutral-400 px-1">{part.unit}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestock(part)}
                      disabled={parseQty(part.id) <= 0}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 ${
                        doneId === part.id ? 'bg-emerald-500 text-neutral-950' : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
                      }`}
                    >
                      {doneId === part.id ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{doneId === part.id ? 'تم' : 'توريد'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
