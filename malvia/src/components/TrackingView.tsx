import React, { useMemo, useState } from 'react';
import { ScanBarcode, Search, Plus, X, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { AutoPart } from '../types/autoParts';
import {
  StockBatch, SerialUnit, TrackingMode, TRACKING_LABEL, SERIAL_STATUS_LABEL,
  expiryState, daysToExpiry, expiryBuckets, unassignedStock, inStockUnits, parseSerialList,
} from '../utils/trackingLogic';
import { todayISO } from '../utils/dateRange';

interface TrackingViewProps {
  parts: AutoPart[];
  batches: StockBatch[];
  units: SerialUnit[];
  onSetTracking: (partId: string, mode: TrackingMode) => void;
  onAddBatch: (input: { partId: string; batchNo: string; expiryDate?: string; quantity: number; note?: string }) => { ok: boolean; message?: string };
  onWriteOff: (batchId: string, qty: number, reason: string) => { ok: boolean; message?: string };
  onRegisterSerials: (partId: string, serials: string[]) => { ok: boolean; message?: string };
  onScrapSerial: (unitId: string, reason: string) => { ok: boolean; message?: string };
}

type Tab = 'expiry' | 'serials' | 'setup';
type ExpiryFilter = 'all' | 'expired' | 'd30' | 'd60' | 'd90' | 'none';

const inputCls =
  'w-full h-9 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400';

const STATE_STYLE: Record<string, string> = {
  expired: 'bg-rose-500/20 text-rose-300',
  soon: 'bg-amber-500/20 text-amber-300',
  ok: 'bg-emerald-500/15 text-emerald-300',
  none: 'bg-neutral-700/40 text-neutral-400',
  empty: 'bg-neutral-700/40 text-neutral-500',
};

export const TrackingView: React.FC<TrackingViewProps> = ({ parts, batches, units, onSetTracking, onAddBatch, onWriteOff, onRegisterSerials, onScrapSerial }) => {
  const today = todayISO();
  const [tab, setTab] = useState<Tab>('expiry');
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const say = (res: { ok: boolean; message?: string }, okText: string) => setFlash({ ok: res.ok, text: res.ok ? okText : res.message || 'تعذّر التنفيذ' });

  // ---------------- الصلاحية ----------------
  const [filter, setFilter] = useState<ExpiryFilter>('all');
  const [search, setSearch] = useState('');
  const buckets = useMemo(() => expiryBuckets(batches, today), [batches, today]);
  const qty = (list: StockBatch[]) => list.reduce((s, b) => s + b.quantity, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base =
      filter === 'expired' ? buckets.expired
      : filter === 'd30' ? buckets.within30
      : filter === 'd60' ? [...buckets.within30, ...buckets.within60]
      : filter === 'd90' ? [...buckets.within30, ...buckets.within60, ...buckets.within90]
      : filter === 'none' ? buckets.noExpiry
      : batches.filter((b) => b.quantity > 0);
    return base
      .filter((b) => {
        const p = partById.get(b.partId);
        return !q || b.batchNo.toLowerCase().includes(q) || p?.name.toLowerCase().includes(q) || p?.partNumber.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
  }, [batches, buckets, filter, search, partById]);

  const [batchModal, setBatchModal] = useState(false);
  const [bForm, setBForm] = useState({ partId: '', batchNo: '', expiryDate: '', quantity: '', note: '' });
  const [bError, setBError] = useState('');
  const batchParts = parts.filter((p) => p.tracking === 'batch');
  const bPart = partById.get(bForm.partId);
  const bFree = bPart ? unassignedStock(bPart.stockQuantity, batches.filter((b) => b.partId === bPart.id)) : 0;

  const submitBatch = () => {
    const res = onAddBatch({ partId: bForm.partId, batchNo: bForm.batchNo, expiryDate: bForm.expiryDate || undefined, quantity: Number(bForm.quantity), note: bForm.note });
    if (!res.ok) { setBError(res.message || 'تعذّر الحفظ'); return; }
    setBatchModal(false);
    setBForm({ partId: '', batchNo: '', expiryDate: '', quantity: '', note: '' });
    setBError('');
    setFlash({ ok: true, text: 'تم تسجيل الدفعة' });
  };

  const [writeOff, setWriteOff] = useState<StockBatch | null>(null);
  const [woQty, setWoQty] = useState('');
  const [woReason, setWoReason] = useState('');
  const [woError, setWoError] = useState('');
  const submitWriteOff = () => {
    if (!writeOff) return;
    const res = onWriteOff(writeOff.id, Number(woQty), woReason);
    if (!res.ok) { setWoError(res.message || 'تعذّر التنفيذ'); return; }
    setWriteOff(null);
    setWoQty(''); setWoReason(''); setWoError('');
    setFlash({ ok: true, text: 'تم الإعدام وخصم الكمية من المخزون' });
  };

  // ---------------- السيريال ----------------
  const [serialSearch, setSerialSearch] = useState('');
  const [sPartId, setSPartId] = useState('');
  const [sText, setSText] = useState('');
  const serialParts = parts.filter((p) => p.tracking === 'serial');
  const sPart = partById.get(sPartId);
  const sFree = sPart ? Math.max(0, sPart.stockQuantity - inStockUnits(units, sPart.id).length) : 0;
  const parsed = parseSerialList(sText);
  const foundUnits = useMemo(() => {
    const q = serialSearch.trim().toLowerCase();
    if (!q) return [] as SerialUnit[];
    return units
      .filter((u) => u.serial.toLowerCase().includes(q) || partById.get(u.partId)?.name.toLowerCase().includes(q) || (u.customerName || '').toLowerCase().includes(q) || (u.soldInvoiceNumber || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [units, serialSearch, partById]);
  const [scrap, setScrap] = useState<SerialUnit | null>(null);
  const [scrapReason, setScrapReason] = useState('');
  const [scrapError, setScrapError] = useState('');

  const submitSerials = () => {
    const res = onRegisterSerials(sPartId, parsed);
    say(res, `تم تسجيل ${parsed.length} رقم تسلسلي`);
    if (res.ok) setSText('');
  };
  const submitScrap = () => {
    if (!scrap) return;
    const res = onScrapSerial(scrap.id, scrapReason);
    if (!res.ok) { setScrapError(res.message || 'تعذّر التنفيذ'); return; }
    setScrap(null); setScrapReason(''); setScrapError('');
    setFlash({ ok: true, text: 'تم استبعاد الوحدة وخصمها من المخزون' });
  };

  // ---------------- الإعداد ----------------
  const [setupSearch, setSetupSearch] = useState('');
  const setupParts = useMemo(() => {
    const q = setupSearch.trim().toLowerCase();
    return (q ? parts.filter((p) => p.name.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q)) : parts).slice(0, 100);
  }, [parts, setupSearch]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'expiry', label: 'الدفعات والصلاحية' },
    { id: 'serials', label: 'الأرقام التسلسلية' },
    { id: 'setup', label: 'تفعيل التتبع للأصناف' },
  ];

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center gap-2">
        <ScanBarcode className="w-5 h-5 text-amber-400" />
        <h2 className="text-base font-black text-white">الدفعات والسيريال</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setFlash(null); }}
            className={`px-3 h-8 rounded-xl text-xs font-bold border ${tab === t.id ? 'bg-amber-500 text-black border-amber-500' : 'bg-surface-1 text-neutral-300 border-neutral-700 hover:border-neutral-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {flash && (
        <div className={`text-xs font-bold flex items-center gap-1.5 ${flash.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {flash.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {flash.text}
        </div>
      )}

      {tab === 'expiry' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'منتهية الصلاحية', n: buckets.expired.length, q: qty(buckets.expired), color: 'text-rose-400' },
              { label: 'تنتهي خلال 30 يوماً', n: buckets.within30.length, q: qty(buckets.within30), color: 'text-amber-300' },
              { label: 'خلال 31–90 يوماً', n: buckets.within60.length + buckets.within90.length, q: qty([...buckets.within60, ...buckets.within90]), color: 'text-sky-300' },
              { label: 'سليمة / بلا تاريخ', n: buckets.later.length + buckets.noExpiry.length, q: qty([...buckets.later, ...buckets.noExpiry]), color: 'text-emerald-300' },
            ].map((k) => (
              <div key={k.label} className="p-3 rounded-2xl bg-surface-1 border border-neutral-800">
                <div className="text-[11px] text-neutral-400">{k.label}</div>
                <div className={`font-mono font-black text-base ${k.color}`}>{k.q.toLocaleString()} وحدة</div>
                <div className="text-[10px] text-neutral-500">{k.n} دفعة</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-neutral-500 absolute right-3 top-2.5" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الصنف أو رقم الدفعة" className={`${inputCls} pr-9`} />
            </div>
            {([['all', 'الكل'], ['expired', 'المنتهية'], ['d30', '30 يوماً'], ['d60', '60 يوماً'], ['d90', '90 يوماً'], ['none', 'بلا تاريخ']] as [ExpiryFilter, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`px-3 h-8 rounded-xl text-[11px] font-bold border ${filter === id ? 'bg-neutral-200 text-black border-neutral-200' : 'bg-surface-1 text-neutral-300 border-neutral-700'}`}>{label}</button>
            ))}
            <button type="button" onClick={() => { setBatchModal(true); setBError(''); }} className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> دفعة لرصيد موجود
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-surface-1 text-neutral-400">
                <tr>
                  <th className="p-2 text-right">الصنف</th>
                  <th className="p-2 text-right">الدفعة</th>
                  <th className="p-2 text-center">الانتهاء</th>
                  <th className="p-2 text-center">المتبقي</th>
                  <th className="p-2 text-right">المصدر</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const p = partById.get(b.partId);
                  const st = expiryState(b, today);
                  const d = daysToExpiry(b, today);
                  return (
                    <tr key={b.id} className="border-t border-neutral-800">
                      <td className="p-2">
                        <div className="font-bold text-white">{p?.name ?? '—'}</div>
                        <div className="font-mono text-[10px] text-amber-400">{p?.partNumber}</div>
                      </td>
                      <td className="p-2 font-mono text-neutral-200">{b.batchNo}</td>
                      <td className="p-2 text-center">
                        <div className="font-mono text-white">{b.expiryDate || '—'}</div>
                        <span className={`inline-block mt-0.5 px-1.5 rounded text-[10px] font-bold ${STATE_STYLE[st]}`}>
                          {st === 'expired' ? `منتهية منذ ${Math.abs(d ?? 0)} يوم` : st === 'soon' ? (d === 0 ? 'تنتهي اليوم' : `بعد ${d} يوم`) : st === 'ok' ? `بعد ${d} يوم` : 'بلا تاريخ'}
                        </span>
                      </td>
                      <td className="p-2 text-center font-mono font-black text-amber-300">{b.quantity}</td>
                      <td className="p-2 text-neutral-400">{b.purchaseInvoiceNumber ? `${b.purchaseInvoiceNumber} · ${b.supplierName ?? ''}` : (b.note || 'رصيد سابق')}</td>
                      <td className="p-2 text-left">
                        <button type="button" onClick={() => { setWriteOff(b); setWoQty(String(b.quantity)); setWoReason(st === 'expired' ? 'منتهية الصلاحية' : ''); setWoError(''); }} className="px-2 h-7 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-[11px] font-bold flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> إعدام
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-neutral-500">لا توجد دفعات مطابقة. فعّل التتبع للصنف من تبويب «تفعيل التتبع للأصناف» ثم أدخل الدفعة عند التوريد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-neutral-500">الدفعات المنتهية لا تُباع من الكاشير. «إعدام» يخصم الكمية من الدفعة ومن رصيد الصنف ويُسجَّل في حركة المخزون وسجل التدقيق.</p>
        </div>
      )}

      {tab === 'serials' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute right-3 top-2.5" />
            <input value={serialSearch} onChange={(e) => setSerialSearch(e.target.value)} placeholder="ابحث برقم تسلسلي أو اسم صنف أو عميل أو رقم فاتورة" className={`${inputCls} pr-9`} />
          </div>
          {serialSearch.trim() && (
            <div className="rounded-2xl border border-neutral-800 divide-y divide-neutral-800 text-xs">
              {foundUnits.length === 0 && <div className="p-6 text-center text-neutral-500">لا توجد نتائج</div>}
              {foundUnits.map((u) => {
                const p = partById.get(u.partId);
                return (
                  <div key={u.id} className="p-3 bg-surface-1 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-mono font-black text-white">{u.serial}</div>
                      <div className="text-neutral-400">{p?.name ?? '—'} <span className="font-mono text-[10px] text-amber-400">{p?.partNumber}</span></div>
                      <div className="text-[10px] text-neutral-500">
                        دخل المخزن {u.receivedDate}{u.purchaseInvoiceNumber ? ` (فاتورة توريد ${u.purchaseInvoiceNumber})` : ''}
                        {u.status === 'sold' && ` · بيع بفاتورة ${u.soldInvoiceNumber ?? ''} بتاريخ ${u.soldAt ?? ''} للعميل ${u.customerName ?? ''}${u.customerPhone ? ` (${u.customerPhone})` : ''}`}
                        {u.status === 'scrapped' && u.note ? ` · ${u.note}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${u.status === 'in_stock' ? 'bg-emerald-500/15 text-emerald-300' : u.status === 'sold' ? 'bg-sky-500/15 text-sky-300' : 'bg-rose-500/15 text-rose-300'}`}>
                      {SERIAL_STATUS_LABEL[u.status]}
                    </span>
                    {u.status === 'in_stock' && (
                      <button type="button" onClick={() => { setScrap(u); setScrapReason(''); setScrapError(''); }} className="px-2 h-7 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-[11px] font-bold">استبعاد (تالف)</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-surface-1 border border-neutral-800 space-y-2">
            <h3 className="text-xs font-black text-white">تسجيل أرقام تسلسلية لرصيد موجود بالمخزن</h3>
            <select value={sPartId} onChange={(e) => setSPartId(e.target.value)} className={inputCls}>
              <option value="">— اختر صنفاً مفعّلاً له السيريال —</option>
              {serialParts.map((p) => (<option key={p.id} value={p.id}>{p.partNumber} · {p.name}</option>))}
            </select>
            {sPart && (
              <>
                <textarea value={sText} onChange={(e) => setSText(e.target.value)} rows={4} placeholder="رقم تسلسلي في كل سطر (أو افصل بفاصلة)" className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-neutral-700 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-amber-400" />
                <div className="text-[11px] text-neutral-400">
                  المدخل {parsed.length} · المتاح تسجيله {sFree} (رصيد {sPart.stockQuantity} منها {inStockUnits(units, sPart.id).length} مسجّلة)
                </div>
                <button type="button" onClick={submitSerials} disabled={parsed.length === 0} className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-black">تسجيل الأرقام</button>
              </>
            )}
            {serialParts.length === 0 && <div className="text-[11px] text-neutral-500">لا توجد أصناف مفعّل لها السيريال بعد. فعّله من تبويب «تفعيل التتبع للأصناف».</div>}
          </div>
        </div>
      )}

      {tab === 'setup' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute right-3 top-2.5" />
            <input value={setupSearch} onChange={(e) => setSetupSearch(e.target.value)} placeholder="ابحث عن صنف" className={`${inputCls} pr-9`} />
          </div>
          <div className="rounded-2xl border border-neutral-800 divide-y divide-neutral-800 text-xs">
            {setupParts.map((p) => {
              const mode: TrackingMode = p.tracking ?? 'none';
              const free = mode === 'batch' ? unassignedStock(p.stockQuantity, batches.filter((b) => b.partId === p.id))
                : mode === 'serial' ? Math.max(0, p.stockQuantity - inStockUnits(units, p.id).length) : 0;
              return (
                <div key={p.id} className="p-3 bg-surface-1 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold text-white">{p.name}</div>
                    <div className="font-mono text-[10px] text-amber-400">{p.partNumber} · الرصيد {p.stockQuantity}</div>
                  </div>
                  {mode !== 'none' && free > 0 && (
                    <span className="text-[10px] text-amber-300 font-bold">{free} {mode === 'batch' ? 'بدون دفعة' : 'بدون رقم تسلسلي'}</span>
                  )}
                  <select value={mode} onChange={(e) => onSetTracking(p.id, e.target.value as TrackingMode)} className="h-8 px-2 rounded-lg bg-surface-2 border border-neutral-700 text-white text-[11px]">
                    {(['none', 'batch', 'serial'] as TrackingMode[]).map((m) => (<option key={m} value={m}>{TRACKING_LABEL[m]}</option>))}
                  </select>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-neutral-500">
            الأصناف بلا تتبع تعمل كالمعتاد. عند تفعيل «دفعات» يُباع الأقرب انتهاءً أولاً ولا يُباع المنتهي. وعند تفعيل «سيريال» يلزم اختيار رقم لكل وحدة عند البيع (سجّل أرقام الرصيد الحالي أولاً).
          </p>
        </div>
      )}

      {batchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBatchModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-surface-1 border border-neutral-700 p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white text-sm">دفعة لرصيد موجود</h3>
              <button type="button" onClick={() => setBatchModal(false)} className="text-neutral-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <select value={bForm.partId} onChange={(e) => { setBForm((f) => ({ ...f, partId: e.target.value })); setBError(''); }} className={inputCls}>
              <option value="">— اختر صنفاً مفعّلاً له الدفعات —</option>
              {batchParts.map((p) => (<option key={p.id} value={p.id}>{p.partNumber} · {p.name}</option>))}
            </select>
            {bPart && <div className="text-[11px] text-sky-300 font-bold">المتاح بدون دفعة: {bFree}</div>}
            <div className="grid grid-cols-2 gap-2">
              <input value={bForm.batchNo} onChange={(e) => setBForm((f) => ({ ...f, batchNo: e.target.value }))} placeholder="رقم الدفعة (تلقائي لو فاضي)" className={`${inputCls} font-mono`} />
              <input type="number" min="1" value={bForm.quantity} onChange={(e) => { setBForm((f) => ({ ...f, quantity: e.target.value })); setBError(''); }} placeholder="الكمية" className={`${inputCls} font-mono`} />
            </div>
            <label className="block text-neutral-300 font-bold">تاريخ الانتهاء (اختياري)
              <input type="date" value={bForm.expiryDate} onChange={(e) => setBForm((f) => ({ ...f, expiryDate: e.target.value }))} className={`${inputCls} mt-1`} />
            </label>
            <input value={bForm.note} onChange={(e) => setBForm((f) => ({ ...f, note: e.target.value }))} placeholder="ملاحظة (اختياري)" className={inputCls} />
            {bError && <div className="text-[11px] font-bold text-rose-400">{bError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={submitBatch} disabled={!bForm.partId || !(Number(bForm.quantity) > 0)} className="flex-1 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black">حفظ الدفعة</button>
              <button type="button" onClick={() => setBatchModal(false)} className="px-5 h-10 rounded-xl bg-neutral-800 text-neutral-300 font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {writeOff && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setWriteOff(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface-1 border border-neutral-700 p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-white text-sm">إعدام من دفعة {writeOff.batchNo}</h3>
            <p className="text-neutral-400">{partById.get(writeOff.partId)?.name} — المتبقي {writeOff.quantity}. تُخصم الكمية من الدفعة ومن رصيد الصنف ولا يمكن التراجع.</p>
            <input type="number" min="1" max={writeOff.quantity} value={woQty} onChange={(e) => { setWoQty(e.target.value); setWoError(''); }} className={`${inputCls} font-mono`} />
            <input value={woReason} onChange={(e) => { setWoReason(e.target.value); setWoError(''); }} placeholder="السبب (إجباري)" className={inputCls} />
            {woError && <div className="text-[11px] font-bold text-rose-400">{woError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={submitWriteOff} className="flex-1 h-10 rounded-xl bg-rose-400 hover:bg-rose-300 text-black font-black">تأكيد الإعدام</button>
              <button type="button" onClick={() => setWriteOff(null)} className="px-5 h-10 rounded-xl bg-neutral-800 text-neutral-300 font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {scrap && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setScrap(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface-1 border border-neutral-700 p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-white text-sm">استبعاد السيريال {scrap.serial}</h3>
            <p className="text-neutral-400">ستُخصم وحدة واحدة من رصيد الصنف ولا يمكن التراجع.</p>
            <input value={scrapReason} onChange={(e) => { setScrapReason(e.target.value); setScrapError(''); }} placeholder="السبب (إجباري)" className={inputCls} />
            {scrapError && <div className="text-[11px] font-bold text-rose-400">{scrapError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={submitScrap} className="flex-1 h-10 rounded-xl bg-rose-400 hover:bg-rose-300 text-black font-black">تأكيد الاستبعاد</button>
              <button type="button" onClick={() => setScrap(null)} className="px-5 h-10 rounded-xl bg-neutral-800 text-neutral-300 font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
