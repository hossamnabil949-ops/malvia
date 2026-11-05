import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, PlusCircle, RotateCcw } from 'lucide-react';
import type { Partner, PartnerCurrentAccountMovementType, PartnerCurrentAccountTransaction } from '../types/autoParts';
import type { BankAccount } from '../utils/bankLedger';
import type { OpeningBalanceRecord } from '../utils/openingBalanceLogic';
import {
  getOpenPartnerCurrentAccountOrigins,
  getPartnerCurrentAccountBalance,
  openingPartnerCurrentAccountBalance,
} from '../utils/partnerCurrentAccount';

interface Props {
  partners: Partner[];
  transactions: PartnerCurrentAccountTransaction[];
  openingBalances: OpeningBalanceRecord[];
  bankAccounts: BankAccount[];
  canManage: boolean;
  currentUserName: string;
  onRecord: (record: PartnerCurrentAccountTransaction) => boolean | void;
}

const TYPE_LABELS: Record<PartnerCurrentAccountMovementType, string> = {
  partner_deposit: 'إيداع من الشريك للمكان',
  partner_withdrawal: 'سحب الشريك من المكان',
  partner_repayment: 'رد الشريك مبلغ سبق سحبه',
  company_repayment: 'سداد المكان مبلغ سبق أودعه الشريك',
};
const money = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const directionLabel = (type: PartnerCurrentAccountMovementType) =>
  type === 'partner_deposit' || type === 'partner_repayment' ? 'قبض' : 'صرف';

export const PartnerCurrentAccountPanel: React.FC<Props> = ({
  partners, transactions, openingBalances, bankAccounts, canManage, currentUserName, onRecord,
}) => {
  const [partnerId, setPartnerId] = useState(partners.find(p => (p.status || 'ACTIVE') === 'ACTIVE')?.id || partners[0]?.id || '');
  const [type, setType] = useState<PartnerCurrentAccountMovementType>('partner_deposit');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('نقدي');
  const [bankAccountId, setBankAccountId] = useState('');
  const [relatedTransactionId, setRelatedTransactionId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const selectedPartner = partners.find(p => p.id === partnerId);
  const balance = getPartnerCurrentAccountBalance(partnerId, transactions, openingBalances);
  const origins = useMemo(() => (
    type === 'partner_repayment' || type === 'company_repayment'
      ? getOpenPartnerCurrentAccountOrigins(partnerId, type, transactions, openingBalances)
      : []
  ), [partnerId, type, transactions, openingBalances]);
  const selectedOrigin = origins.find(origin => origin.id === relatedTransactionId);
  const activeBankAccounts = useMemo(() => bankAccounts.filter(account => account.active), [bankAccounts]);

  useEffect(() => {
    if (!partnerId && partners.length) setPartnerId(partners.find(p => (p.status || 'ACTIVE') === 'ACTIVE')?.id || partners[0].id);
  }, [partners, partnerId]);

  useEffect(() => {
    if (type !== 'partner_repayment' && type !== 'company_repayment') {
      setRelatedTransactionId('');
      return;
    }
    if (!origins.some(origin => origin.id === relatedTransactionId)) {
      setRelatedTransactionId(origins[0]?.id || '');
    }
  }, [type, partnerId, origins, relatedTransactionId]);

  useEffect(() => {
    if (type === 'partner_repayment' && selectedOrigin?.paymentMethod) {
      const originalBankAvailable = selectedOrigin.paymentMethod !== 'تحويل بنكي' || activeBankAccounts.some(account => account.id === selectedOrigin.bankAccountId);
      if (!originalBankAvailable) { setPaymentMethod('نقدي'); setBankAccountId(''); }
      else { setPaymentMethod(selectedOrigin.paymentMethod); setBankAccountId(selectedOrigin.bankAccountId || ''); }
    }
  }, [type, selectedOrigin?.id, activeBankAccounts]);

  const partnerTransactions = useMemo(() => transactions
    .filter(item => item.partnerId === partnerId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [transactions, partnerId]);
  const openingBalance = openingPartnerCurrentAccountBalance(partnerId, openingBalances);
  const openingDate = openingBalances.find(item => item.status === 'approved')?.cutoverDate || '';
  const displayTransactions = [
    ...partnerTransactions.map(item => ({
      id: item.id, title: TYPE_LABELS[item.type], date: item.date, paymentMethod: String(item.paymentMethod),
      amount: item.amount, isIn: directionLabel(item.type) === 'قبض', reference: item.reference, notes: item.notes,
    })),
    ...(Math.abs(openingBalance) > 0.005 ? [{
      id: `OPENING:${partnerId}`, title: 'رصيد جاري افتتاحي', date: openingDate, paymentMethod: 'رصيد مرحل',
      amount: Math.abs(openingBalance), isIn: openingBalance > 0, reference: undefined, notes: openingBalance > 0 ? 'مستحق للشريك عند بدء MALVIA' : 'مستحق على الشريك عند بدء MALVIA',
    }] : []),
  ];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !selectedPartner || amount <= 0 || !Number.isFinite(amount)) return;
    if ((type === 'partner_repayment' || type === 'company_repayment') &&
      (!selectedOrigin || amount > selectedOrigin.remainingAmount + 0.005)) {
      window.alert('المبلغ أكبر من الرصيد المتبقي للحركة الأصلية.');
      return;
    }
    if (type === 'partner_repayment' && (balance >= -0.005 || amount > Math.abs(balance) + 0.005)) {
      window.alert('لا يمكن رد مبلغ أكبر من صافي المبلغ المستحق على الشريك.');
      return;
    }
    if (type === 'company_repayment' && (balance <= 0.005 || amount > balance + 0.005)) {
      window.alert('لا يمكن سداد مبلغ أكبر من صافي المبلغ المستحق للشريك.');
      return;
    }
    if (paymentMethod === 'تحويل بنكي' && !activeBankAccounts.some(account => account.id === bankAccountId)) {
      window.alert('اختر حسابًا بنكيًا نشطًا للحركة.');
      return;
    }
    if ((selectedPartner.status || 'ACTIVE') !== 'ACTIVE' &&
      (type === 'partner_deposit' || type === 'partner_withdrawal')) {
      window.alert('الشريك المتخارج لا تُسجل له إيداعات أو سحوبات جديدة؛ يمكن فقط تسوية رصيده القائم.');
      return;
    }

    const record: PartnerCurrentAccountTransaction = {
      id: `PCA-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      partnerId: selectedPartner.id,
      partnerName: selectedPartner.name,
      type,
      amount: Math.round(amount * 100) / 100,
      date: new Date().toISOString().slice(0, 10),
      paymentMethod,
      ...(paymentMethod === 'تحويل بنكي' ? { bankAccountId } : {}),
      ...(type === 'partner_repayment' || type === 'company_repayment' ? { relatedTransactionId } : {}),
      treasuryTransactionId: `TX-PCA-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      recordedBy: currentUserName,
      createdAt: new Date().toISOString(),
    };
    if (onRecord(record) === false) return;
    setAmount(0);
    setReference('');
    setNotes('');
    if (type === 'partner_repayment' || type === 'company_repayment') {
      setRelatedTransactionId('');
    }
  };

  const balanceLabel = balance >= 0 ? 'مستحق للشريك على المنشأة' : 'مستحق للمنشأة على الشريك';

  return (
    <div className="space-y-5" dir="rtl">
      <header className="rounded-2xl border border-neutral-800 bg-surface-2 p-4 md:p-5">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
          <RotateCcw className="w-4 h-4" />
          حسابات الشركاء الجارية
        </div>
        <h3 className="mt-1 text-lg md:text-xl font-black text-white">جاري الشركاء</h3>
        <p className="mt-1 text-xs leading-6 text-neutral-400">
          حساب مستقل للسلف والإيداعات والردود بين الشريك والمنشأة؛ لا يغيّر رأس المال أو نسب الملكية أو الأرباح أو المصروفات.
        </p>
        <p className="mt-2 text-[11px] leading-5 text-amber-300/90">
          المسحوبات الشخصية القديمة تظل في سجلها المستقل. لا تُكرر السلف القديمة المسجلة هناك داخل الرصيد الافتتاحي؛ أدخل فقط أي رصيد جاري غير مسجل سابقًا.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {partners.map(partner => {
          const current = getPartnerCurrentAccountBalance(partner.id, transactions, openingBalances);
          return (
            <button key={partner.id} type="button" onClick={() => setPartnerId(partner.id)}
              className={`rounded-xl border p-3 text-right transition ${partner.id === partnerId ? 'border-amber-500/60 bg-amber-500/10' : 'border-neutral-800 bg-surface-2 hover:border-neutral-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-white">{partner.name}</span>
                <span className="text-[10px] text-neutral-500">{(partner.status || 'ACTIVE') === 'ACTIVE' ? 'نشط' : 'متخارج'}</span>
              </div>
              <div className={`mt-2 text-lg font-black font-mono ${current >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(Math.abs(current))} ج.م</div>
              <div className="mt-1 text-[10px] text-neutral-400">{current === 0 ? 'الرصيد متوازن' : current >= 0 ? 'مستحق للشريك' : 'مستحق على الشريك'}</div>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-800 bg-surface-2 p-4 space-y-3">
          <h4 className="font-bold text-white flex items-center gap-2"><PlusCircle className="w-4 h-4 text-amber-400"/> تسجيل حركة جديدة</h4>
          <label className="block text-xs text-neutral-300">الشريك
            <select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white">
              {partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}{(partner.status || 'ACTIVE') !== 'ACTIVE' ? ' — متخارج' : ''}</option>)}
            </select>
          </label>
          <label className="block text-xs text-neutral-300">نوع الحركة
            <select value={type} onChange={e => setType(e.target.value as PartnerCurrentAccountMovementType)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white">
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {(type === 'partner_repayment' || type === 'company_repayment') && (
            <label className="block text-xs text-neutral-300">الحركة الأصلية المراد تسويتها
              <select value={relatedTransactionId} onChange={e => setRelatedTransactionId(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white">
                <option value="">اختر الحركة الأصلية</option>
                {origins.map(origin => <option key={origin.id} value={origin.id}>{origin.label} — متبقي {money(origin.remainingAmount)} ج.م</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs text-neutral-300">المبلغ بالجنيه
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white font-mono"/>
          </label>
          <label className="block text-xs text-neutral-300">جهة الحركة
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} disabled={type === 'partner_repayment' && Boolean(selectedOrigin?.paymentMethod) && (selectedOrigin.paymentMethod !== 'تحويل بنكي' || activeBankAccounts.some(account => account.id === selectedOrigin.bankAccountId))} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white disabled:opacity-60">
              <option value="نقدي">درج نقدي</option>
              <option value="تحويل بنكي">حساب بنكي / تحويل</option>
              <option value="محفظة إلكترونية">محفظة إلكترونية</option>
            </select>
          </label>
          {paymentMethod === 'تحويل بنكي' && (
            <label className="block text-xs text-neutral-300">الحساب البنكي
              <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white">
                <option value="">اختر الحساب البنكي</option>
                {activeBankAccounts.map(account => <option key={account.id} value={account.id}>{account.bankName} — {account.name}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs text-neutral-300">رقم مرجعي (اختياري)
            <input value={reference} onChange={e => setReference(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white"/>
          </label>
          <label className="block text-xs text-neutral-300">ملاحظات
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2.5 text-white"/>
          </label>
          {selectedPartner && <div className="rounded-lg bg-surface-1 border border-neutral-800 p-3 text-xs">
            <div className="text-neutral-400">الرصيد الحالي — {balanceLabel}</div>
            <div className={`mt-1 text-lg font-black font-mono ${balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(Math.abs(balance))} ج.م</div>
            {type === 'partner_repayment' && selectedOrigin?.paymentMethod && <p className="mt-2 text-neutral-400">سيُعاد المبلغ إلى نفس الجهة التي تم الصرف منها: {selectedOrigin.paymentMethod}</p>}
          </div>}
          <button type="submit" disabled={!canManage || !selectedPartner || amount <= 0 || ((type === 'partner_repayment' || type === 'company_repayment') && !selectedOrigin) || (paymentMethod === 'تحويل بنكي' && !bankAccountId)}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 p-3 font-black text-sm touch-manipulation">
            تسجيل الحركة وحفظها
          </button>
        </form>

        <section className="rounded-2xl border border-neutral-800 bg-surface-2 p-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-white">كشف حساب {selectedPartner?.name || 'الشريك'}</h4>
            <span className="text-[10px] text-neutral-400">{partnerTransactions.length} حركة</span>
          </div>
          <div className="space-y-2">
            {displayTransactions.map(item => {
              const isIn = item.isIn;
              return <article key={item.id} className="rounded-xl border border-neutral-800 bg-surface-1 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{item.title}</div>
                    <div className="mt-1 text-[10px] text-neutral-400">{item.date} · {item.paymentMethod}</div>
                    {item.reference && <div className="mt-1 text-[10px] text-neutral-500">مرجع: {item.reference}</div>}
                    {item.notes && <div className="mt-1 text-[10px] text-neutral-500 break-words">{item.notes}</div>}
                  </div>
                  <div className="shrink-0 text-left">
                    <div className={`font-mono font-black text-sm ${isIn ? 'text-emerald-400' : 'text-rose-400'}`}>{isIn ? '+' : '-'}{money(item.amount)}</div>
                    <div className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1 justify-end">{isIn ? <ArrowDownLeft className="w-3 h-3"/> : <ArrowUpRight className="w-3 h-3"/>}{item.id.startsWith('OPENING:') ? 'رصيد افتتاحي' : isIn ? 'قبض' : 'صرف'}</div>
                  </div>
                </div>
              </article>;
            })}
            {displayTransactions.length === 0 && <div className="rounded-xl bg-surface-1 p-6 text-center text-xs text-neutral-500">لا توجد حركات مسجلة لهذا الشريك حتى الآن.</div>}
          </div>
        </section>
      </div>
    </div>
  );
};
