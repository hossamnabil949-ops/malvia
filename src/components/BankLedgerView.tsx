import React, { useMemo, useState } from 'react';
import { todayISO } from '../utils/dateRange';
import { parseBankStatementWorkbook } from '../utils/bankStatementImport';
import { reconcileBankStatement, type BankStatementLine } from '../utils/bankReconciliation';
import { BankAccount, CardSettlementBatch, BankLedgerEntry, validateBankAccount, summarizeBankAccount } from '../utils/bankLedger';

interface BankLedgerViewProps {
  accounts: BankAccount[];
  settlements: CardSettlementBatch[];
  entries: BankLedgerEntry[];
  outstandingVisaBalance: number;
  onAddBankAccount: (account: BankAccount) => void;
  onSettleVisa: (batch: CardSettlementBatch) => { ok: boolean; message?: string };
  onTransferBank?: (input: { id: string; sourceBankAccountId: string; destinationBankAccountId: string; amount: number; date: string; reference: string }) => { ok: boolean; message?: string };
  cashBalance: number;
  onCashBankMovement?: (input: { id: string; direction: 'deposit' | 'withdrawal'; bankAccountId: string; amount: number; date: string; reference: string; notes?: string }) => { ok: boolean; message?: string };
}

const today = () => todayISO();
const money = (n: number) => `${n.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
const inputClass = 'w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-xs';

export const BankLedgerView: React.FC<BankLedgerViewProps> = ({
  accounts, settlements, entries, outstandingVisaBalance, onAddBankAccount, onSettleVisa, onTransferBank, cashBalance, onCashBankMovement,
}) => {
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [last4, setLast4] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingDate, setOpeningDate] = useState(today());
  const [processor, setProcessor] = useState('بنك التحصيل');
  const [gross, setGross] = useState('');
  const [fee, setFee] = useState('0');
  const [settlementDate, setSettlementDate] = useState(today());
  const [reference, setReference] = useState('');
  const [bankAccountId, setBankAccountId] = useState(accounts.find(a => a.active)?.id || '');
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(today());
  const [transferReference, setTransferReference] = useState('');
  const [cashBankDirection, setCashBankDirection] = useState<'deposit' | 'withdrawal'>('deposit');
  const [cashBankAccountId, setCashBankAccountId] = useState(accounts.find(a => a.active)?.id || '');
  const [cashBankAmount, setCashBankAmount] = useState('');
  const [cashBankDate, setCashBankDate] = useState(today());
  const [cashBankReference, setCashBankReference] = useState('');
  const [cashBankNotes, setCashBankNotes] = useState('');
  const [statementAccountId, setStatementAccountId] = useState(accounts.find(a => a.active)?.id || '');
  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [statementFileName, setStatementFileName] = useState('');
  const [statementErrors, setStatementErrors] = useState<string[]>([]);
  const [statementError, setStatementError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeAccounts = useMemo(() => accounts.filter(a => a.active), [accounts]);
  const balances = useMemo(() => accounts.map(account => ({
    account,
    balance: summarizeBankAccount(account, entries),
  })), [accounts, entries]);
  const grossAmount = Number(gross) || 0;
  const feeAmount = Number(fee) || 0;
  const netAmount = Math.round((grossAmount - feeAmount + Number.EPSILON) * 100) / 100;
  const reconciliation = useMemo(() => statementAccountId && statementLines.length ? reconcileBankStatement(statementAccountId, statementLines, entries) : null, [statementAccountId, statementLines, entries]);

  const addAccount = (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    const account: BankAccount = {
      id: `BANK-${Date.now()}`,
      name: accountName.trim(),
      bankName: bankName.trim(),
      accountLast4: last4.trim() || undefined,
      openingBalance: Number(openingBalance),
      openingDate,
      active: true,
    };
    const validation = validateBankAccount(account, accounts);
    if (validation) {
      setError(validation === 'BANK_ACCOUNT_DUPLICATE' ? 'معرّف الحساب مستخدم بالفعل.' : 'أكمل اسم الحساب والبنك وتأكد من الرصيد والتاريخ.');
      return;
    }
    onAddBankAccount(account);
    setAccountName(''); setBankName(''); setLast4(''); setOpeningBalance('0');
    setNotice('تمت إضافة الحساب البنكي. الرصيد الافتتاحي محفوظ دون تغيير الحركات التاريخية.');
  };

  const submitSettlement = (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!bankAccountId || !activeAccounts.some(a => a.id === bankAccountId)) {
      setError('اختر حسابًا بنكيًا نشطًا لاستلام صافي التسوية.'); return;
    }
    if (!reference.trim()) { setError('أدخل رقم مرجع التسوية الصادر من البنك.'); return; }
    if (!Number.isFinite(grossAmount) || grossAmount <= 0 || feeAmount < 0 || feeAmount >= grossAmount) {
      setError('راجع إجمالي التسوية والعمولة؛ يجب أن تكون العمولة أقل من الإجمالي.'); return;
    }
    if (grossAmount > outstandingVisaBalance + 0.005) {
      setError(`قيمة التسوية تتجاوز مستحقات الفيزا المتاحة (${money(outstandingVisaBalance)}).`); return;
    }
    const batch: CardSettlementBatch = {
      id: `VISA-SET-${Date.now()}`,
      processor: processor.trim() || 'بنك التحصيل',
      grossAmount: Math.round(grossAmount * 100) / 100,
      feeAmount: Math.round(feeAmount * 100) / 100,
      netAmount,
      settlementDate,
      bankAccountId,
      reference: reference.trim(),
    };
    const result = onSettleVisa(batch);
    if (!result.ok) { setError(result.message || 'تعذّر تسجيل التسوية.'); return; }
    setGross(''); setFee('0'); setReference('');
    setNotice('تم تسجيل التسوية وربط صافي المبلغ بالحساب البنكي المحدد.');
  };


  const submitCashBankMovement = (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!onCashBankMovement) { setError('وظيفة التحويل بين الخزينة والبنك غير متاحة حالياً.'); return; }
    const amount = Number(cashBankAmount);
    const account = activeAccounts.find(item => item.id === cashBankAccountId);
    if (!account || !Number.isFinite(amount) || amount <= 0 || !cashBankDate || !cashBankReference.trim()) {
      setError('اختر حساباً بنكياً نشطاً وأدخل مبلغاً وتاريخاً ومرجعاً صحيحاً.'); return;
    }
    if (cashBankDirection === 'deposit' && amount > cashBalance + 0.005) {
      setError('رصيد الخزينة النقدي غير كافٍ. المتاح: ' + money(cashBalance)); return;
    }
    const bankBalance = summarizeBankAccount(account, entries);
    if (cashBankDirection === 'withdrawal' && amount > bankBalance + 0.005) {
      setError('رصيد الحساب البنكي غير كافٍ. المتاح: ' + money(bankBalance)); return;
    }
    const result = onCashBankMovement({
      id: 'CASH-BANK-' + Date.now(), direction: cashBankDirection, bankAccountId: cashBankAccountId,
      amount, date: cashBankDate, reference: cashBankReference.trim(), notes: cashBankNotes.trim() || undefined,
    });
    if (!result.ok) { setError(result.message || 'تعذّر تسجيل التحويل.'); return; }
    setCashBankAmount(''); setCashBankReference(''); setCashBankNotes('');
    setNotice(cashBankDirection === 'deposit' ? 'تم تسجيل إيداع نقدي من الخزينة إلى البنك.' : 'تم تسجيل سحب نقدي من البنك إلى الخزينة.');
  };

  const importStatement = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatementError(''); setStatementErrors([]); setStatementLines([]); setStatementFileName('');
    if (!statementAccountId || !activeAccounts.some(account => account.id === statementAccountId)) {
      setStatementError('اختر الحساب البنكي المطابق لكشف الحساب أولاً.');
      event.target.value = '';
      return;
    }
    try {
      const parsed = parseBankStatementWorkbook(await file.arrayBuffer(), statementAccountId);
      if (!parsed.lines.length) setStatementError(parsed.errors[0] || 'لم يتم العثور على حركات صالحة في الملف.');
      else {
        setStatementLines(parsed.lines);
        setStatementFileName(file.name);
        setStatementErrors(parsed.errors);
      }
    } catch {
      setStatementError('تعذرت قراءة الملف. استخدم كشف Excel أو CSV واضح الأعمدة.');
    }
    event.target.value = '';
  };

  const submitTransfer = (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!onTransferBank) { setError('وظيفة التحويل البنكي غير متاحة حالياً.'); return; }
    const amount = Number(transferAmount);
    if (!transferSourceId || !transferDestinationId || transferSourceId === transferDestinationId || !Number.isFinite(amount) || amount <= 0 || !transferDate) {
      setError('اختر حسابين مختلفين نشطين وأدخل مبلغاً وتاريخاً صحيحين.'); return;
    }
    const result = onTransferBank({ id: `BANK-TRF-${Date.now()}`, sourceBankAccountId: transferSourceId, destinationBankAccountId: transferDestinationId, amount, date: transferDate, reference: transferReference.trim() });
    if (!result.ok) { setError(result.message || 'تعذّر تسجيل التحويل البنكي.'); return; }
    setTransferAmount(''); setTransferReference('');
    setNotice('تم تسجيل التحويل بقيدين متقابلين: صرف من الحساب المصدر وإيداع في الحساب المستلم.');
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
          <div className="text-xs text-neutral-400">مستحقات الفيزا غير المسوّاة</div>
          <div className="mt-1 text-xl font-black text-amber-300 font-mono">{money(Math.max(0, outstandingVisaBalance))}</div>
          <div className="text-[10px] text-neutral-500 mt-1">من مستحقات الفيزا المسجلة بعد ترحيل التسويات السابقة إلى البنك</div>
        </div>
        <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
          <div className="text-xs text-neutral-400">الحسابات البنكية النشطة</div>
          <div className="mt-1 text-xl font-black text-white font-mono">{activeAccounts.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
          <div className="text-xs text-neutral-400">دفعات الفيزا المسوّاة</div>
          <div className="mt-1 text-xl font-black text-white font-mono">{settlements.length}</div>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-200">{notice}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={addAccount} className="p-4 rounded-2xl bg-surface-2 border border-neutral-800 space-y-3">
          <h3 className="font-black text-white text-sm">إضافة حساب بنكي مستقل</h3>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="اسم الحساب (مثلاً الجاري)" required />
            <input className={inputClass} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="اسم البنك" required />
            <input className={inputClass} value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(-4))} placeholder="آخر 4 أرقام (اختياري)" inputMode="numeric" />
            <input className={inputClass} type="number" min="0" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="الرصيد الافتتاحي" required />
            <label className="col-span-2 text-[11px] text-neutral-400">تاريخ الرصيد الافتتاحي<input className={inputClass + ' mt-1'} type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} required /></label>
          </div>
          <button className="h-10 px-4 rounded-xl bg-amber-500 text-black text-xs font-black" type="submit">حفظ الحساب البنكي</button>
        </form>

        <form onSubmit={submitSettlement} className="p-4 rounded-2xl bg-surface-2 border border-neutral-800 space-y-3">
          <h3 className="font-black text-white text-sm">تسجيل تسوية دفعة فيزا وصلت فعليًا</h3>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} value={processor} onChange={e => setProcessor(e.target.value)} placeholder="جهة التحصيل / البنك" required />
            <select className={inputClass} value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} required>
              <option value="">اختر الحساب المستلم</option>
              {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.name}{a.accountLast4 ? ` ••${a.accountLast4}` : ''}</option>)}
            </select>
            <input className={inputClass} type="number" min="0.01" step="0.01" value={gross} onChange={e => setGross(e.target.value)} placeholder="إجمالي الفيزا المسوّى" required />
            <input className={inputClass} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} placeholder="عمولة البنك" required />
            <input className={inputClass} type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} required />
            <input className={inputClass} value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم مرجع / دفعة البنك" required />
          </div>
          <div className="rounded-xl bg-surface-1 p-3 flex justify-between text-xs"><span className="text-neutral-400">صافي المبلغ المضاف للبنك</span><strong className="text-emerald-300 font-mono">{money(Math.max(0, netAmount))}</strong></div>
          <button className="h-10 px-4 rounded-xl bg-emerald-500 text-black text-xs font-black disabled:opacity-40" type="submit" disabled={!activeAccounts.length}>اعتماد التسوية الفعلية</button>
          <p className="text-[10px] text-neutral-500">لا تسجل التسوية إلا بعد ظهور الإيداع في كشف البنك. لا تُضاف مستحقات الفيزا إلى رصيد البنك قبل هذه الخطوة.</p>
        </form>
      </div>

      <form onSubmit={submitTransfer} className="p-4 rounded-2xl bg-surface-2 border border-sky-500/30 space-y-3">
        <div>
          <h3 className="font-black text-white text-sm">تحويل بين حسابين بنكيين</h3>
          <p className="text-[10px] text-neutral-500 mt-1">يسجل النظام حركة صرف من المصدر وحركة قبض مساوية في الحساب المستلم، دون التأثير على إجمالي النقدية أو الخزينة.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select className={inputClass} value={transferSourceId} onChange={e => setTransferSourceId(e.target.value)} required>
            <option value="">الحساب المحوّل منه</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}
          </select>
          <select className={inputClass} value={transferDestinationId} onChange={e => setTransferDestinationId(e.target.value)} required>
            <option value="">الحساب المستلم</option>
            {activeAccounts.filter(a => a.id !== transferSourceId).map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}
          </select>
          <input className={inputClass} type="number" min="0.01" step="0.01" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="المبلغ" required />
          <input className={inputClass} type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} required />
          <input className={inputClass} value={transferReference} onChange={e => setTransferReference(e.target.value)} placeholder="رقم مرجع التحويل" />
        </div>
        <button className="h-10 px-4 rounded-xl bg-sky-500 text-black text-xs font-black disabled:opacity-40" type="submit" disabled={activeAccounts.length < 2}>تسجيل التحويل البنكي</button>
      </form>


      <form onSubmit={submitCashBankMovement} className="p-4 rounded-2xl bg-surface-2 border border-emerald-500/30 space-y-3">
        <div>
          <h3 className="font-black text-white text-sm">سند إيداع / سحب بين الخزينة والبنك</h3>
          <p className="text-[10px] text-neutral-400 mt-1">تحويل بين أصلين فقط؛ لا يُسجل كإيراد أو مصروف. ينشئ النظام حركة خزينة وحركة بنك مرتبطتين برقم سند واحد.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <select className={inputClass} value={cashBankDirection} onChange={e => setCashBankDirection(e.target.value as 'deposit' | 'withdrawal')}>
            <option value="deposit">إيداع نقدية بالبنك</option>
            <option value="withdrawal">سحب نقدية من البنك</option>
          </select>
          <select className={inputClass} value={cashBankAccountId} onChange={e => setCashBankAccountId(e.target.value)} required>
            <option value="">اختر الحساب البنكي</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}
          </select>
          <input className={inputClass} type="number" min="0.01" step="0.01" value={cashBankAmount} onChange={e => setCashBankAmount(e.target.value)} placeholder="المبلغ" required />
          <input className={inputClass} type="date" value={cashBankDate} onChange={e => setCashBankDate(e.target.value)} required />
          <input className={inputClass} value={cashBankReference} onChange={e => setCashBankReference(e.target.value)} placeholder="رقم إيصال / مرجع" required />
          <input className={inputClass} value={cashBankNotes} onChange={e => setCashBankNotes(e.target.value)} placeholder="ملاحظات (اختياري)" />
        </div>
        <div className="flex flex-wrap gap-4 text-[11px] text-neutral-300">
          <span>رصيد الخزينة النقدي: <b className="text-emerald-300 font-mono">{money(cashBalance)}</b></span>
          {cashBankAccountId && accounts.some(a => a.id === cashBankAccountId) && <span>رصيد البنك المحدد: <b className="text-sky-300 font-mono">{money(summarizeBankAccount(accounts.find(a => a.id === cashBankAccountId)!, entries))}</b></span>}
        </div>
        <button className="h-10 px-4 rounded-xl bg-emerald-500 text-black text-xs font-black disabled:opacity-40" type="submit" disabled={!activeAccounts.length || !onCashBankMovement}>تسجيل سند التحويل</button>
      </form>

      <section className="p-4 rounded-2xl bg-surface-2 border border-violet-500/30 space-y-3">
        <div>
          <h3 className="font-black text-white text-sm">مطابقة كشف الحساب البنكي</h3>
          <p className="text-[10px] text-neutral-400 mt-1">استيراد CSV أو Excel للمراجعة فقط. لا يتم تعديل دفتر البنك أو إنشاء قيود تسوية من هذه الشاشة.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select className={inputClass} value={statementAccountId} onChange={e => { setStatementAccountId(e.target.value); setStatementLines([]); setStatementFileName(''); setStatementErrors([]); }} required>
            <option value="">اختر الحساب البنكي</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}
          </select>
          <input className={inputClass} type="file" accept=".csv,.xlsx,.xls" onChange={importStatement} disabled={!statementAccountId} />
        </div>
        {statementError && <p role="alert" className="text-xs text-rose-300">{statementError}</p>}
        {statementFileName && <p className="text-[10px] text-neutral-400">الملف: {statementFileName} — {statementLines.length} حركة مستوردة للمعاينة فقط.</p>}
        {statementErrors.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-2 text-[10px] text-amber-200">تم استبعاد {statementErrors.length} صفوف غير صالحة: {statementErrors.slice(0, 5).join('؛ ')}</div>}
        {reconciliation && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-surface-1 p-2">متطابق<br/><b className="text-emerald-300">{reconciliation.matchedCount}</b></div>
              <div className="rounded-lg bg-surface-1 p-2">غير مطابق<br/><b className="text-rose-300">{reconciliation.unmatchedStatementCount}</b></div>
              <div className="rounded-lg bg-surface-1 p-2">ملتبس<br/><b className="text-amber-300">{reconciliation.ambiguousCount}</b></div>
              <div className="rounded-lg bg-surface-1 p-2">مكرر<br/><b className="text-amber-300">{reconciliation.duplicateStatementCount}</b></div>
              <div className="rounded-lg bg-surface-1 p-2">حركات دفتر غير موجودة بالكشف<br/><b className="text-sky-300">{reconciliation.unmatchedLedgerEntryIds.length}</b></div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full min-w-[720px] text-right text-[11px]">
                <thead className="bg-surface-1 text-neutral-400"><tr><th className="p-2">التاريخ</th><th className="p-2">المرجع</th><th className="p-2">الاتجاه</th><th className="p-2">المبلغ</th><th className="p-2">الحالة</th><th className="p-2">الحركة المقابلة</th></tr></thead>
                <tbody className="divide-y divide-neutral-800">
                  {reconciliation.matches.map((match, index) => {
                    const line = statementLines[index];
                    const status = match.status === 'matched_reference' ? 'متطابق بالمرجع' : match.status === 'matched_amount_date' ? 'متطابق بالمبلغ والتاريخ' : match.status === 'ambiguous_statement' ? 'يحتاج مراجعة' : match.status === 'duplicate_statement' ? 'صف مكرر' : 'غير موجود بدفتر البنك';
                    return <tr key={line.id}><td className="p-2 font-mono">{line.date}</td><td className="p-2 font-mono">{line.reference || '—'}</td><td className="p-2">{line.direction === 'in' ? 'إيداع' : 'سحب'}</td><td className="p-2 font-mono">{money(line.amount)}</td><td className="p-2">{status}</td><td className="p-2 font-mono">{'ledgerEntryId' in match ? match.ledgerEntryId : match.candidateLedgerEntryIds.join('، ') || '—'}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-amber-200">نتيجة المطابقة استرشادية فقط. لا تعتمد فروقاً أو تسويات من دون مراجعة المستندات والموافقة المنفصلة.</p>
            <button type="button" className="text-xs text-neutral-300 underline" onClick={() => { setStatementLines([]); setStatementFileName(''); setStatementErrors([]); }}>مسح معاينة الكشف</button>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-black text-white text-sm">أرصدة الحسابات البنكية</h3>
        <div className="overflow-x-auto rounded-2xl border border-neutral-800">
          <table className="w-full text-right text-xs min-w-[620px]">
            <thead className="bg-surface-1 text-neutral-400"><tr><th className="p-3">البنك</th><th className="p-3">الحساب</th><th className="p-3">آخر 4 أرقام</th><th className="p-3">الرصيد الافتتاحي</th><th className="p-3">الرصيد الحالي</th><th className="p-3">الحالة</th></tr></thead>
            <tbody className="divide-y divide-neutral-800">
              {balances.map(({account, balance}) => <tr key={account.id}><td className="p-3">{account.bankName}</td><td className="p-3 font-bold text-white">{account.name}</td><td className="p-3 font-mono">{account.accountLast4 || '—'}</td><td className="p-3 font-mono">{money(account.openingBalance)}</td><td className="p-3 font-mono font-black text-emerald-300">{money(balance)}</td><td className="p-3">{account.active ? 'نشط' : 'موقوف'}</td></tr>)}
              {!balances.length && <tr><td colSpan={6} className="p-5 text-center text-neutral-500">لم تُضف حسابات بنكية بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-black text-white text-sm">سجل تسويات الفيزا</h3>
        <div className="overflow-x-auto rounded-2xl border border-neutral-800">
          <table className="w-full text-right text-xs min-w-[700px]">
            <thead className="bg-surface-1 text-neutral-400"><tr><th className="p-3">التاريخ</th><th className="p-3">الجهة</th><th className="p-3">المرجع</th><th className="p-3">الإجمالي</th><th className="p-3">العمولة</th><th className="p-3">الصافي</th><th className="p-3">الحساب المستلم</th></tr></thead>
            <tbody className="divide-y divide-neutral-800">
              {[...settlements].sort((a,b) => b.settlementDate.localeCompare(a.settlementDate)).map(batch => {
                const account = accounts.find(a => a.id === batch.bankAccountId);
                return <tr key={batch.id}><td className="p-3 font-mono">{batch.settlementDate}</td><td className="p-3">{batch.processor}</td><td className="p-3 font-mono">{batch.reference}</td><td className="p-3 font-mono">{money(batch.grossAmount)}</td><td className="p-3 font-mono text-rose-300">{money(batch.feeAmount)}</td><td className="p-3 font-mono text-emerald-300">{money(batch.netAmount)}</td><td className="p-3">{account ? `${account.bankName} — ${account.name}` : 'حساب غير موجود'}</td></tr>;
              })}
              {!settlements.length && <tr><td colSpan={7} className="p-5 text-center text-neutral-500">لا توجد تسويات مسجلة.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
