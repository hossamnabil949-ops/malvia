import React, { useMemo, useState } from 'react';
import { todayISO } from '../utils/dateRange';
import { BankAccount, CardSettlementBatch, BankLedgerEntry, validateBankAccount, summarizeBankAccount } from '../utils/bankLedger';

interface BankLedgerViewProps {
  accounts: BankAccount[];
  settlements: CardSettlementBatch[];
  entries: BankLedgerEntry[];
  outstandingVisaBalance: number;
  onAddBankAccount: (account: BankAccount) => void;
  onSettleVisa: (batch: CardSettlementBatch) => { ok: boolean; message?: string };
}

const today = () => todayISO();
const money = (n: number) => `${n.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
const inputClass = 'w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-xs';

export const BankLedgerView: React.FC<BankLedgerViewProps> = ({
  accounts, settlements, entries, outstandingVisaBalance, onAddBankAccount, onSettleVisa,
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
