import React, { useMemo, useState } from 'react';
import { buildFinancialStatements, closeAccountingPeriod } from '../utils/accountingCore';
import type { AccountingContext, AccountingPeriod, JournalEntry, LedgerAccount } from '../utils/accountingCore';

interface Props {
  context: AccountingContext;
  accounts: LedgerAccount[];
  periods: AccountingPeriod[];
  entries: JournalEntry[];
  currentUserName: string;
  canManage: boolean;
  onSave: (updates: { periods?: AccountingPeriod[] }) => boolean;
}
const money = (value: number) => value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export const AccountingStatementsPanel: React.FC<Props> = ({
  context, accounts, periods, entries, currentUserName, canManage, onSave,
}) => {
  const [from, setFrom] = useState(today().slice(0, 4) + '-01-01');
  const [to, setTo] = useState(today());
  const [periodId, setPeriodId] = useState('');
  const [notice, setNotice] = useState('');
  const selectedPeriod = periods.find(period => period.id === periodId) || periods.find(period => period.status === 'open');
  const statements = useMemo(
    () => buildFinancialStatements(accounts, entries, context, from, to),
    [accounts, entries, context.tenantId, context.branchId, context.currency, from, to],
  );
  const closeSelectedPeriod = () => {
    if (!selectedPeriod || !canManage) return;
    const result = closeAccountingPeriod(selectedPeriod.id, new Date().toISOString(), currentUserName, periods, entries);
    if (result.error || !result.period) {
      setNotice('تعذر إقفال الفترة: ' + (result.error || 'UNKNOWN'));
      return;
    }
    const next = periods.map(period => period.id === result.period?.id ? result.period as AccountingPeriod : period);
    setNotice(onSave({ periods: next }) ? 'تم إقفال الفترة بعد فحص توازن قيودها.' : 'فشل حفظ حالة الإقفال.');
  };
  const renderLines = (rows: { accountId: string; code: string; name: string; amount: number }[]) =>
    rows.map(row => <div key={row.accountId} className="flex justify-between gap-3 text-xs text-slate-400"><span>{row.code} — {row.name}</span><span>{money(row.amount)}</span></div>);

  return <section className="space-y-3 text-right" dir="rtl">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-300">من<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" /></label>
        <label className="text-xs text-slate-300">إلى<input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {periods.length > 0 && <select value={selectedPeriod?.id || ''} onChange={event => setPeriodId(event.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-sm text-white">{periods.map(period => <option key={period.id} value={period.id}>{period.name} — {period.status === 'open' ? 'مفتوحة' : 'مغلقة'}</option>)}</select>}
        {selectedPeriod?.status === 'open' && selectedPeriod.endDate <= today() && canManage && <button onClick={closeSelectedPeriod} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white">إقفال الفترة</button>}
      </div>
    </div>
    {notice && <div role="status" className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm text-slate-200">{notice}</div>}
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <details open className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <summary className="cursor-pointer font-bold text-white">قائمة الدخل</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-200">
          <div className="flex justify-between"><span>الإيرادات</span><strong>{money(statements.income.totalRevenue)} ج.م</strong></div>
          {renderLines(statements.income.revenueLines)}
          <div className="flex justify-between"><span>المصروفات</span><strong>{money(statements.income.totalExpenses)} ج.م</strong></div>
          {renderLines(statements.income.expenseLines)}
          <div className="flex justify-between border-t border-slate-700 pt-2 font-bold"><span>صافي الربح / الخسارة</span><strong className={statements.income.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{money(statements.income.netIncome)} ج.م</strong></div>
        </div>
      </details>
      <details open className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <summary className="cursor-pointer font-bold text-white">الميزانية العمومية</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-200">
          <div className="font-semibold">الأصول: {money(statements.balance.totalAssets)} ج.م</div>
          {renderLines(statements.balance.assetLines)}
          <div className="font-semibold">الالتزامات: {money(statements.balance.totalLiabilities)} ج.م</div>
          {renderLines(statements.balance.liabilityLines)}
          <div className="font-semibold">حقوق الملكية: {money(statements.balance.totalEquity + statements.balance.currentPeriodEarnings)} ج.م</div>
          {renderLines(statements.balance.equityLines)}
          <div className="flex justify-between text-xs"><span>الأرباح المتراكمة غير المقفلة</span><span>{money(statements.balance.currentPeriodEarnings)}</span></div>
          <div className="flex justify-between border-t border-slate-700 pt-2 font-bold"><span>فرق الميزانية</span><strong className={Math.abs(statements.balance.difference) < 0.005 ? 'text-emerald-400' : 'text-rose-400'}>{money(statements.balance.difference)} ج.م</strong></div>
        </div>
      </details>
      <details open className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <summary className="cursor-pointer font-bold text-white">التدفقات النقدية</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-200">
          <div className="flex justify-between"><span>رصيد أول الفترة</span><strong>{money(statements.cashFlow.openingCash)}</strong></div>
          <div className="flex justify-between"><span>تشغيلية</span><strong>{money(statements.cashFlow.operating)}</strong></div>
          <div className="flex justify-between"><span>استثمارية مصنفة</span><strong>{money(statements.cashFlow.investing)}</strong></div>
          <div className="flex justify-between"><span>تمويلية</span><strong>{money(statements.cashFlow.financing)}</strong></div>
          <div className="flex justify-between"><span>غير مصنفة</span><strong>{money(statements.cashFlow.unclassified)}</strong></div>
          <div className="flex justify-between border-t border-slate-700 pt-2 font-bold"><span>رصيد آخر الفترة</span><strong>{money(statements.cashFlow.closingCash)} ج.م</strong></div>
        </div>
      </details>
    </div>
    <p className="text-xs text-amber-300">القوائم مبنية على القيود المرحلة فقط. التدفقات غير المصنفة تظهر منفصلة ولا يتم توزيعها تخمينياً. الأرصدة التاريخية لا تدخل إلا من خلال قيود افتتاحية مطابقة.</p>
  </section>;
};
