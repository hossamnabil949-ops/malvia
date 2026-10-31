import React, { useMemo, useState } from 'react';
import { Wallet, Lock, Printer, CheckCircle2, AlertTriangle, ChevronDown, Clock } from 'lucide-react';
import type { Shift, TreasuryTransaction } from '../types/autoParts';
import {
  DENOMINATIONS, countTotal, summarizeShift, varianceOf, varianceKind, findOpenShift, lastClosedShift, fmtMoney, round2,
} from '../utils/shiftLogic';

interface ShiftsViewProps {
  shifts: Shift[];
  treasury: TreasuryTransaction[];
  isManager: boolean;
  currentUserName: string;
  requireShiftForSales: boolean;
  openShiftsCount: number;
  onOpenShift: (p: { openingCash: number; denominations?: Record<string, number>; note?: string; carryOverDiff?: number }) => boolean;
  onCloseShift: (shiftId: string, p: { countedCash: number; denominations?: Record<string, number>; note?: string; postVariance: boolean }) => boolean;
  onToggleRequireShift: (value: boolean) => void;
}

const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDuration = (from?: string, to?: string) => {
  if (!from) return '—';
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(mins / 60)} س ${mins % 60} د`;
};

/** شارة الفرق: عجز (أحمر) / زيادة (أخضر) / مطابق */
const VarianceBadge: React.FC<{ value: number; big?: boolean }> = ({ value, big }) => {
  const kind = varianceKind(value);
  const cls =
    kind === 'match' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : kind === 'shortage' ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
    : 'bg-sky-500/15 text-sky-300 border-sky-500/40';
  const text = kind === 'match' ? 'مطابق ✓' : kind === 'shortage' ? `عجز ${fmtMoney(Math.abs(value))} ج.م` : `زيادة ${fmtMoney(value)} ج.م`;
  return <span className={`inline-block rounded-lg border font-black ${big ? 'px-4 py-2 text-base' : 'px-2 py-0.5 text-[11px]'} ${cls}`}>{text}</span>;
};

/** عدّاد فئات العملة */
const DenominationCounter: React.FC<{
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled?: boolean;
}> = ({ values, onChange, disabled }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    {DENOMINATIONS.map(d => {
      const key = String(d.value);
      const qty = Math.max(0, Math.floor(Number(values[key]) || 0));
      return (
        <div key={key} className="flex items-center gap-2 bg-surface-1 border border-neutral-800 rounded-xl px-3 py-2">
          <span className="w-16 text-xs font-bold text-neutral-200">{d.label}</span>
          <span className="text-neutral-500 text-xs">×</span>
          <input
            type="number" inputMode="numeric" min={0} step={1} disabled={disabled}
            value={values[key] ?? ''}
            onChange={e => onChange({ ...values, [key]: e.target.value })}
            placeholder="0"
            className="w-20 h-9 rounded-lg bg-surface-2 border border-neutral-700 text-white text-center text-sm focus:outline-none focus:border-amber-400 disabled:opacity-50"
          />
          <span className="flex-1 text-left text-xs text-neutral-400 tabular-nums">{qty > 0 ? fmtMoney(qty * d.value) : ''}</span>
        </div>
      );
    })}
  </div>
);

const toDenoms = (v: Record<string, string>): Record<string, number> => {
  const out: Record<string, number> = {};
  Object.entries(v).forEach(([k, s]) => { const q = Math.floor(Number(s) || 0); if (q > 0) out[k] = q; });
  return out;
};

const printShift = (s: Shift, shopName = 'MALVIA') => {
  const w = window.open('', '_blank', 'width=420,height=700');
  if (!w) { window.alert('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة وجرّب تاني.'); return; }
  const row = (a: string, b: string, bold = false) =>
    `<tr><td style="padding:3px 0;${bold ? 'font-weight:800' : ''}">${a}</td><td style="padding:3px 0;text-align:left;${bold ? 'font-weight:800' : ''}">${b}</td></tr>`;
  const v = s.variance ?? 0;
  const vText = varianceKind(v) === 'match' ? 'مطابق' : varianceKind(v) === 'shortage' ? `عجز ${fmtMoney(Math.abs(v))}` : `زيادة ${fmtMoney(v)}`;
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير وردية ${esc(s.shiftNumber)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;font-size:13px;margin:16px;color:#000}h2,h3{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}hr{border:0;border-top:1px dashed #000;margin:8px 0}</style></head><body>
<h2>${esc(shopName)}</h2><h3>تقرير إقفال وردية ${esc(s.shiftNumber)}</h3><hr>
<table>
${row('فتحها', esc(s.openedBy))}${row('وقت الفتح', fmtDateTime(s.openedAt))}
${row('أقفلها', esc(s.closedBy || '—'))}${row('وقت الإقفال', fmtDateTime(s.closedAt))}
</table><hr><table>
${row('كاش الافتتاح', fmtMoney(s.openingCash))}
${row('إجمالي القبض النقدي', fmtMoney(s.cashIn ?? 0))}
${row('إجمالي الصرف النقدي', fmtMoney(s.cashOut ?? 0))}
${row('الكاش المتوقع', fmtMoney(s.expectedCash ?? 0), true)}
${row('الكاش المعدود', fmtMoney(s.countedCash ?? 0), true)}
${row('النتيجة', vText, true)}
</table>
${s.varianceNote ? `<hr><div>السبب: ${esc(s.varianceNote)}</div>` : ''}
${s.nonCash ? `<hr><table>${row('إنستاباي', fmtMoney(s.nonCash.instapay))}${row('فيزا', fmtMoney(s.nonCash.visa))}${row('محافظ', fmtMoney(s.nonCash.wallet))}</table>` : ''}
<hr><div style="text-align:center;margin-top:24px">توقيع المسؤول: ____________</div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
};

export const ShiftsView: React.FC<ShiftsViewProps> = ({
  shifts, treasury, isManager, currentUserName, requireShiftForSales, openShiftsCount, onOpenShift, onCloseShift, onToggleRequireShift,
}) => {
  const openShift = useMemo(() => findOpenShift(shifts), [shifts]);
  const lastClosed = useMemo(() => lastClosedShift(shifts), [shifts]);

  // ----- فتح وردية -----
  const [openMode, setOpenMode] = useState<'denoms' | 'direct'>('direct');
  const [openDenoms, setOpenDenoms] = useState<Record<string, string>>({});
  const [openDirect, setOpenDirect] = useState('');
  const [openNote, setOpenNote] = useState('');

  const openingCash = openMode === 'denoms' ? countTotal(toDenoms(openDenoms)) : round2(Number(openDirect) || 0);
  const suggested = lastClosed?.countedCash;
  const carryDiff = suggested !== undefined && (openMode === 'denoms' ? Object.keys(toDenoms(openDenoms)).length > 0 : openDirect !== '')
    ? varianceOf(openingCash, suggested) : 0;

  const submitOpen = () => {
    if (openMode === 'direct' && openDirect === '') { window.alert('اكتب كاش الافتتاح (ممكن يكون صفر).'); return; }
    if (carryDiff !== 0 && !openNote.trim()) { window.alert('كاش الافتتاح مختلف عن إقفال الوردية السابقة — اكتب السبب.'); return; }
    const ok = onOpenShift({
      openingCash,
      denominations: openMode === 'denoms' ? toDenoms(openDenoms) : undefined,
      note: openNote,
      carryOverDiff: carryDiff || undefined,
    });
    if (ok) { setOpenDenoms({}); setOpenDirect(''); setOpenNote(''); }
  };

  // ----- إقفال وردية -----
  const [closing, setClosing] = useState(false);
  const [closeMode, setCloseMode] = useState<'denoms' | 'direct'>('denoms');
  const [closeDenoms, setCloseDenoms] = useState<Record<string, string>>({});
  const [closeDirect, setCloseDirect] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [postVariance, setPostVariance] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [justClosed, setJustClosed] = useState<Shift | null>(null);

  const summary = useMemo(() => (openShift ? summarizeShift(openShift, treasury) : null), [openShift, treasury]);
  const counted = closeMode === 'denoms' ? countTotal(toDenoms(closeDenoms)) : round2(Number(closeDirect) || 0);
  const hasCount = closeMode === 'denoms' ? Object.keys(toDenoms(closeDenoms)).length > 0 : closeDirect !== '';
  const showExpected = isManager || revealed; // العدّ الأعمى: الكاشير لا يرى المتوقع قبل أن يعدّ
  const variance = summary ? varianceOf(counted, summary.expectedCash) : 0;
  const canConfirm = hasCount && (isManager || revealed);

  const resetClose = () => {
    setClosing(false); setCloseDenoms({}); setCloseDirect(''); setCloseNote(''); setPostVariance(true); setRevealed(false);
  };

  const submitClose = () => {
    if (!openShift) return;
    if (!hasCount) { window.alert('عدّ الكاش الأول (أو اكتب المبلغ المعدود).'); return; }
    if (variance !== 0 && !closeNote.trim()) { window.alert('فيه فرق في الدرج — اكتب سبب الفرق.'); return; }
    const ok = onCloseShift(openShift.id, {
      countedCash: counted,
      denominations: closeMode === 'denoms' ? toDenoms(closeDenoms) : undefined,
      note: closeNote,
      postVariance: isManager ? postVariance : true,
    });
    if (ok) {
      // الوردية المقفولة تظهر في السجل؛ نعرض ملخصها فوراً
      setJustClosed({
        ...openShift, status: 'مغلقة', closedAt: new Date().toISOString(), closedBy: currentUserName,
        expectedCash: summary!.expectedCash, countedCash: counted, variance, varianceNote: closeNote.trim() || undefined,
        cashIn: summary!.cashIn, cashOut: summary!.cashOut, cashSales: summary!.cashSales, nonCash: summary!.nonCash,
      });
      resetClose();
    }
  };

  // ----- السجل -----
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const history = useMemo(
    () => shifts
      .filter(s => s.status === 'مغلقة')
      .filter(s => isManager || s.openedBy === currentUserName || s.closedBy === currentUserName)
      .sort((a, b) => ((b.closedAt || '') < (a.closedAt || '') ? -1 : 1))
      .slice(0, 40),
    [shifts, isManager, currentUserName]
  );
  const totals = useMemo(() => {
    const closed = shifts.filter(s => s.status === 'مغلقة');
    return {
      shortage: round2(closed.reduce((t, s) => t + Math.min(0, s.variance ?? 0), 0)),
      surplus: round2(closed.reduce((t, s) => t + Math.max(0, s.variance ?? 0), 0)),
      count: closed.length,
    };
  }, [shifts]);

  const card = 'rounded-2xl bg-surface-2 border border-neutral-800 shadow-md p-4';
  const inputCls = 'w-full h-11 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-sm focus:outline-none focus:border-amber-400 disabled:opacity-50';
  const btnPrimary = 'px-5 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
  const btnGhost = 'px-4 h-11 rounded-xl bg-surface-1 border border-neutral-700 hover:border-neutral-500 text-neutral-200 text-sm font-bold transition-all';

  const ModeToggle: React.FC<{ mode: 'denoms' | 'direct'; set: (m: 'denoms' | 'direct') => void; disabled?: boolean }> = ({ mode, set, disabled }) => (
    <div className="inline-flex rounded-xl bg-surface-1 border border-neutral-800 p-1 text-xs font-bold">
      {([['denoms', 'عدّ بالفئات'], ['direct', 'إدخال المبلغ مباشرة']] as const).map(([m, label]) => (
        <button key={m} disabled={disabled} onClick={() => set(m)}
          className={`px-3 py-1.5 rounded-lg transition-all ${mode === m ? 'bg-amber-500 text-black' : 'text-neutral-300'}`}>{label}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 pb-12 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-black text-white flex items-center gap-2"><Wallet className="w-5 h-5 text-amber-400" /> الورديات وجرد الدرج</h2>
        {isManager && (
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
            <input type="checkbox" checked={requireShiftForSales} onChange={e => onToggleRequireShift(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            إلزام فتح وردية قبل أي بيع
          </label>
        )}
      </div>

      {openShiftsCount > 1 && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs font-bold flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>فيه {openShiftsCount} ورديات مفتوحة (غالباً اتفتحت من جهازين في نفس الوقت). النظام شغال على الأقدم — اقفلها بالترتيب وراجع الحركات.</span>
        </div>
      )}

      {justClosed && (
        <div className={`${card} border-emerald-500/30 space-y-3`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-emerald-300 font-black text-sm"><CheckCircle2 className="w-5 h-5" /> اتقفلت وردية {justClosed.shiftNumber}</div>
            <button className={btnGhost + ' !h-9 text-xs flex items-center gap-1.5'} onClick={() => printShift(justClosed)}><Printer className="w-4 h-4" /> طباعة التقرير</button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface-1 rounded-xl p-2"><div className="text-[11px] text-neutral-400">المتوقع</div><div className="font-black text-white">{fmtMoney(justClosed.expectedCash ?? 0)}</div></div>
            <div className="bg-surface-1 rounded-xl p-2"><div className="text-[11px] text-neutral-400">المعدود</div><div className="font-black text-white">{fmtMoney(justClosed.countedCash ?? 0)}</div></div>
            <div className="bg-surface-1 rounded-xl p-2 flex items-center justify-center"><VarianceBadge value={justClosed.variance ?? 0} /></div>
          </div>
          <button className="text-xs text-neutral-400 underline" onClick={() => setJustClosed(null)}>إخفاء</button>
        </div>
      )}

      {/* ======== لا توجد وردية مفتوحة: فتح وردية ======== */}
      {!openShift && (
        <div className={`${card} space-y-4`}>
          <div className="flex items-center gap-2 text-white font-black text-sm"><Clock className="w-4 h-4 text-amber-400" /> فتح وردية جديدة</div>
          {suggested !== undefined && (
            <div className="text-xs text-neutral-300 bg-surface-1 rounded-xl p-3 border border-neutral-800">
              الكاش اللي اتقفلت عليه الوردية السابقة ({lastClosed?.shiftNumber}): <b className="text-white">{fmtMoney(suggested)} ج.م</b> — المفروض الدرج يبدأ بنفس المبلغ.
              <button className="mr-2 text-amber-300 underline" onClick={() => { setOpenMode('direct'); setOpenDirect(String(suggested)); }}>استخدمه</button>
            </div>
          )}
          <ModeToggle mode={openMode} set={setOpenMode} />
          {openMode === 'denoms'
            ? <DenominationCounter values={openDenoms} onChange={setOpenDenoms} />
            : <input type="number" inputMode="decimal" min={0} value={openDirect} onChange={e => setOpenDirect(e.target.value)} placeholder="كاش الافتتاح بالجنيه" className={inputCls} />}
          <div className="flex items-center justify-between bg-surface-1 rounded-xl px-4 py-3 border border-neutral-800">
            <span className="text-xs text-neutral-300">كاش الافتتاح</span>
            <span className="font-black text-white text-lg tabular-nums">{fmtMoney(openingCash)} ج.م</span>
          </div>
          {carryDiff !== 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-neutral-300">فرق عن إقفال الوردية السابقة: <VarianceBadge value={carryDiff} /></div>
              <input value={openNote} onChange={e => setOpenNote(e.target.value)} placeholder="سبب الفرق (إجباري)" className={inputCls} />
            </div>
          )}
          <button className={btnPrimary} onClick={submitOpen}>فتح الوردية</button>
        </div>
      )}

      {/* ======== وردية مفتوحة ======== */}
      {openShift && summary && (
        <div className={`${card} space-y-4`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-white font-black text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" /> وردية {openShift.shiftNumber} مفتوحة
              </div>
              <div className="text-xs text-neutral-400 mt-1">
                فتحها {openShift.openedBy} — {fmtDateTime(openShift.openedAt)} — بقالها {fmtDuration(openShift.openedAt)}
              </div>
            </div>
            {!closing && <button className={btnPrimary + ' flex items-center gap-2'} onClick={() => setClosing(true)}><Lock className="w-4 h-4" /> إقفال الوردية</button>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-surface-1 rounded-xl p-3"><div className="text-[11px] text-neutral-400">كاش الافتتاح</div><div className="font-black text-white tabular-nums">{fmtMoney(openShift.openingCash)}</div></div>
            <div className="bg-surface-1 rounded-xl p-3"><div className="text-[11px] text-neutral-400">مبيعات كاش</div><div className="font-black text-emerald-300 tabular-nums">{showExpected ? fmtMoney(summary.cashSales) : '••••'}</div></div>
            <div className="bg-surface-1 rounded-xl p-3"><div className="text-[11px] text-neutral-400">صرف نقدي</div><div className="font-black text-rose-300 tabular-nums">{showExpected ? fmtMoney(summary.cashOut) : '••••'}</div></div>
            <div className="bg-surface-1 rounded-xl p-3">
              <div className="text-[11px] text-neutral-400">المتوقع في الدرج</div>
              <div className="font-black text-white tabular-nums">{showExpected ? fmtMoney(summary.expectedCash) : '••••'}</div>
            </div>
          </div>

          {closing && (
            <div className="space-y-4 border-t border-neutral-800 pt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-white font-black text-sm">عدّ كاش الدرج</div>
                <ModeToggle mode={closeMode} set={setCloseMode} disabled={revealed && !isManager} />
              </div>
              {closeMode === 'denoms'
                ? <DenominationCounter values={closeDenoms} onChange={setCloseDenoms} disabled={revealed && !isManager} />
                : <input type="number" inputMode="decimal" min={0} value={closeDirect} onChange={e => setCloseDirect(e.target.value)} disabled={revealed && !isManager} placeholder="الكاش المعدود بالجنيه" className={inputCls} />}

              <div className="flex items-center justify-between bg-surface-1 rounded-xl px-4 py-3 border border-neutral-800">
                <span className="text-xs text-neutral-300">إجمالي المعدود</span>
                <span className="font-black text-white text-lg tabular-nums">{fmtMoney(counted)} ج.م</span>
              </div>

              {!isManager && !revealed && (
                <button className={btnPrimary} disabled={!hasCount} onClick={() => setRevealed(true)}>احسب الفرق</button>
              )}

              {showExpected && hasCount && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center items-center">
                    <div className="bg-surface-1 rounded-xl p-2"><div className="text-[11px] text-neutral-400">المتوقع</div><div className="font-black text-white tabular-nums">{fmtMoney(summary.expectedCash)}</div></div>
                    <div className="bg-surface-1 rounded-xl p-2"><div className="text-[11px] text-neutral-400">المعدود</div><div className="font-black text-white tabular-nums">{fmtMoney(counted)}</div></div>
                    <div><VarianceBadge value={variance} big /></div>
                  </div>
                  {variance !== 0 && (
                    <>
                      <input value={closeNote} onChange={e => setCloseNote(e.target.value)} placeholder="سبب الفرق (إجباري)" className={inputCls} />
                      {isManager ? (
                        <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                          <input type="checkbox" checked={postVariance} onChange={e => setPostVariance(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                          سجّل الفرق في الخزنة (يخلّي رصيد الخزنة = الكاش الفعلي)
                        </label>
                      ) : (
                        <div className="text-[11px] text-neutral-400">هيتسجل الفرق في الخزنة. لو عدّيت غلط اكتب ده في السبب — العدّ بيتقفل بعد حساب الفرق.</div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button className={btnPrimary} disabled={!canConfirm} onClick={submitClose}>تأكيد إقفال الوردية</button>
                <button className={btnGhost} onClick={resetClose}>إلغاء</button>
              </div>
            </div>
          )}

          {showExpected && summary.breakdown.length > 0 && (
            <details className="text-xs text-neutral-300">
              <summary className="cursor-pointer text-neutral-400">حركات الدرج النقدية خلال الوردية</summary>
              <div className="mt-2 space-y-1">
                {summary.breakdown.map(l => (
                  <div key={l.label} className="flex justify-between bg-surface-1 rounded-lg px-3 py-1.5">
                    <span>{l.label}</span>
                    <span className={`tabular-nums font-bold ${l.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{l.amount >= 0 ? '+' : '−'}{fmtMoney(Math.abs(l.amount))}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ======== السجل ======== */}
      <div className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-white font-black text-sm">سجل الورديات ({history.length})</div>
          {isManager && totals.count > 0 && (
            <div className="flex gap-2 text-[11px] font-bold">
              <span className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-300">إجمالي العجز: {fmtMoney(Math.abs(totals.shortage))}</span>
              <span className="px-2 py-1 rounded-lg bg-sky-500/10 text-sky-300">إجمالي الزيادة: {fmtMoney(totals.surplus)}</span>
            </div>
          )}
        </div>
        {history.length === 0 && <div className="text-xs text-neutral-500 py-4 text-center">لسه مفيش ورديات مقفولة.</div>}
        {history.map(s => {
          const open = expandedId === s.id;
          return (
            <div key={s.id} className="bg-surface-1 border border-neutral-800 rounded-xl overflow-hidden">
              <button className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right" onClick={() => setExpandedId(open ? null : s.id)}>
                <div className="min-w-0">
                  <div className="text-xs font-black text-white">{s.shiftNumber} — {s.closedBy || s.openedBy}</div>
                  <div className="text-[11px] text-neutral-400">{fmtDateTime(s.openedAt)} ← {fmtDateTime(s.closedAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <VarianceBadge value={s.variance ?? 0} />
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2 text-xs text-neutral-300 border-t border-neutral-800 pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="bg-surface-2 rounded-lg p-2"><div className="text-[10px] text-neutral-400">افتتاح</div><b className="text-white tabular-nums">{fmtMoney(s.openingCash)}</b></div>
                    <div className="bg-surface-2 rounded-lg p-2"><div className="text-[10px] text-neutral-400">متوقع</div><b className="text-white tabular-nums">{fmtMoney(s.expectedCash ?? 0)}</b></div>
                    <div className="bg-surface-2 rounded-lg p-2"><div className="text-[10px] text-neutral-400">معدود</div><b className="text-white tabular-nums">{fmtMoney(s.countedCash ?? 0)}</b></div>
                    <div className="bg-surface-2 rounded-lg p-2"><div className="text-[10px] text-neutral-400">المدة</div><b className="text-white">{fmtDuration(s.openedAt, s.closedAt)}</b></div>
                  </div>
                  <div>مبيعات كاش: <b>{fmtMoney(s.cashSales ?? 0)}</b> — قبض نقدي: <b>{fmtMoney(s.cashIn ?? 0)}</b> — صرف نقدي: <b>{fmtMoney(s.cashOut ?? 0)}</b> — فواتير: <b>{s.invoiceCount ?? 0}</b></div>
                  {s.nonCash && <div>إنستاباي: <b>{fmtMoney(s.nonCash.instapay)}</b> — فيزا: <b>{fmtMoney(s.nonCash.visa)}</b> — محافظ: <b>{fmtMoney(s.nonCash.wallet)}</b></div>}
                  {s.carryOverDiff ? <div className="text-amber-300">فرق الافتتاح عن الوردية السابقة: {s.carryOverDiff > 0 ? 'زيادة' : 'عجز'} {fmtMoney(Math.abs(s.carryOverDiff))}{s.openingNote ? ` — ${s.openingNote}` : ''}</div> : null}
                  {s.varianceNote && <div>السبب: <b>{s.varianceNote}</b>{s.variancePosted ? ' (اتسجل في الخزنة)' : ' (لم يُسجَّل في الخزنة)'}</div>}
                  <button className={btnGhost + ' !h-9 text-xs flex items-center gap-1.5'} onClick={() => printShift(s)}><Printer className="w-4 h-4" /> طباعة</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
