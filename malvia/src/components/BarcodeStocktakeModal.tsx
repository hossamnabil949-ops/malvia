import React, { useMemo, useState } from 'react';
import { X, ScanBarcode, Trash2, CheckCircle2, AlertTriangle, Minus, Plus } from 'lucide-react';
import { AutoPart, InventoryDiscrepancyError } from '../types/autoParts';
import { BarcodeScanButton, useBarcodeWedge } from './BarcodeScanner';
import { beep, cleanBarcode, findPartByBarcode } from '../utils/barcodeLookup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  onAddError: (error: InventoryDiscrepancyError) => void;
}

// جرد بالباركود: كل مسحة = +1 على الكمية المعدودة، وفي النهاية تُسجَّل الفروقات
// في «أخطاء وفروقات المخزون» (لا يتم تعديل الرصيد تلقائياً — التسوية تتم من هناك).
export const BarcodeStocktakeModal: React.FC<Props> = ({ isOpen, onClose, parts, onAddError }) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>([]); // آخر مُمسوح أولاً
  const [unknown, setUnknown] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);

  const handleScan = (raw: string) => {
    const part = findPartByBarcode(parts, raw);
    if (!part) {
      beep(false);
      setStatus(`❌ الكود ${cleanBarcode(raw)} غير مسجّل`);
      setUnknown((u) => (u.includes(cleanBarcode(raw)) ? u : [cleanBarcode(raw), ...u]));
      return;
    }
    beep(true);
    setStatus(`✅ ${part.name}`);
    setCounts((c) => ({ ...c, [part.id]: (c[part.id] || 0) + 1 }));
    setOrder((o) => [part.id, ...o.filter((id) => id !== part.id)]);
  };

  useBarcodeWedge(handleScan, isOpen && !done);

  const rows = useMemo(
    () =>
      order
        .map((id) => parts.find((p) => p.id === id))
        .filter((p): p is AutoPart => !!p)
        .map((p) => ({ part: p, counted: counts[p.id] || 0, diff: (counts[p.id] || 0) - p.stockQuantity })),
    [order, counts, parts]
  );
  const diffRows = rows.filter((r) => r.diff !== 0);

  if (!isOpen) return null;

  const setQty = (id: string, q: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, q) }));
  const remove = (id: string) => {
    setOrder((o) => o.filter((x) => x !== id));
    setCounts((c) => { const n = { ...c }; delete n[id]; return n; });
  };

  const submit = () => {
    const today = new Date().toISOString().split('T')[0];
    diffRows.forEach(({ part, counted, diff }, i) => {
      onAddError({
        id: `err-${Date.now()}-${i}`,
        errorNumber: `ERR-${Math.floor(1000 + Math.random() * 9000)}`,
        partId: part.id,
        partNumber: part.partNumber,
        partName: part.name,
        shelfLocation: part.shelfLocation,
        systemStock: part.stockQuantity,
        actualPhysicalStock: counted,
        differenceQty: diff,
        errorType: diff < 0 ? 'عجز / نقص مخزني' : 'فائض غير مسجل',
        estimatedFinancialImpact: Math.abs(diff) * (part.costPrice || 0),
        recordedDate: today,
        isCorrected: false,
        correctionAction: 'قيد انتظار',
        notes: `جرد بالباركود: ${diff > 0 ? `فائض +${diff}` : `عجز ${diff}`} قطعة`,
        auditorName: 'أمين المستودع / الجرد',
      });
    });
    setDone(true);
  };

  const reset = () => { setCounts({}); setOrder([]); setUnknown([]); setStatus(''); setDone(false); };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-surface-2 border border-neutral-700 shadow-2xl">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
            <ScanBarcode className="w-5 h-5" /> جرد بالباركود
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="text-white font-bold text-sm">
              {diffRows.length ? `تم تسجيل ${diffRows.length} فرق جرد في «أخطاء وفروقات المخزون»` : 'الجرد مطابق — مفيش فروقات'}
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={reset} className="px-4 h-10 rounded-xl bg-amber-500 text-neutral-950 text-xs font-bold">جرد جديد</button>
              <button onClick={onClose} className="px-4 h-10 rounded-xl bg-neutral-800 text-white text-xs font-bold">إغلاق</button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 flex flex-wrap items-center gap-2 border-b border-neutral-800">
              <BarcodeScanButton onScan={handleScan} label="كاميرا" status={status} />
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (manual.trim()) { handleScan(manual); setManual(''); } } }}
                placeholder="أو اكتب الكود واضغط Enter (قارئ USB شغّال تلقائياً)"
                className="flex-grow min-w-[200px] h-11 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-xs font-mono"
              />
              <p className="w-full text-[11px] text-neutral-400 min-h-[16px]">{status}</p>
            </div>

            <div className="flex-grow overflow-y-auto p-3 space-y-2">
              {rows.length === 0 && <p className="text-center text-xs text-neutral-500 py-10">امسح أول قطعة لبدء الجرد</p>}
              {rows.map(({ part, counted, diff }) => (
                <div key={part.id} className="p-3 rounded-xl bg-surface-1 border border-neutral-800 flex items-center gap-3">
                  <div className="flex-grow min-w-0">
                    <p className="text-xs font-bold text-white truncate">{part.name}</p>
                    <p className="text-[11px] text-neutral-400 font-mono">{part.partNumber} • بالنظام: {part.stockQuantity}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(part.id, counted - 1)} className="w-7 h-7 rounded-lg bg-neutral-800 text-white flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                    <input
                      type="number" min={0} value={counted}
                      onChange={(e) => setQty(part.id, Number(e.target.value) || 0)}
                      className="w-14 h-8 text-center rounded-lg bg-surface-2 border border-neutral-700 text-white text-xs"
                    />
                    <button onClick={() => setQty(part.id, counted + 1)} className="w-7 h-7 rounded-lg bg-neutral-800 text-white flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className={`w-12 text-center text-xs font-bold ${diff === 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-amber-300'}`}>
                    {diff > 0 ? `+${diff}` : diff}
                  </span>
                  <button onClick={() => remove(part.id)} className="p-1.5 text-neutral-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {unknown.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200 space-y-1">
                  <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> أكواد غير مسجّلة (سجّلها على القطعة من المخزون):</p>
                  <p className="font-mono break-all">{unknown.join(' • ')}</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-neutral-800 flex items-center justify-between gap-3">
              <p className="text-[11px] text-neutral-400">
                {rows.length} صنف • {diffRows.length} فيهم فرق
                <span className="block text-neutral-500">الجرد بيقارن الأصناف الممسوحة بس.</span>
              </p>
              <button
                onClick={submit}
                disabled={rows.length === 0}
                className="px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 text-xs font-bold"
              >
                اعتماد الجرد
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
