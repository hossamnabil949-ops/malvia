import React, { useMemo, useState } from 'react';
import {
  createDefaultChartOfAccounts, createJournalEntry, createReversalEntry,
  type LedgerAccount, type AccountingPeriod, type JournalEntry, type AccountType,
} from '../utils/accountingCore';

interface Props {
  tenantId: string; branchId?: string; currentUserName: string; canManage: boolean;
  accounts: LedgerAccount[]; periods: AccountingPeriod[]; entries: JournalEntry[];
  onSave: (updates: { accounts?: LedgerAccount[]; periods?: AccountingPeriod[]; entries?: JournalEntry[] }) => boolean;
}
const money = (n: number) => n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const typeLabel: Record<AccountType, string> = { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };

export const AccountingLedgerView: React.FC<Props> = ({ tenantId, branchId = 'MAIN', currentUserName, canManage, accounts, periods, entries, onSave }) => {
  const currency = 'EGP';
  const [from, setFrom] = useState(today().slice(0, 4) + '-01-01');
  const [to, setTo] = useState(today().slice(0, 4) + '-12-31');
  const [memo, setMemo] = useState('');
  const [entryDate, setEntryDate] = useState(today());
  const [debitAccount, setDebitAccount] = useState('');
  const [creditAccount, setCreditAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [showEntry, setShowEntry] = useState(false);
  const [notice, setNotice] = useState('');

  const currentPeriod = periods.find(p => p.status === 'open' && p.startDate <= today() && p.endDate >= today())
    || periods.find(p => p.status === 'open');
  const initializedAccounts = accounts.length ? accounts : createDefaultChartOfAccounts({ tenantId, branchId, currency });
  const activeAccounts = initializedAccounts.filter(a => a.active).sort((a,b) => a.code.localeCompare(b.code));
  const openingEntries = entries.filter(e => e.status === 'posted' && e.date < from);
  const periodEntries = entries.filter(e => e.status === 'posted' && e.date >= from && e.date <= to);
  const totals = useMemo(() => {
    const map = new Map<string, { openingDebit: number; openingCredit: number; movementDebit: number; movementCredit: number }>();
    activeAccounts.forEach(a => map.set(a.id, { openingDebit: 0, openingCredit: 0, movementDebit: 0, movementCredit: 0 }));
    openingEntries.forEach(e => e.lines.forEach(l => {
      const row = map.get(l.accountId);
      if (row) { row.openingDebit += l.debit; row.openingCredit += l.credit; }
    }));
    periodEntries.forEach(e => e.lines.forEach(l => {
      const row = map.get(l.accountId);
      if (row) { row.movementDebit += l.debit; row.movementCredit += l.credit; }
    }));
    return map;
  }, [activeAccounts, openingEntries, periodEntries]);
  const sumDebit = periodEntries.reduce((s,e) => s + e.lines.reduce((n,l) => n + l.debit,0),0);
  const sumCredit = periodEntries.reduce((s,e) => s + e.lines.reduce((n,l) => n + l.credit,0),0);
  const trialRows = activeAccounts.map(a => {
    const t = totals.get(a.id) || { openingDebit: 0, openingCredit: 0, movementDebit: 0, movementCredit: 0 };
    const openingNet = t.openingDebit - t.openingCredit;
    const closingNet = openingNet + t.movementDebit - t.movementCredit;
    return {
      account: a,
      openingDebit: Math.max(0, openingNet), openingCredit: Math.max(0, -openingNet),
      movementDebit: t.movementDebit, movementCredit: t.movementCredit,
      debit: Math.max(0, closingNet), credit: Math.max(0, -closingNet),
    };
  }).filter(r => r.openingDebit || r.openingCredit || r.movementDebit || r.movementCredit || r.debit || r.credit);
  const saveInitial = () => {
    if (!canManage) return;
    const chart = accounts.length ? accounts : createDefaultChartOfAccounts({ tenantId, branchId, currency });
    const period: AccountingPeriod = { tenantId, branchId, currency, id: 'FY-' + today().slice(0,4), name: 'السنة المالية ' + today().slice(0,4), startDate: today().slice(0,4)+'-01-01', endDate: today().slice(0,4)+'-12-31', status: 'open' };
    const ok = onSave({ ...(accounts.length ? {} : { accounts: chart }), ...(periods.length ? {} : { periods: [period] }) });
    setNotice(ok ? 'تم إنشاء دليل الحسابات والفترة المالية دون إنشاء أي أرصدة أو قيود.' : 'تعذر حفظ دليل الحسابات. لم يتم اعتماد أي تغيير.');
  };
  const saveEntry = () => {
    setNotice('');
    if (!canManage) return;
    if (!currentPeriod) { setNotice('لا توجد فترة مالية مفتوحة تغطي تاريخ القيد.'); return; }
    const value = Number(amount);
    if (!memo.trim()) { setNotice('اكتب بياناً واضحاً للقيد والمستند المؤيد.'); return; }
    if (!Number.isFinite(value) || value <= 0 || !debitAccount || !creditAccount || debitAccount === creditAccount) {
      setNotice('أدخل مبلغاً صحيحاً وحسابين مختلفين.'); return;
    }
    const manualId = 'manual:' + crypto.randomUUID();
    const result = createJournalEntry({
      tenantId, branchId, currency, postingId: manualId,
      source: { type: 'manual.journal', id: manualId },
      date: entryDate, periodId: currentPeriod.id, memo: memo.trim(),
      lines: [{ accountId: debitAccount, debit: value, credit: 0 }, { accountId: creditAccount, debit: 0, credit: value }],
      createdAt: new Date().toISOString(), createdBy: currentUserName,
    }, activeAccounts, periods.length ? periods : [currentPeriod], entries);
    if (result.error || !result.entry) { setNotice('تعذر إنشاء القيد: ' + (result.error || 'UNKNOWN')); return; }
    const ok = onSave({ entries: [...entries, result.entry] });
    if (!ok) { setNotice('فشل الحفظ. لم يتم اعتماد القيد.'); return; }
    setMemo(''); setAmount(''); setShowEntry(false); setNotice('تم حفظ القيد المرحّل بنجاح.');
  };
  const reverseEntry = (entry: JournalEntry) => {
    if (!canManage || !currentPeriod) return;
    const result = createReversalEntry(entry.id, 'REV-' + crypto.randomUUID(), today(), currentPeriod.id, new Date().toISOString(), currentUserName, activeAccounts, periods.length ? periods : [currentPeriod], entries);
    if (result.error || !result.entry) { setNotice('تعذر عكس القيد: ' + (result.error || 'UNKNOWN')); return; }
    const ok = onSave({ entries: [...entries, result.entry] });
    setNotice(ok ? 'تم حفظ قيد العكس. القيد الأصلي لم يتغير.' : 'فشل حفظ قيد العكس.');
  };

  return <section className="space-y-4 text-right" dir="rtl">
    <header className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-white">دفتر الأستاذ العام وميزان المراجعة</h2><p className="mt-1 text-xs text-slate-400">دفتر مستقل للقيود المحاسبية المرحلة — لا يعيد تفسير السجلات التاريخية تلقائياً.</p></div>
        <div className="flex flex-wrap gap-2">
          {(!accounts.length || !periods.length) && canManage && <button onClick={saveInitial} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">تهيئة دليل الحسابات والفترة</button>}
          {canManage && <button onClick={() => setShowEntry(v => !v)} className="rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-200">قيد يومية جديد</button>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">عدد الحسابات</div><strong className="text-white">{activeAccounts.length}</strong></div>
        <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">القيود المرحلة في الفترة</div><strong className="text-white">{periodEntries.length}</strong></div>
        <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">حالة توازن الحركات</div><strong className={Math.abs(sumDebit-sumCredit)<0.005?'text-emerald-400':'text-rose-400'}>{Math.abs(sumDebit-sumCredit)<0.005?'متوازن':'غير متوازن'}</strong></div>
      </div>
    </header>
    {notice && <div role="status" className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm text-slate-200">{notice}</div>}
    {showEntry && <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
      <h3 className="font-bold text-white">إنشاء قيد يومية يدوي</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">التاريخ<input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white"/></label>
        <label className="text-xs text-slate-300">المبلغ بالجنيه<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white"/></label>
        <label className="text-xs text-slate-300">الحساب المدين<select value={debitAccount} onChange={e=>setDebitAccount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white"><option value="">اختر الحساب</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
        <label className="text-xs text-slate-300">الحساب الدائن<select value={creditAccount} onChange={e=>setCreditAccount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white"><option value="">اختر الحساب</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
      </div>
      <label className="block text-xs text-slate-300">البيان<input value={memo} onChange={e=>setMemo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" placeholder="سبب القيد والمستند المؤيد"/></label>
      <div className="flex gap-2"><button onClick={saveEntry} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">حفظ وترحيل القيد</button><button onClick={()=>setShowEntry(false)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white">إلغاء</button></div>
      <p className="text-xs text-amber-300">يُرحّل القيد فور الحفظ. استخدمه فقط للعمليات التي لها مستند مؤيد، ولا تسجل به أرصدة افتتاحية غير مطابقة.</p>
    </div>}
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3"><div className="font-bold text-white">ميزان المراجعة</div><label className="text-xs text-slate-300">من<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 p-2 text-white"/></label><label className="text-xs text-slate-300">إلى<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 p-2 text-white"/></label></div>
      <div className="overflow-x-auto"><table className="min-w-[1040px] w-full text-sm"><thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2 text-right" rowSpan={2}>كود</th><th className="p-2 text-right" rowSpan={2}>الحساب</th><th className="p-2" colSpan={2}>رصيد ما قبل الفترة</th><th className="p-2" colSpan={2}>حركة الفترة</th><th className="p-2" colSpan={2}>الرصيد الختامي</th></tr><tr className="border-b border-slate-700 text-slate-400"><th className="p-2">مدين</th><th className="p-2">دائن</th><th className="p-2">مدين</th><th className="p-2">دائن</th><th className="p-2">مدين</th><th className="p-2">دائن</th></tr></thead><tbody>{trialRows.map(r=><tr key={r.account.id} className="border-b border-slate-800 text-slate-200"><td className="p-2">{r.account.code}</td><td className="p-2">{r.account.name}</td><td className="p-2 text-center">{money(r.openingDebit)}</td><td className="p-2 text-center">{money(r.openingCredit)}</td><td className="p-2 text-center">{money(r.movementDebit)}</td><td className="p-2 text-center">{money(r.movementCredit)}</td><td className="p-2 text-center">{money(r.debit)}</td><td className="p-2 text-center">{money(r.credit)}</td></tr>)}{!trialRows.length&&<tr><td colSpan={8} className="p-6 text-center text-slate-400">لا توجد قيود مرحلة في الفترة المحددة. لا يعني ذلك أن الأرصدة التاريخية صفر.</td></tr>}</tbody><tfoot><tr className="border-t-2 border-slate-600 font-bold text-white"><td colSpan={2} className="p-2">الإجمالي</td><td className="p-2 text-center">{money(trialRows.reduce((s,r)=>s+r.openingDebit,0))}</td><td className="p-2 text-center">{money(trialRows.reduce((s,r)=>s+r.openingCredit,0))}</td><td className="p-2 text-center">{money(sumDebit)}</td><td className="p-2 text-center">{money(sumCredit)}</td><td className="p-2 text-center">{money(trialRows.reduce((s,r)=>s+r.debit,0))}</td><td className="p-2 text-center">{money(trialRows.reduce((s,r)=>s+r.credit,0))}</td></tr></tfoot></table></div>
      <p className="mt-2 text-xs text-amber-300">هذا ميزان حركات وقيود الدفتر الجديد فقط، وليس ميزان مراجعة شاملاً للأرصدة القديمة حتى اعتماد قيد افتتاحي مطابق.</p>
    </div>
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-3 font-bold text-white">دفتر القيود اليومية</h3>
      <div className="space-y-2">{periodEntries.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(entry=><article key={entry.id} className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
        <div className="flex flex-wrap justify-between gap-2"><div><strong className="text-white">{entry.memo || 'قيد بدون بيان'}</strong><div className="text-xs text-slate-400">{entry.date} • {entry.source.type} • {entry.id}</div></div><div className="text-xs text-emerald-300">مدين = دائن: {money(entry.lines.reduce((s,l)=>s+l.debit,0))} ج.م</div></div>
        <div className="mt-2 space-y-1 text-xs text-slate-300">{entry.lines.map((line,i)=>{const account=activeAccounts.find(a=>a.id===line.accountId);return <div key={i} className="flex justify-between gap-3"><span>{account?.code} — {account?.name}</span><span>مدين {money(line.debit)} / دائن {money(line.credit)}</span></div>})}</div>
        {canManage && !entry.reversalOf && <button onClick={()=>reverseEntry(entry)} className="mt-2 rounded-md border border-rose-500/60 px-2 py-1 text-xs text-rose-300">عكس القيد</button>}
      </article>)}{!periodEntries.length&&<p className="text-sm text-slate-400">لا توجد قيود حتى الآن.</p>}</div>
    </div>
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 font-bold text-white">دليل الحسابات</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{activeAccounts.map(a=><div key={a.id} className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">{a.code} • {typeLabel[a.type]}</div><div className="font-semibold text-white">{a.name}</div><div className="text-xs text-slate-500">{a.normalBalance==='debit'?'طبيعته مدينة':'طبيعته دائنة'}</div></div>)}</div>
    </div>
  </section>;
};
