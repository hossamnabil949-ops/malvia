import React, { useMemo, useState } from 'react';
import { BarChart3, FileSpreadsheet, Download, Calendar } from 'lucide-react';
import { REPORT_DEFS, ReportColumn, ReportData, ReportTable, DateRange, Cell, reportToCsv } from '../utils/reportsLogic';
import { todayISO } from '../utils/dateRange';

interface ReportsHubProps {
  data: ReportData;
  /** شاشة التصدير الحالية (مصنف إكسيل الشامل) تظهر في تبويب منفصل */
  exportTab: React.ReactNode;
}

const fmt = (v: Cell | undefined, kind: ReportColumn['kind']): string => {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'string') return v;
  if (kind === 'money') return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (kind === 'percent') return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  return v.toLocaleString();
};

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function quickRanges(today: string): { id: string; label: string; range: DateRange }[] {
  const t = new Date(`${today}T00:00:00.000Z`);
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
  const prevEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = new Date(t.getTime() - 6 * 86_400_000);
  return [
    { id: 'today', label: 'اليوم', range: { from: today, to: today } },
    { id: 'week', label: 'آخر 7 أيام', range: { from: iso(week), to: today } },
    { id: 'month', label: 'هذا الشهر', range: { from: iso(monthStart), to: today } },
    { id: 'prev', label: 'الشهر الماضي', range: { from: iso(prevStart), to: iso(prevEnd) } },
    { id: 'year', label: 'هذه السنة', range: { from: iso(yearStart), to: today } },
    { id: 'all', label: 'كل الفترات', range: { from: '', to: '' } },
  ];
}

export const ReportsHub: React.FC<ReportsHubProps> = ({ data, exportTab }) => {
  const today = todayISO();
  const [mode, setMode] = useState<'analytics' | 'export'>('analytics');
  const [selectedId, setSelectedId] = useState(REPORT_DEFS[0].id);
  const [quick, setQuick] = useState('month');
  const [range, setRange] = useState<DateRange>(() => quickRanges(todayISO()).find((q) => q.id === 'month')!.range);

  const def = REPORT_DEFS.find((d) => d.id === selectedId) ?? REPORT_DEFS[0];
  const table: ReportTable = useMemo(() => def.build(data, range, today), [def, data, range, today]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof REPORT_DEFS>();
    for (const d of REPORT_DEFS) m.set(d.group, [...(m.get(d.group) ?? []), d]);
    return [...m.entries()];
  }, []);

  const exportCsv = () => {
    const csv = reportToCsv(table);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.title}${def.usesRange ? `_${range.from || 'من-البداية'}_${range.to || 'إلى-اليوم'}` : `_${today}`}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-black text-white">التقارير</h2>
        </div>
        <div className="flex gap-2">
          {([['analytics', 'التقارير التحليلية', BarChart3], ['export', 'تصدير إكسيل الشامل', FileSpreadsheet]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`px-3 h-9 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${mode === id ? 'bg-amber-500 text-black border-amber-500' : 'bg-surface-1 text-neutral-300 border-neutral-700 hover:border-neutral-500'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'export' && exportTab}

      {mode === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <aside className="lg:col-span-3 space-y-3">
            {groups.map(([group, defs]) => (
              <div key={group} className="rounded-2xl bg-surface-1 border border-neutral-800 overflow-hidden">
                <div className="px-3 py-2 text-[11px] font-black text-amber-400 border-b border-neutral-800">{group}</div>
                <div className="p-1.5 flex lg:flex-col gap-1 flex-wrap">
                  {defs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      className={`text-right px-3 py-2 rounded-xl text-xs font-bold transition-colors ${selectedId === d.id ? 'bg-amber-500/20 text-amber-200' : 'text-neutral-300 hover:bg-white/5'}`}
                    >
                      {d.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <section className="lg:col-span-9 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-white flex-1 min-w-[200px]">{table.title}</h3>
              <button type="button" onClick={exportCsv} className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5">
                <Download className="w-4 h-4" /> تصدير CSV
              </button>
            </div>

            {def.usesRange ? (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-surface-1 border border-neutral-800">
                <Calendar className="w-4 h-4 text-amber-400" />
                {quickRanges(today).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => { setQuick(q.id); setRange(q.range); }}
                    className={`px-3 h-8 rounded-xl text-[11px] font-bold border ${quick === q.id ? 'bg-neutral-200 text-black border-neutral-200' : 'bg-surface-2 text-neutral-300 border-neutral-700'}`}
                  >
                    {q.label}
                  </button>
                ))}
                <span className="text-[11px] text-neutral-500 mx-1">أو:</span>
                <input type="date" value={range.from} onChange={(e) => { setQuick('custom'); setRange((r) => ({ ...r, from: e.target.value })); }} className="h-8 px-2 rounded-lg bg-surface-2 border border-neutral-700 text-xs text-white" aria-label="من تاريخ" />
                <input type="date" value={range.to} onChange={(e) => { setQuick('custom'); setRange((r) => ({ ...r, to: e.target.value })); }} className="h-8 px-2 rounded-lg bg-surface-2 border border-neutral-700 text-xs text-white" aria-label="إلى تاريخ" />
              </div>
            ) : (
              <div className="text-[11px] text-neutral-500 px-1">هذا التقرير يعرض الوضع الحالي حتى اليوم ولا يتأثر بالفترة الزمنية.</div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="w-full text-xs">
                <thead className="bg-surface-1 text-neutral-400">
                  <tr>
                    {table.columns.map((c) => (
                      <th key={c.key} className={`p-2.5 whitespace-nowrap ${c.kind && c.kind !== 'text' && c.kind !== 'date' ? 'text-center' : 'text-right'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-t border-neutral-800 hover:bg-white/[0.02]">
                      {table.columns.map((c) => (
                        <td key={c.key} className={`p-2.5 ${c.kind === 'money' || c.kind === 'int' || c.kind === 'percent' ? 'text-center font-mono text-white' : 'text-neutral-200'}`}>{fmt(row[c.key], c.kind)}</td>
                      ))}
                    </tr>
                  ))}
                  {table.rows.length === 0 && (
                    <tr><td colSpan={table.columns.length} className="p-10 text-center text-neutral-500">لا توجد بيانات في هذه الفترة</td></tr>
                  )}
                </tbody>
                {table.totals && table.rows.length > 0 && (
                  <tfoot className="bg-surface-1 border-t-2 border-amber-500/40">
                    <tr>
                      {table.columns.map((c) => (
                        <td key={c.key} className={`p-2.5 font-black ${c.kind === 'money' || c.kind === 'int' || c.kind === 'percent' ? 'text-center font-mono text-amber-300' : 'text-amber-300'}`}>{fmt(table.totals![c.key], c.kind)}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {table.note && <p className="text-[11px] text-neutral-500">{table.note}</p>}
          </section>
        </div>
      )}
    </div>
  );
};
