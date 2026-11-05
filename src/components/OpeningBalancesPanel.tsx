import React, { useMemo, useState } from 'react';
import type { AutoPart, Partner, Customer, Supplier } from '../types/autoParts';
import type { BankAccount } from '../utils/bankLedger';
import { openingDifferenceLabel, summarizeOpeningBalances, validateOpeningBalanceRecord } from '../utils/openingBalanceLogic';
import type { OpeningBalanceCategory, OpeningBalanceLine, OpeningBalanceRecord } from '../utils/openingBalanceLogic';

interface Props {
  existing?: OpeningBalanceRecord[];
  partners: Partner[];
  parts: AutoPart[];
  bankAccounts: BankAccount[];
  customers: Customer[];
  suppliers: Supplier[];
  currentUser: string;
  onApprove: (record: OpeningBalanceRecord) => boolean;
}
const CATEGORIES: { value: OpeningBalanceCategory; label: string }[] = [
  { value: 'inventory', label: 'مخزون بضاعة' }, { value: 'cash', label: 'نقدية بالخزينة' },
  { value: 'bank', label: 'رصيد حساب بنكي' }, { value: 'wallet', label: 'رصيد المحفظة الإلكترونية' }, { value: 'fixed_asset', label: 'معدات وأثاث وأصول ثابتة' },
  { value: 'prepaid', label: 'تأمين / مقدم إيجار' }, { value: 'customer_receivable', label: 'مستحقات لدى العملاء' },
  { value: 'other_asset', label: 'أصول أخرى' }, { value: 'supplier_payable', label: 'مستحقات الموردين' },
  { value: 'loan', label: 'قروض والتزامات' }, { value: 'other_liability', label: 'التزامات أخرى' }, { value: 'historical_expense', label: 'مصروفات تأسيس / إيجار مستهلكة' },
];
const money = (n: number) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';

export const OpeningBalancesPanel: React.FC<Props> = ({ existing = [], partners, parts, bankAccounts, customers, suppliers, currentUser, onApprove }) => {
  const approved = existing.find(r => r.status === 'approved');
  const [capital, setCapital] = useState(0);
  const [cutoverDate, setCutoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [originalOpeningDate, setOriginalOpeningDate] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<OpeningBalanceCategory>('inventory');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [bankAccountId, setBankAccountId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [lines, setLines] = useState<OpeningBalanceLine[]>([]);
  const [partnerContributions, setPartnerContributions] = useState<Record<string, number>>(
    Object.fromEntries(partners.map(p => [p.id, p.initialCapital || 0]))
  );
  const [partnerCurrentBalances, setPartnerCurrentBalances] = useState<Record<string, number>>(
    Object.fromEntries(partners.map(p => [p.id, 0]))
  );
  const totalLines = useMemo(() => lines.reduce((sum, line) => sum + line.amount, 0), [lines]);
  const contributionTotal = partners.reduce((sum, p) => sum + Number(partnerContributions[p.id] || 0), 0);
  const shareDenominator = capital > 0 ? capital : contributionTotal;
  const partnerRows = partners.map(p => {
    const contribution = Number(partnerContributions[p.id] || 0);
    return { partnerId: p.id, partnerName: p.name, originalContribution: contribution, ownershipPercentage: shareDenominator > 0 ? Number(((contribution / shareDenominator) * 100).toFixed(4)) : 0, currentAccountBalance: Number(partnerCurrentBalances[p.id] || 0) };
  });
  const preview = useMemo(() => summarizeOpeningBalances({ partners: partnerRows, lines }), [lines, partners, partnerContributions, partnerCurrentBalances, capital]);
  const effectiveAmount = amount;
  const isLiability = ['supplier_payable', 'loan', 'other_liability'].includes(category);
  const isHistoricalExpense = category === 'historical_expense';

  const addLine = () => {
    if (category === 'inventory' && amount <= 0) return;
    if (category === 'bank' && !bankAccounts.some(a => a.id === bankAccountId && a.active)) return;
    if (['customer_receivable', 'supplier_payable'].includes(category) && !entityId) return;
    if (!Number.isFinite(effectiveAmount) || effectiveAmount < 0) return;
    const next: OpeningBalanceLine = {
      id: `OBL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      category, label: label.trim() || (category === 'inventory' ? 'إجمالي تكلفة مخزون البضاعة' : CATEGORIES.find(c => c.value === category)?.label || 'بند'),
      amount: Math.round(effectiveAmount * 100) / 100,
      ...(category === 'bank' ? { bankAccountId } : {}),
      ...(['customer_receivable', 'supplier_payable'].includes(category) ? { entityId } : {}),
    };
    setLines(prev => [...prev, next]);
    setLabel(''); setAmount(0); setBankAccountId(''); setEntityId('');
  };

  const approve = () => {
    const record: OpeningBalanceRecord = {
      id: `OPENING-${Date.now()}`, status: 'approved', cutoverDate,
      ...(originalOpeningDate ? { originalOpeningDate } : {}),
      originalCapital: capital, partners: partnerRows, lines,
      notes: notes.trim(), createdAt: new Date().toISOString(), createdBy: currentUser,
      approvedAt: new Date().toISOString(), approvedBy: currentUser,
    };
    const error = validateOpeningBalanceRecord(record, { activeBankAccountIds: bankAccounts.filter(a => a.active).map(a => a.id) });
    if (error) { window.alert('تعذر اعتماد الأرصدة الافتتاحية: ' + error); return; }
    if (!window.confirm('سيتم تثبيت الأرصدة الافتتاحية بتاريخ ' + cutoverDate + ' ولا يمكن تعديلها أو حذفها. هل تريد الاعتماد؟')) return;
    if (onApprove(record)) window.alert('تم اعتماد سجل الأرصدة الافتتاحية.');
  };

  if (approved) {
    const summary = summarizeOpeningBalances(approved);
    const difference = summary.reconciliationDifference;
    const status = openingDifferenceLabel(difference);
    return <section className="rounded-2xl border border-neutral-800 bg-surface-2 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-white">الأرصدة الافتتاحية المعتمدة</h3><span className="text-xs text-emerald-400">معتمد — {approved.cutoverDate}</span></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="رأس المال الأصلي" value={approved.originalCapital}/>
        <Metric label="إجمالي الأصول" value={summary.assets}/>
        <Metric label="إجمالي الالتزامات" value={summary.liabilities}/><Metric label="مصروفات تاريخية" value={summary.historicalExpenses}/>
        <Metric label="صافي الأصول" value={summary.netAssets}/><Metric label="جاري شركاء (مستحق لهم)" value={summary.partnerCurrentAccountPayable}/><Metric label="جاري شركاء (مستحق عليهم)" value={summary.partnerCurrentAccountReceivable}/>
      </div>
      <div className="rounded-xl bg-surface-1 border border-neutral-700 p-4">
        <div className="text-xs text-neutral-400">فرق التسوية مقابل مساهمات الشركاء المسجلة</div>
        <div className={`text-2xl font-black font-mono mt-1 ${status === 'balanced' ? 'text-emerald-400' : 'text-amber-400'}`}>{difference > 0 ? '+' : ''}{money(difference)} ج.م</div>
        <p className="text-xs text-neutral-400 mt-2">{status === 'balanced' ? 'الأرصدة متوازنة بعد احتساب رأس المال وجاري الشركاء.' : status === 'unexplained_surplus' ? 'فائض افتتاحي غير مفسر؛ لا يُسجل ربحًا تلقائيًا.' : 'عجز افتتاحي غير مفسر؛ لا يُسجل خسارة تلقائيًا.'}</p>
      </div>
      <p className="text-xs text-neutral-500">السجل محفوظ وغير قابل للتعديل. أي تصحيح لاحق يجب أن يتم بتسوية مستقلة موثقة.</p>
    </section>;
  }

  return <section className="rounded-2xl border border-neutral-800 bg-surface-2 p-5 space-y-5">
    <div><h3 className="text-white font-bold text-lg">تهيئة رأس المال والأرصدة الافتتاحية</h3><p className="text-xs text-neutral-400 mt-1">للمحل الجديد أو القائم بالفعل. أدخل رأس المال التاريخي، ثم جرد الأصول والالتزامات الفعلية في تاريخ بدء MALVIA.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Field label="رأس المال الأصلي عند التأسيس" value={capital} onChange={setCapital}/>
      <label className="text-xs text-neutral-300">تاريخ بدء MALVIA<input type="date" value={cutoverDate} onChange={e=>setCutoverDate(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white"/></label>
      <label className="text-xs text-neutral-300">تاريخ افتتاح المحل الأصلي<input type="date" value={originalOpeningDate} onChange={e=>setOriginalOpeningDate(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white"/></label>
    </div>
    {partners.length > 0 && <div className="space-y-2"><h4 className="text-sm text-white font-bold">مساهمات الشركاء ونسب الملكية</h4>{partners.map(p=><div key={p.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center rounded-lg bg-surface-1 p-3"><span className="text-xs text-white">{p.name}</span><Field label="المساهمة الأصلية" value={partnerContributions[p.id] || 0} onChange={v=>setPartnerContributions(x=>({...x,[p.id]:v}))}/><div className="text-xs text-neutral-300">النسبة المحسوبة تلقائيًا <b className="text-amber-400">{(shareDenominator > 0 ? ((Number(partnerContributions[p.id] || 0) / shareDenominator) * 100) : 0).toFixed(2)}%</b></div><label className="text-xs text-neutral-300">رصيد جاري الشريك (موجب له / سالب عليه)<input type="number" step="0.01" value={partnerCurrentBalances[p.id] || 0} onChange={e=>setPartnerCurrentBalances(x=>({...x,[p.id]:Number(e.target.value)}))} className="mt-1 w-full rounded-lg bg-surface-2 border border-neutral-700 p-2 text-white font-mono"/></label></div>)}</div>}
    <div className="border-t border-neutral-700 pt-4 space-y-3">
      <h4 className="text-sm text-white font-bold">جرد الأصول والالتزامات الحالية</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="text-xs text-neutral-300">نوع البند<select value={category} onChange={e=>setCategory(e.target.value as OpeningBalanceCategory)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white">{CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        <label className="text-xs text-neutral-300">البيان<input value={label} onChange={e=>setLabel(e.target.value)} placeholder="اسم البند أو ملاحظته" className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white"/></label>
        {category === 'inventory' ? <Field label="إجمالي تكلفة البضاعة بالجنيه" value={amount} onChange={setAmount}/> : category === 'bank' ? <label className="text-xs text-neutral-300">الحساب البنكي<select value={bankAccountId} onChange={e=>setBankAccountId(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white"><option value="">اختر حسابًا نشطًا</option>{bankAccounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}</select></label> : ['customer_receivable', 'supplier_payable'].includes(category) ? <div className="space-y-2"><label className="text-xs text-neutral-300">{category === 'customer_receivable' ? 'العميل' : 'المورد'}<select value={entityId} onChange={e=>setEntityId(e.target.value)} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white"><option value="">اختر الطرف</option>{(category === 'customer_receivable' ? customers : suppliers).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Field label="القيمة بالجنيه" value={amount} onChange={setAmount}/></div> : <Field label="القيمة بالجنيه" value={amount} onChange={setAmount}/>}
      </div>
      {category === 'inventory' && <div className="text-xs text-neutral-400">يتم تسجيل إجمالي تكلفة المخزون كبند واحد دون إدخال الأصناف أو كمياتها تفصيليًا.</div>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-neutral-500">{isLiability ? 'سيتم خصم هذا البند من صافي الأصول.' : isHistoricalExpense ? 'يسجل كمصروف تاريخي مستهلك ولا يدخل ضمن أصول أو مصروفات MALVIA التشغيلية.' : 'يُسجل ضمن الأصول الافتتاحية.'}</span><button type="button" onClick={addLine} className="rounded-lg bg-sky-600 text-white px-4 py-2 text-xs font-bold">إضافة بند للجرد</button></div>
    </div>
    {lines.length > 0 && <div className="overflow-x-auto"><table className="w-full text-xs text-right"><thead><tr className="text-neutral-400 border-b border-neutral-700"><th className="p-2">البند</th><th className="p-2">التصنيف</th><th className="p-2">القيمة</th><th className="p-2"></th></tr></thead><tbody>{lines.map(line=><tr key={line.id} className="border-b border-neutral-800"><td className="p-2 text-white">{line.label}</td><td className="p-2 text-neutral-400">{CATEGORIES.find(c=>c.value===line.category)?.label}</td><td className="p-2 font-mono">{money(line.amount)}</td><td className="p-2"><button type="button" onClick={()=>setLines(x=>x.filter(y=>y.id!==line.id))} className="text-rose-400">حذف</button></td></tr>)}</tbody></table></div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="إجمالي الأصول" value={preview.assets}/><Metric label="الالتزامات" value={preview.liabilities}/><Metric label="مصروفات تاريخية" value={preview.historicalExpenses}/><Metric label="صافي الأصول" value={preview.netAssets}/><Metric label="مساهمات الشركاء" value={preview.partnerCapital}/><Metric label="جاري شركاء (مستحق لهم)" value={preview.partnerCurrentAccountPayable}/><Metric label="جاري شركاء (مستحق عليهم)" value={preview.partnerCurrentAccountReceivable}/></div>
    <div className="rounded-xl border border-neutral-700 bg-surface-1 p-3"><label className="text-xs text-neutral-300">ملاحظات التسوية<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg bg-surface-2 border border-neutral-700 p-2 text-white"/></label><div className="text-xs text-amber-300 mt-2">فرق التسوية بعد احتساب رأس المال وجاري الشركاء: {money(preview.reconciliationDifference)} ج.م — {openingDifferenceLabel(preview.reconciliationDifference) === 'balanced' ? 'متوازن' : openingDifferenceLabel(preview.reconciliationDifference) === 'unexplained_surplus' ? 'فائض غير مفسر' : 'عجز غير مفسر'}. لن يُرحّل تلقائيًا كربح أو خسارة.</div><button type="button" onClick={approve} disabled={!cutoverDate || lines.length===0 || capital<0} className="mt-3 w-full rounded-xl bg-emerald-600 disabled:opacity-40 text-white p-3 font-bold">مراجعة واعتماد الأرصدة الافتتاحية</button></div>
  </section>;
};

const Field: React.FC<{label:string;value:number;onChange:(value:number)=>void}> = ({label,value,onChange}) => <label className="text-xs text-neutral-300">{label}<input type="number" min="0" value={value} onChange={e=>onChange(Number(e.target.value))} className="mt-1 w-full rounded-lg bg-surface-1 border border-neutral-700 p-2 text-white font-mono"/></label>;
const Metric: React.FC<{label:string;value:number}> = ({label,value}) => <div className="rounded-xl bg-surface-1 border border-neutral-700 p-3"><div className="text-xs text-neutral-400">{label}</div><div className="text-lg font-bold text-white font-mono mt-1">{money(value)} ج.م</div></div>;
