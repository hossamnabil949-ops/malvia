import React, { useMemo, useState } from 'react';
import { Banknote, CreditCard, Zap, Smartphone, FileSpreadsheet, ArrowDownLeft, ArrowUpRight, Layers, Wallet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { TreasuryTransaction } from '../types/autoParts';
import { DateRangeFilter } from './DateRangeFilter';
import { DateRange, EMPTY_DATE_RANGE, inDateRange, todayISO } from '../utils/dateRange';
import { TREASURY_ACCOUNTS, TreasuryAccountKey, accountOf, summarizeTreasury } from '../utils/treasuryAccounts';

const ICONS: Record<TreasuryAccountKey, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  instapay: Zap,
  visa: CreditCard,
  wallet: Smartphone,
};

const fmt = (n: number) => n.toLocaleString('ar-EG', { maximumFractionDigits: 2 });

interface TreasuryAccountsReportProps {
  transactions: TreasuryTransaction[];
}

/** تقارير الخزنة: تقرير مستقل لكل حساب (كاش / إنستاباي / فيزا / محافظ) + تقرير مجمع. */
export const TreasuryAccountsReport: React.FC<TreasuryAccountsReportProps> = ({ transactions }) => {
  const [selected, setSelected] = useState<'all' | TreasuryAccountKey>('all');
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);

  const summary = useMemo(() => summarizeTreasury(transactions, range), [transactions, range]);

  const rows = useMemo(() => {
    return transactions
      .filter((tx) => inDateRange(tx.date, range))
      .filter((tx) => selected === 'all' || accountOf(tx.paymentMethod) === selected)
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  }, [transactions, range, selected]);

  const shown = useMemo(() => {
    if (selected === 'all') return summary.total;
    const a = summary.accounts.find((x) => x.key === selected)!;
    return { income: a.income, expense: a.expense, balance: a.balance, count: a.count };
  }, [summary, selected]);

  const toRow = (tx: TreasuryTransaction) => ({
    'التاريخ': tx.date,
    'الوقت': tx.time,
    'رقم الحركة': tx.txNumber,
    'الحساب': TREASURY_ACCOUNTS.find((a) => a.key === accountOf(tx.paymentMethod))?.shortLabel || '',
    'طريقة الدفع': tx.paymentMethod,
    'النوع': tx.type,
    'البند': tx.category,
    'البيان': tx.description,
    'قبض': tx.type === 'قبض' ? tx.amount : 0,
    'صرف': tx.type === 'صرف' ? tx.amount : 0,
  });

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const filtered = transactions.filter((tx) => inDateRange(tx.date, range));
    if (selected === 'all') {
      const summaryRows = summary.accounts.map((a) => ({
        'الحساب': TREASURY_ACCOUNTS.find((x) => x.key === a.key)!.label,
        'إجمالي القبض': a.income,
        'إجمالي الصرف': a.expense,
        'الصافي': a.balance,
        'عدد الحركات': a.count,
      }));
      summaryRows.push({ 'الحساب': 'الإجمالي المجمع', 'إجمالي القبض': summary.total.income, 'إجمالي الصرف': summary.total.expense, 'الصافي': summary.total.balance, 'عدد الحركات': summary.total.count });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'التقرير المجمع');
      TREASURY_ACCOUNTS.forEach((acc) => {
        const data = filtered.filter((tx) => accountOf(tx.paymentMethod) === acc.key).map(toRow);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ 'لا توجد حركات': '' }]), acc.shortLabel);
      });
    } else {
      const acc = TREASURY_ACCOUNTS.find((a) => a.key === selected)!;
      const data = filtered.filter((tx) => accountOf(tx.paymentMethod) === selected).map(toRow);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ 'لا توجد حركات': '' }]), acc.shortLabel);
    }
    const name = selected === 'all' ? 'الخزنة_مجمع' : `الخزنة_${TREASURY_ACCOUNTS.find((a) => a.key === selected)!.shortLabel}`;
    XLSX.writeFile(wb, `MALVIA_${name}_${todayISO()}.xlsx`);
  };

  return (
    <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-400" />
            <span>تقارير الخزنة حسب الحساب</span>
          </h4>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            كل حساب (كاش، إنستاباي، فيزا، محافظ) له تقريره المستقل، مع تقرير مجمع لكل الحسابات.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <button
            type="button"
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 h-11 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-500 text-neutral-200 hover:text-emerald-400 text-xs font-bold transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>تصدير إكسيل</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setSelected('all')}
          className={`text-right p-3.5 rounded-2xl border transition-all ${
            selected === 'all' ? 'bg-amber-500/15 border-amber-400' : 'bg-surface-1 border-neutral-800 hover:border-neutral-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <Layers className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono text-neutral-500">{summary.total.count} حركة</span>
          </div>
          <span className="text-xs font-bold text-neutral-300 block mt-2">تقرير مجمع (كل الحسابات)</span>
          <span className="text-lg font-black font-mono text-amber-400 block">{fmt(summary.total.balance)} ج.م</span>
        </button>

        {summary.accounts.map((a) => {
          const meta = TREASURY_ACCOUNTS.find((x) => x.key === a.key)!;
          const Icon = ICONS[a.key];
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setSelected(a.key)}
              className={`text-right p-3.5 rounded-2xl border transition-all ${
                selected === a.key ? 'bg-surface-3 border-amber-400' : 'bg-surface-1 border-neutral-800 hover:border-neutral-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-mono text-neutral-500">{a.count} حركة</span>
              </div>
              <span className="text-xs font-bold text-neutral-300 block mt-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: meta.color }} />
                {meta.shortLabel}
              </span>
              <span className={`text-lg font-black font-mono block ${a.balance < 0 ? 'text-rose-400' : 'text-white'}`}>
                {fmt(a.balance)} ج.م
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-2xl bg-surface-1 border border-emerald-500/20">
          <span className="text-neutral-400 flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />إجمالي القبض</span>
          <strong className="text-emerald-400 font-mono text-base block mt-1">{fmt(shown.income)}</strong>
        </div>
        <div className="p-3 rounded-2xl bg-surface-1 border border-rose-500/20">
          <span className="text-neutral-400 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />إجمالي الصرف</span>
          <strong className="text-rose-400 font-mono text-base block mt-1">{fmt(shown.expense)}</strong>
        </div>
        <div className="p-3 rounded-2xl bg-surface-1 border border-amber-500/20">
          <span className="text-neutral-400">الصافي</span>
          <strong className={`font-mono text-base block mt-1 ${shown.balance < 0 ? 'text-rose-400' : 'text-amber-400'}`}>{fmt(shown.balance)}</strong>
        </div>
      </div>

      {selected === 'all' && (
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-right text-xs text-neutral-300">
            <thead className="bg-surface-1 text-neutral-400 text-[11px]">
              <tr>
                <th className="p-2.5">الحساب</th>
                <th className="p-2.5">قبض</th>
                <th className="p-2.5">صرف</th>
                <th className="p-2.5">الصافي</th>
                <th className="p-2.5">الحركات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {summary.accounts.map((a) => (
                <tr key={a.key} className="hover:bg-surface-3 cursor-pointer" onClick={() => setSelected(a.key)}>
                  <td className="p-2.5 font-bold text-white">{TREASURY_ACCOUNTS.find((x) => x.key === a.key)!.label}</td>
                  <td className="p-2.5 font-mono text-emerald-400">{fmt(a.income)}</td>
                  <td className="p-2.5 font-mono text-rose-400">{fmt(a.expense)}</td>
                  <td className={`p-2.5 font-mono font-bold ${a.balance < 0 ? 'text-rose-400' : 'text-white'}`}>{fmt(a.balance)}</td>
                  <td className="p-2.5 font-mono">{a.count}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-1 font-black">
              <tr>
                <td className="p-2.5 text-white">الإجمالي المجمع</td>
                <td className="p-2.5 font-mono text-emerald-400">{fmt(summary.total.income)}</td>
                <td className="p-2.5 font-mono text-rose-400">{fmt(summary.total.expense)}</td>
                <td className="p-2.5 font-mono text-amber-400">{fmt(summary.total.balance)}</td>
                <td className="p-2.5 font-mono">{summary.total.count}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="overflow-x-auto border border-neutral-800 rounded-2xl max-h-96 overflow-y-auto">
        <table className="w-full text-right text-xs text-neutral-300">
          <thead className="bg-surface-1 text-neutral-400 text-[11px] sticky top-0">
            <tr>
              <th className="p-2.5">التاريخ</th>
              <th className="p-2.5">البند</th>
              <th className="p-2.5">البيان</th>
              {selected === 'all' && <th className="p-2.5">الحساب</th>}
              <th className="p-2.5">قبض</th>
              <th className="p-2.5">صرف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={selected === 'all' ? 6 : 5} className="p-6 text-center text-neutral-500">لا توجد حركات في هذا الحساب / الفترة</td>
              </tr>
            ) : (
              rows.map((tx) => (
                <tr key={tx.id} className="hover:bg-surface-3">
                  <td className="p-2.5 font-mono text-neutral-400 whitespace-nowrap">{tx.date} {tx.time}</td>
                  <td className="p-2.5 whitespace-nowrap">{tx.category}</td>
                  <td className="p-2.5 min-w-48">{tx.description}</td>
                  {selected === 'all' && (
                    <td className="p-2.5 whitespace-nowrap">{TREASURY_ACCOUNTS.find((a) => a.key === accountOf(tx.paymentMethod))?.shortLabel}</td>
                  )}
                  <td className="p-2.5 font-mono text-emerald-400">{tx.type === 'قبض' ? fmt(tx.amount) : ''}</td>
                  <td className="p-2.5 font-mono text-rose-400">{tx.type === 'صرف' ? fmt(tx.amount) : ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** ملخص مصغر لأرصدة الحسابات للداشبورد. */
export const TreasuryAccountsWidget: React.FC<{
  transactions: TreasuryTransaction[];
  onOpenReports?: () => void;
}> = ({ transactions, onOpenReports }) => {
  const summary = useMemo(() => summarizeTreasury(transactions), [transactions]);
  return (
    <div className="p-5 rounded-2xl bg-surface-2 border border-neutral-800 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-amber-400" />
          <span>أرصدة الخزنة حسب الحساب</span>
        </h3>
        {onOpenReports && (
          <button type="button" onClick={onOpenReports} className="text-[11px] font-bold text-amber-400 hover:underline">
            التقارير التفصيلية ←
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-[11px] text-neutral-300 font-bold block">المجمع (كل الحسابات)</span>
          <span className="text-lg font-black font-mono text-amber-400 block mt-1">{fmt(summary.total.balance)} ج.م</span>
        </div>
        {summary.accounts.map((a) => {
          const meta = TREASURY_ACCOUNTS.find((x) => x.key === a.key)!;
          const Icon = ICONS[a.key];
          return (
            <button
              key={a.key}
              type="button"
              onClick={onOpenReports}
              className="text-right p-3 rounded-2xl bg-surface-1 border border-neutral-800 hover:border-neutral-600 transition-colors"
            >
              <span className="text-[11px] text-neutral-300 font-bold flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {meta.shortLabel}
              </span>
              <span className={`text-lg font-black font-mono block mt-1 ${a.balance < 0 ? 'text-rose-400' : 'text-white'}`}>
                {fmt(a.balance)} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">قبض {fmt(a.income)} · صرف {fmt(a.expense)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
