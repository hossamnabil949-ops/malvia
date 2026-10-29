import React, { useMemo, useState } from 'react';
import { Landmark, Plus, Search, AlertTriangle, CheckCircle2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Customer, Supplier } from '../types/autoParts';
import {
  Cheque, ChequeAction, ChequeDirection, ChequeError, ACTION_LABEL, availableActions, clearLabel, dueState, daysBetween, summarize,
  registrationEffect, isOpen,
} from '../utils/chequeLogic';
import { todayISO } from '../utils/dateRange';

export interface NewChequeInput {
  direction: ChequeDirection;
  number: string;
  bankName: string;
  amount: number;
  dueDate: string;
  receivedDate: string;
  partyId: string;
  drawerName?: string;
  notes?: string;
}

interface ChequesViewProps {
  cheques: Cheque[];
  customers: Customer[];
  suppliers: Supplier[];
  onAdd: (input: NewChequeInput) => { ok: boolean; error?: ChequeError };
  onAction: (id: string, action: ChequeAction, note?: string) => { ok: boolean; message?: string };
}

const ERROR_TEXT: Record<ChequeError, string> = {
  NUMBER_REQUIRED: 'اكتب رقم الشيك',
  AMOUNT_INVALID: 'المبلغ يجب أن يكون أكبر من صفر',
  DUE_DATE_INVALID: 'تاريخ الاستحقاق غير صحيح',
  PARTY_REQUIRED: 'اختر العميل أو المورد',
  BANK_REQUIRED: 'اكتب اسم البنك',
  DUPLICATE: 'هذا الشيك مسجّل بالفعل (نفس الرقم والبنك)',
};

const STATUS_STYLE: Record<string, string> = {
  'في الحافظة': 'bg-sky-500/15 text-sky-300',
  'مودع بالبنك': 'bg-indigo-500/15 text-indigo-300',
  'صادر': 'bg-sky-500/15 text-sky-300',
  'محصّل': 'bg-emerald-500/15 text-emerald-300',
  'مصروف': 'bg-emerald-500/15 text-emerald-300',
  'مرتد': 'bg-rose-500/15 text-rose-300',
  'ملغي': 'bg-neutral-700/40 text-neutral-400',
};

const inputCls =
  'w-full h-9 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400';
const money = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م`;

export const ChequesView: React.FC<ChequesViewProps> = ({ cheques, customers, suppliers, onAdd, onAction }) => {
  const today = todayISO();
  const [direction, setDirection] = useState<ChequeDirection>('incoming');
  const [filter, setFilter] = useState<'open' | 'overdue' | 'due_soon' | 'closed' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  // ---- إضافة ----
  const [showAdd, setShowAdd] = useState(false);
  const blank = { number: '', bankName: '', amount: '', dueDate: today, receivedDate: today, partyId: '', drawerName: '', notes: '' };
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState('');
  const setF = (k: keyof typeof blank, v: string) => { setForm((f) => ({ ...f, [k]: v })); setFormError(''); };

  // ---- تأكيد إجراء ----
  const [confirm, setConfirm] = useState<{ cheque: Cheque; action: ChequeAction } | null>(null);
  const [confirmNote, setConfirmNote] = useState('');

  const summary = useMemo(() => summarize(cheques, direction, today), [cheques, direction, today]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cheques
      .filter((c) => c.direction === direction)
      .filter((c) => {
        const st = dueState(c, today);
        if (filter === 'open') return isOpen(c);
        if (filter === 'overdue') return st === 'overdue';
        if (filter === 'due_soon') return st === 'due_soon';
        if (filter === 'closed') return !isOpen(c);
        return true;
      })
      .filter((c) => !q || c.number.toLowerCase().includes(q) || c.partyName.toLowerCase().includes(q) || c.bankName.toLowerCase().includes(q))
      .sort((a, b) => {
        const ao = isOpen(a) ? 0 : 1, bo = isOpen(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return ao === 0 ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
      });
  }, [cheques, direction, filter, search, today]);

  const parties = direction === 'incoming' ? customers : suppliers;
  const selectedParty = parties.find((p) => p.id === form.partyId);
  const amountNum = Number(form.amount) || 0;
  const previewNote = useMemo(() => {
    if (!selectedParty || amountNum <= 0) return '';
    const r = registrationEffect(direction, amountNum, selectedParty as { balance: number; deferredDebt?: number });
    if (direction === 'incoming') {
      const applied = r.applied.appliedAmount ?? 0;
      return applied < amountNum
        ? `مديونية العميل الحالية ${money(Math.max(0, selectedParty.balance))} فقط: سيُخصم ${money(applied)} من حسابه والباقي يُسجَّل كمقبوضات دون خصم.`
        : `سيُخصم ${money(applied)} من مديونية العميل فور التسجيل (ويعود لو ارتد الشيك).`;
    }
    const credit = r.applied.appliedCredit ?? 0;
    return credit > 0
      ? `الشيك أكبر من مستحقات المورد: ${money(credit)} ستُسجَّل رصيداً دائناً للمحل عنده.`
      : `سيُخصم ${money(r.applied.appliedDebt ?? 0)} من مستحقات المورد فور التسجيل (ويعود لو ارتد الشيك).`;
  }, [selectedParty, amountNum, direction]);

  const submitAdd = () => {
    const res = onAdd({
      direction,
      number: form.number.trim(),
      bankName: form.bankName.trim(),
      amount: amountNum,
      dueDate: form.dueDate,
      receivedDate: form.receivedDate,
      partyId: form.partyId,
      drawerName: form.drawerName.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
    if (!res.ok) {
      setFormError(res.error ? ERROR_TEXT[res.error] : 'تعذّر تسجيل الشيك');
      return;
    }
    setForm(blank);
    setShowAdd(false);
    setFlash({ ok: true, text: 'تم تسجيل الشيك' });
  };

  const runAction = () => {
    if (!confirm) return;
    const res = onAction(confirm.cheque.id, confirm.action, confirmNote);
    setFlash({ ok: res.ok, text: res.message || (res.ok ? 'تم تنفيذ الإجراء' : 'تعذّر تنفيذ الإجراء') });
    setConfirm(null);
    setConfirmNote('');
  };

  const confirmText = (c: Cheque, a: ChequeAction): string => {
    if (a === 'deposit') return 'سيتغير الشيك إلى «مودع بالبنك». لا تتأثر الخزنة ولا الحسابات.';
    if (a === 'clear')
      return c.direction === 'incoming'
        ? `سيُسجَّل قبض ${money(c.amount)} في الخزنة (حساب بنكي). لا يمكن التراجع.`
        : `سيُسجَّل صرف ${money(c.amount)} من الخزنة (حساب بنكي) للمورد. لا يمكن التراجع.`;
    return c.direction === 'incoming'
      ? `سيعود ${money(c.appliedAmount ?? 0)} على مديونية العميل ${c.partyName} وتُغلق حالة الشيك. لا يمكن التراجع.`
      : `ستعود مستحقات المورد ${c.partyName} كما كانت قبل الشيك (${money(c.amount)}) وتُغلق حالة الشيك. لا يمكن التراجع.`;
  };

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'open', label: 'المفتوحة' },
    { id: 'overdue', label: 'المتأخرة' },
    { id: 'due_soon', label: 'تستحق قريباً' },
    { id: 'closed', label: 'المنتهية' },
    { id: 'all', label: 'الكل' },
  ];

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-black text-white">الشيكات</h2>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setForm(blank); setFormError(''); }}
          className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> تسجيل شيك {direction === 'incoming' ? 'وارد' : 'صادر'}
        </button>
      </div>

      <div className="flex gap-2">
        {(['incoming', 'outgoing'] as ChequeDirection[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDirection(d); setFilter('open'); }}
            className={`px-4 h-9 rounded-xl text-xs font-bold border transition-colors ${
              direction === d ? 'bg-amber-500 text-black border-amber-500' : 'bg-surface-1 text-neutral-300 border-neutral-700 hover:border-neutral-500'
            }`}
          >
            {d === 'incoming' ? 'شيكات واردة (من العملاء)' : 'شيكات صادرة (للموردين)'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'مفتوحة', b: summary.pending, color: 'text-white' },
          { label: 'تستحق خلال 7 أيام', b: summary.dueSoon, color: 'text-amber-300' },
          { label: 'متأخرة عن الاستحقاق', b: summary.overdue, color: 'text-rose-400' },
          { label: 'مرتدة', b: summary.bounced, color: 'text-rose-300' },
        ].map((k) => (
          <div key={k.label} className="p-3 rounded-2xl bg-surface-1 border border-neutral-800">
            <div className="text-[11px] text-neutral-400">{k.label}</div>
            <div className={`font-mono font-black text-base ${k.color}`}>{money(k.b.amount)}</div>
            <div className="text-[10px] text-neutral-500">{k.b.count} شيك</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-500 absolute right-3 top-2.5" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث برقم الشيك أو الاسم أو البنك" className={`${inputCls} pr-9`} />
        </div>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 h-8 rounded-xl text-[11px] font-bold border ${
              filter === f.id ? 'bg-neutral-200 text-black border-neutral-200' : 'bg-surface-1 text-neutral-300 border-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {flash && (
        <div className={`text-xs font-bold flex items-center gap-1.5 ${flash.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {flash.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {flash.text}
        </div>
      )}

      <div className="rounded-2xl border border-neutral-800 divide-y divide-neutral-800 text-xs overflow-hidden">
        {rows.length === 0 && <div className="p-8 text-center text-neutral-500">لا توجد شيكات مطابقة</div>}
        {rows.map((c) => {
          const st = dueState(c, today);
          const days = daysBetween(today, c.dueDate);
          const actions = availableActions(c);
          return (
            <div key={c.id} className="bg-surface-1">
              <div className="p-3 flex flex-wrap items-center gap-3">
                <div className="w-28">
                  <div className="font-mono font-bold text-white">{c.dueDate}</div>
                  {st === 'overdue' && <div className="text-[10px] font-bold text-rose-400">متأخر {Math.abs(days)} يوم</div>}
                  {st === 'due_soon' && <div className="text-[10px] font-bold text-amber-300">{days === 0 ? 'يستحق اليوم' : `بعد ${days} يوم`}</div>}
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="font-bold text-white">{c.partyName}</div>
                  <div className="text-[10px] text-neutral-500">شيك {c.number} · {c.bankName}{c.drawerName ? ` · محرر: ${c.drawerName}` : ''}</div>
                </div>
                <div className="font-mono font-black text-amber-300">{money(c.amount)}</div>
                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${STATUS_STYLE[c.status] || ''}`}>{c.status}</span>
                <div className="flex flex-wrap gap-1.5">
                  {actions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => { setConfirm({ cheque: c, action: a }); setConfirmNote(''); }}
                      className={`px-2.5 h-7 rounded-lg text-[11px] font-bold ${
                        a === 'clear' ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : a === 'bounce' ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                        : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                      }`}
                    >
                      {a === 'clear' ? clearLabel(c.direction) : ACTION_LABEL[a]}
                    </button>
                  ))}
                  <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="px-2 h-7 rounded-lg text-neutral-400 hover:text-white" title="سجل الشيك">
                    {expanded === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {expanded === c.id && (
                <div className="px-4 pb-3 space-y-1 text-[11px] text-neutral-400 border-t border-neutral-800 pt-2">
                  {c.notes && <div>ملاحظات: {c.notes}</div>}
                  <div>تاريخ {c.direction === 'incoming' ? 'الاستلام' : 'التحرير'}: {c.receivedDate}</div>
                  {c.history.map((h, i) => (
                    <div key={i}>
                      {new Date(h.at).toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} — {h.status} — {h.by}{h.note ? ` — ${h.note}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* نافذة التسجيل */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-surface-1 border border-neutral-700 p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white text-sm">تسجيل شيك {direction === 'incoming' ? 'وارد من عميل' : 'صادر لمورد'}</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="text-neutral-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-neutral-300 font-bold mb-1">{direction === 'incoming' ? 'العميل *' : 'المورد *'}</label>
              <select value={form.partyId} onChange={(e) => setF('partyId', e.target.value)} className={inputCls}>
                <option value="">— اختر —</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (رصيده: {Math.max(0, p.balance).toLocaleString()} ج.م)
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 font-bold mb-1">رقم الشيك *</label>
                <input value={form.number} onChange={(e) => setF('number', e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">البنك *</label>
                <input value={form.bankName} onChange={(e) => setF('bankName', e.target.value)} placeholder="مثال: البنك الأهلي" className={inputCls} />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">المبلغ (ج.م) *</label>
                <input type="number" min="0" step="any" value={form.amount} onChange={(e) => setF('amount', e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">تاريخ الاستحقاق *</label>
                <input type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">تاريخ {direction === 'incoming' ? 'الاستلام' : 'التحرير'}</label>
                <input type="date" value={form.receivedDate} onChange={(e) => setF('receivedDate', e.target.value)} className={inputCls} />
              </div>
              {direction === 'incoming' && (
                <div>
                  <label className="block text-neutral-300 font-bold mb-1">محرر الشيك (إن اختلف)</label>
                  <input value={form.drawerName} onChange={(e) => setF('drawerName', e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
            <input value={form.notes} onChange={(e) => setF('notes', e.target.value)} placeholder="ملاحظات (اختياري)" className={inputCls} />
            {previewNote && <div className="text-[11px] text-sky-300 font-bold">{previewNote}</div>}
            {formError && <div className="text-[11px] text-rose-400 font-bold">{formError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={submitAdd} className="flex-1 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black">حفظ الشيك</button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-5 h-10 rounded-xl bg-neutral-800 text-neutral-300 font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد الإجراء */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface-1 border border-neutral-700 p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-white text-sm">
              {confirm.action === 'clear' ? clearLabel(confirm.cheque.direction) : ACTION_LABEL[confirm.action]} — شيك {confirm.cheque.number}
            </h3>
            <p className="text-neutral-300">{confirmText(confirm.cheque, confirm.action)}</p>
            <input
              value={confirmNote}
              onChange={(e) => setConfirmNote(e.target.value)}
              placeholder={confirm.action === 'bounce' ? 'سبب الارتداد (اختياري)' : 'ملاحظة (اختياري)'}
              className={inputCls}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runAction}
                className={`flex-1 h-10 rounded-xl font-black text-black ${confirm.action === 'bounce' ? 'bg-rose-400 hover:bg-rose-300' : 'bg-amber-500 hover:bg-amber-400'}`}
              >
                تأكيد
              </button>
              <button type="button" onClick={() => setConfirm(null)} className="px-5 h-10 rounded-xl bg-neutral-800 text-neutral-300 font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
