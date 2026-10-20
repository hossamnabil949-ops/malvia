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
import { AutoPart, Invoice } from '../types/autoParts';

interface SalesPoint {
  label: string;
  sales: number;
  profit: number;
  volume: number;
}

interface SalesChartsProps {
  invoices?: Invoice[];
  parts?: AutoPart[];
  currency?: string;
}

export const SalesCharts: React.FC<SalesChartsProps> = ({
  invoices = [],
  parts = [],
  currency = 'ج.م',
}) => {
  const [timeframe, setTimeframe] = useState<'daily' | 'monthly'>('daily');

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    parts.forEach(p => {
      map.set(p.partNumber.toLowerCase(), p.costPrice);
      map.set(p.name.toLowerCase(), p.costPrice);
    });
    return map;
  }, [parts]);

  const dailyData: SalesPoint[] = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayInvoices = invoices.filter(inv => inv.date === todayStr);

    const hourSlots = [
      { key: '08', label: '08:00 ص' },
      { key: '10', label: '10:00 ص' },
      { key: '12', label: '12:00 م' },
      { key: '14', label: '02:00 م' },
      { key: '16', label: '04:00 م' },
      { key: '18', label: '06:00 م' },
      { key: '20', label: '08:00 م' },
      { key: '22', label: '10:00 م' },
    ];

    if (invoices.length === 0) {
      return hourSlots.map(h => ({ label: h.label, sales: 0, profit: 0, volume: 0 }));
    }

    return hourSlots.map(slot => {
      let sales = 0;
      let profit = 0;
      let volume = 0;

      todayInvoices.forEach(inv => {
        sales += inv.grandTotal / hourSlots.length;
        inv.items.forEach(it => {
          volume += it.quantity / hourSlots.length;
          const cost = costMap.get(it.partNumber.toLowerCase()) ?? (it.unitPrice * 0.7);
          profit += (it.unitPrice - cost) * (it.quantity / hourSlots.length);
        });
      });

      return {
        label: slot.label,
        sales: Math.round(sales),
        profit: Math.round(profit),
        volume: Math.round(volume),
      };
    });
  }, [invoices, costMap]);

  const monthlyData: SalesPoint[] = useMemo(() => {
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    if (invoices.length === 0) {
      return months.slice(0, 6).map(m => ({ label: m, sales: 0, profit: 0, volume: 0 }));
    }

    const currentMonthIdx = new Date().getMonth();
    const monthMap = new Map<number, { sales: number; profit: number; volume: number }>();
    for (let i = 0; i <= currentMonthIdx; i++) {
      monthMap.set(i, { sales: 0, profit: 0, volume: 0 });
    }

    invoices.forEach(inv => {
      const d = new Date(inv.date);
      if (!isNaN(d.getTime())) {
        const mIdx = d.getMonth();
        const existing = monthMap.get(mIdx) || { sales: 0, profit: 0, volume: 0 };
        existing.sales += inv.grandTotal;
        inv.items.forEach(it => {
          existing.volume += it.quantity;
          const cost = costMap.get(it.partNumber.toLowerCase()) ?? (it.unitPrice * 0.7);
          existing.profit += (it.unitPrice - cost) * it.quantity;
        });
        monthMap.set(mIdx, existing);
      }
    });

    const result: SalesPoint[] = [];
    monthMap.forEach((val, mIdx) => {
      result.push({
        label: months[mIdx] || `شهر ${mIdx + 1}`,
        sales: Math.round(val.sales),
        profit: Math.round(val.profit),
        volume: Math.round(val.volume),
      });
    });

    return result.length > 0 ? result : [{ label: 'الشهر الحالي', sales: 0, profit: 0, volume: 0 }];
  }, [invoices, costMap]);

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
