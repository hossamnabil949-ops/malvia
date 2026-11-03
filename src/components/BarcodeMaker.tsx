import React, { useMemo, useState } from 'react';
import { Printer, Barcode, Search, X, Plus, CheckCircle2 } from 'lucide-react';
import { AutoPart } from '../types/autoParts';
import { barcodeValues, findBarcodeConflict, makeInternalBarcode } from '../utils/barcodeManager';

type Props = {
  parts: AutoPart[];
  onUpdatePartPrices?: (partId: string, costPrice: number, salePrice: number, barcode?: string) => void;
  onClose: () => void;
};

function code128Svg(value: string) {
  // Code 128-B patterns (widths for symbols 0..106).
  const patterns = [
'212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
  ];
  const codes = Array.from(value).map(ch => ch.charCodeAt(0));
  if (!codes.length || codes.some(n => n < 32 || n > 126)) return '';
  const symbols = [104, ...codes.map(n => n - 32)];
  let checksum = 104;
  symbols.slice(1).forEach((code, i) => { checksum += code * (i + 1); });
  symbols.push(checksum % 103, 106);
  let x = 10;
  const rects: string[] = [];
  symbols.forEach(symbol => {
    let black = true;
    for (const width of patterns[symbol]) {
      const w = Number(width);
      if (black) rects.push(`<rect x="${x}" y="0" width="${w}" height="54"/>`);
      x += w;
      black = !black;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 72" role="img"><g fill="#000">${rects.join('')}</g><text x="${(x + 20) / 2}" y="68" text-anchor="middle" font-family="monospace" font-size="11">${value.replace(/[&<>"]/g, '')}</text></svg>`;
}

export const BarcodeMaker: React.FC<Props> = ({ parts, onUpdatePartPrices, onClose }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [copies, setCopies] = useState(1);
  const [error, setError] = useState('');
  const rows = useMemo(() => parts.filter(p => !query || [p.name, p.partNumber, ...barcodeValues(p)].some(v => String(v || '').toLowerCase().includes(query.toLowerCase()))), [parts, query]);
  const selectedParts = parts.filter(p => selected.includes(p.id));
  const buildCodes = () => {
    setError('');
    const generated: Record<string, string> = {};
    const occupied = parts.flatMap(p => barcodeValues(p));
    for (const part of selectedParts) {
      const current = part.internalBarcode || part.barcode;
      if (current) { generated[part.id] = current; continue; }
      const code = makeInternalBarcode([...occupied, ...Object.values(generated)]);
      if (findBarcodeConflict(parts, code, part.id)) { setError('تعذر إنشاء كود فريد. حاول مرة أخرى.'); return null; }
      if (!onUpdatePartPrices) { setError('تحديث بيانات الأصناف غير متاح في هذه الشاشة.'); return null; }
      generated[part.id] = code;
      onUpdatePartPrices(part.id, part.costPrice, part.salePrice, code);
    }
    return generated;
  };
  const print = () => {
    const generated = buildCodes();
    if (!generated) return;
    const labels = selectedParts.flatMap(part => Array.from({ length: Math.max(1, Math.min(100, copies)) }, () => {
      const code = generated[part.id] || part.internalBarcode || part.barcode || '';
      return `<article class="label"><b>${part.name}</b><small>${part.partNumber}</small>${code ? code128Svg(code) : '<small>لا يوجد باركود</small>'}<strong>${Number(part.salePrice || 0).toLocaleString('ar-EG')} ج.م</strong></article>`;
    })).join('');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { setError('اسمح بالنوافذ المنبثقة لإتمام الطباعة.'); return; }
    win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ملصقات MALVIA</title><style>body{font-family:Arial;padding:8mm;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.label{border:1px dashed #aaa;padding:3mm;text-align:center;break-inside:avoid;min-width:0}.label b,.label small,.label strong{display:block;margin:2mm 0}.label svg{width:100%;height:18mm}@media print{body{padding:0}.label{border:1px solid #ddd}}</style></head><body>${labels}</body></html>`);
    win.document.close(); win.focus(); win.print();
  };
  return <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-2 sm:p-5" dir="rtl">
    <section className="w-full max-w-4xl max-h-[94dvh] overflow-hidden rounded-2xl border border-neutral-700 bg-surface-2 flex flex-col shadow-2xl">
      <header className="p-4 border-b border-neutral-700 flex items-center justify-between"><div><h2 className="font-black text-white flex items-center gap-2"><Barcode className="text-amber-400"/> صانع الباركود</h2><p className="text-xs text-neutral-400 mt-1">Code 128 · إنشاء داخلي وطباعة ملصقات</p></div><button onClick={onClose} className="p-2 rounded-lg bg-neutral-800 text-white" aria-label="إغلاق"><X/></button></header>
      <div className="p-4 space-y-3 overflow-y-auto">
        <div className="relative"><Search className="absolute right-3 top-3 w-4 h-4 text-neutral-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم الصنف أو رقمه أو الباركود" className="w-full h-10 pr-10 pl-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-sm"/></div>
        <div className="flex flex-wrap gap-2 text-xs"><button onClick={()=>setSelected(rows.map(p=>p.id))} className="px-3 py-2 rounded-lg bg-neutral-800 text-white">تحديد النتائج</button><button onClick={()=>setSelected([])} className="px-3 py-2 rounded-lg bg-neutral-800 text-white">إلغاء التحديد</button><label className="mr-auto flex items-center gap-2 text-neutral-300">عدد النسخ <input type="number" min="1" max="100" value={copies} onChange={e=>setCopies(Math.max(1,Math.min(100,Number(e.target.value)||1)))} className="w-16 p-2 rounded-lg bg-surface-1 border border-neutral-700 text-white"/></label></div>
        <div className="border border-neutral-800 rounded-xl divide-y divide-neutral-800 max-h-[42vh] overflow-y-auto">{rows.map(part=><label key={part.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-800/50"><input type="checkbox" checked={selected.includes(part.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,part.id]:old.filter(id=>id!==part.id))}/><div className="min-w-0 flex-1"><b className="text-white text-sm">{part.name}</b><p className="text-[11px] text-neutral-400">{part.partNumber} · {barcodeValues(part).join(' / ') || 'لا يوجد باركود'}</p></div><span className="text-[11px] text-amber-300">{part.barcode || 'سيُنشأ عند الحفظ'}</span></label>)}</div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>
      <footer className="p-4 border-t border-neutral-700 flex flex-wrap justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-sm">إغلاق</button><button disabled={!selected.length} onClick={print} className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 font-bold text-sm disabled:opacity-40 flex items-center gap-2"><Printer className="w-4 h-4"/> طباعة الملصقات ({selected.length})</button></footer>
    </section>
  </div>;
};
