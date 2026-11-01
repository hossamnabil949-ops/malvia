import React, { useState, useMemo } from 'react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  Calendar,
  Percent,
  CheckCircle2,
  FileQuestion
} from 'lucide-react';
import { AutoPart, Invoice, SalesReturn } from '../types/autoParts';
import { ReportData, reportDailySales, reportSalesByItem, netSales } from '../utils/reportsLogic';

interface SalesPoint {
  label: string;
  sales: number;
  profit: number;
  volume: number;
}

interface SalesChartsProps {
  invoices?: Invoice[];
  parts?: AutoPart[];
  salesReturns?: SalesReturn[];
  currency?: string;
}

export const SalesCharts: React.FC<SalesChartsProps> = ({
  invoices = [],
  parts = [],
  salesReturns = [],
  currency = 'ج.م',
}) => {
  const [timeframe, setTimeframe] = useState<'daily' | 'monthly'>('daily');

  const reportData = useMemo(() => ({
    invoices, salesReturns, parts, purchaseInvoices: [], customers: [], suppliers: [],
    expenses: [], treasury: [], cheques: [], batches: [], loyaltyLedger: [], loyaltyPointValue: 0,
  } as unknown as ReportData), [invoices, salesReturns, parts]);

  const parseInvoiceHour = (value: string): number | null => {
    const normalized = String(value || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
    const match = normalized.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    let hour = Number(match[1]);
    const isPM = /م|مساء|PM/i.test(normalized);
    const isAM = /ص|صباح|AM/i.test(normalized);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    return hour >= 0 && hour <= 23 ? hour : null;
  };

  const dailyData: SalesPoint[] = useMemo(() => {
    const localNow = new Date();
    const todayStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, sales: 0, profit: 0, volume: 0 }));
    const unknown = { hour: -1, label: 'وقت غير محدد', sales: 0, profit: 0, volume: 0 };
    const todayInvoices = invoices.filter(inv => inv.status !== 'ملغاة' && inv.date.slice(0, 10) === todayStr);
    const dailyReport = reportDailySales(reportData, { from: todayStr, to: todayStr });
    const reportTotal = Number(dailyReport.totals?.net) || 0;
    todayInvoices.forEach(inv => {
      const hour = parseInvoiceHour(inv.time);
      const bucket = hour === null ? unknown : hours[hour];
      bucket.sales += netSales(inv);
      const oneInvoiceData = { ...reportData, invoices: [inv], salesReturns: salesReturns.filter(ret => ret.invoiceId === inv.id) } as ReportData;
      const itemReport = reportSalesByItem(oneInvoiceData, { from: todayStr, to: todayStr });
      bucket.profit += Number(itemReport.totals?.profit) || 0;
      bucket.volume += inv.items.reduce((n, item) => n + Math.max(0, item.quantity - (item.returnedQuantity || 0)), 0);
    });
    // الفواتير ذات الوقت غير القابل للتحليل لا تُوزع تخمينياً؛ أي فرق مع التقرير يظهر كبند مستقل.
    const assignedSales = hours.reduce((total, hour) => total + hour.sales, 0) + unknown.sales;
    const reconciliationGap = reportTotal - assignedSales;
    if (Math.abs(reconciliationGap) >= 0.01) {
      unknown.sales += reconciliationGap;
      unknown.label = 'فرق غير موزع';
    }
    const points = hours.map(({ label, sales, profit, volume }) => ({
      label, sales: Math.round(sales), profit: Math.round(profit), volume: Math.round(volume),
    }));
    if (unknown.sales > 0 || unknown.volume > 0) points.push({ label: unknown.label, sales: Math.round(unknown.sales), profit: Math.round(unknown.profit), volume: Math.round(unknown.volume) });
    // نعرض الساعات الفعلية فقط، ونضيف الوقت غير المحدد كبند مستقل دون توزيع تقديري.
    return points;
  }, [invoices, reportData, salesReturns]);

  const monthlyData: SalesPoint[] = useMemo(() => {
    const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const now = new Date();
    const year = now.getFullYear();
    return Array.from({ length: now.getMonth() + 1 }, (_, monthIndex) => {
      const from = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthIndex + 1, 0).getDate();
      const to = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const daily = reportDailySales(reportData, { from, to });
      const items = reportSalesByItem(reportData, { from, to });
      return {
        label: `${monthNames[monthIndex]} ${year}`,
        sales: Math.round(Number(daily.totals?.net) || 0),
        profit: Math.round(Number(items.totals?.profit) || 0),
        volume: Math.round(Number(items.totals?.qty) || 0),
      };
    });
  }, [reportData]);

  const activeData: SalesPoint[] = timeframe === 'daily' ? dailyData : monthlyData;

  const totalPeriodSales = useMemo(() => activeData.reduce((acc, curr) => acc + curr.sales, 0), [activeData]);
  const totalPeriodProfit = useMemo(() => activeData.reduce((acc, curr) => acc + curr.profit, 0), [activeData]);
  const totalPeriodVolume = useMemo(() => activeData.reduce((acc, curr) => acc + curr.volume, 0), [activeData]);
  const totalPeriodCost = totalPeriodSales - totalPeriodProfit;
  // نسبة الربح تُحسب على أساس التكلفة وليس سعر البيع
  const profitMargin = totalPeriodCost > 0 ? ((totalPeriodProfit / totalPeriodCost) * 100).toFixed(1) : '0';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 rounded-xl bg-surface-1 border border-neutral-700 shadow-2xl text-xs space-y-1.5 min-w-[170px]">
          <p className="font-bold text-white border-b border-neutral-800 pb-1">{label}</p>
          <div className="flex justify-between items-center text-amber-400">
            <span>إجمالي المبيعات:</span>
            <span className="font-mono font-bold">{payload[0]?.value?.toLocaleString()} {currency}</span>
          </div>
          <div className="flex justify-between items-center text-emerald-400">
            <span>صافي الأرباح:</span>
            <span className="font-mono font-bold">{payload[1]?.value?.toLocaleString()} {currency}</span>
          </div>
          {payload[0]?.payload?.volume !== undefined && (
            <div className="flex justify-between items-center text-neutral-400 text-[11px] pt-1 border-t border-neutral-800">
              <span>حجم المبيعات:</span>
              <span className="font-mono">{payload[0].payload.volume} قطعة</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
              <TrendingUp className="w-4 h-4" />
              <span>تحليلات المبيعات ونمو الأرباح اللحظية</span>
            </div>
            <h3 className="text-base font-black text-white">
              رسم بياني لتصور حجم المبيعات والأرباح
            </h3>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-1 border border-neutral-800 self-start sm:self-auto">
            <button
              onClick={() => setTimeframe('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timeframe === 'daily'
                  ? 'bg-amber-500 text-neutral-950 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              مبيعات اليوم (ساعات)
            </button>
            <button
              onClick={() => setTimeframe('monthly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timeframe === 'monthly'
                  ? 'bg-amber-500 text-neutral-950 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              المبيعات الشهرية
            </button>
          </div>
        </div>

        {invoices.length === 0 && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileQuestion className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <span>لا توجد مبيعات مسجلة حتى الآن في قاعدة البيانات — تم تصفير كافة المؤشرات بنجاح وبانتظار أول فاتورة POS.</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-800/80">
            <span className="text-neutral-400 text-[11px] block">
              {timeframe === 'daily' ? 'مبيعات اليوم المسجلة' : 'إجمالي المبيعات المحققة'}
            </span>
            <span className="text-base font-black text-amber-400 font-mono mt-0.5 block">
              {totalPeriodSales.toLocaleString()} {currency}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-800/80">
            <span className="text-neutral-400 text-[11px] block">صافي الأرباح المحسوبة</span>
            <span className="text-base font-black text-emerald-400 font-mono mt-0.5 block">
              {totalPeriodProfit.toLocaleString()} {currency}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-800/80">
            <span className="text-neutral-400 text-[11px] block">متوسط هامش الربح</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base font-black text-white font-mono">
                %{profitMargin}
              </span>
              {totalPeriodSales > 0 && (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded">
                  نشط ✓
                </span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-800/80">
            <span className="text-neutral-400 text-[11px] block">قطع الغيار المباعة</span>
            <span className="text-base font-black text-amber-400 font-mono mt-0.5 block">
              {totalPeriodVolume.toLocaleString()} قطعة
            </span>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-amber-500)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-amber-500)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-800)" vertical={false} />
              <XAxis 
                dataKey="label" 
                stroke="var(--color-neutral-500)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false} 
              />
              <YAxis 
                stroke="var(--color-neutral-500)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                formatter={(value) => (value === 'sales' ? `حجم المبيعات (${currency})` : `صافي الأرباح (${currency})`)}
              />
              <Area 
                type="monotone" 
                dataKey="sales" 
                stroke="var(--color-amber-500)" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#salesGrad)" 
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke="#10b981" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#profitGrad)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
