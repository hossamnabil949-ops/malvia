import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Phone, 
  DollarSign, 
  Wrench, 
  X, 
  Check, 
  Award, 
  Crown, 
  TrendingUp, 
  BarChart3,
  PieChart as PieIcon,
  Medal,
  Calendar
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie, 
  Legend 
} from 'recharts';
import { Customer } from '../types/autoParts';

interface CustomersViewProps {
  customers: Customer[];
  onAddCustomer: (customer: Customer) => void;
  onSettleBalance: (customerId: string, amount: number) => void;
}

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  onAddCustomer,
  onSettleBalance,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [settleModalCustomer, setSettleModalCustomer] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(500);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<'ورشة فنية' | 'عميل تجزئة' | 'أسطول شركات'>('ورشة فنية');

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    onAddCustomer({
      id: `c-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      type,
      balance: 0,
      totalPurchases: 0,
      monthlyPurchases: 0,
      invoicesCount: 0,
      lastVisit: 'اليوم',
    });

    setName('');
    setPhone('');
    setShowAddModal(false);
  };

  const handleConfirmSettle = () => {
    if (settleModalCustomer && settleAmount > 0) {
      onSettleBalance(settleModalCustomer.id, settleAmount);
      setSettleModalCustomer(null);
    }
  };

  const totalOutstandingCredit = customers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);

  const top5Customers = [...customers]
    .sort((a, b) => (b.monthlyPurchases || 0) - (a.monthlyPurchases || 0))
    .slice(0, 5)
    .map((c, index) => ({
      rank: index + 1,
      id: c.id,
      name: c.name,
      shortName: c.name.length > 18 ? c.name.slice(0, 16) + '...' : c.name,
      type: c.type,
      amount: c.monthlyPurchases || 0,
      invoices: c.invoicesCount || Math.max(1, Math.round((c.monthlyPurchases || 0) / 1350)),
      phone: c.phone,
      balance: c.balance,
    }));

  const totalTop5MonthlySpend = top5Customers.reduce((acc, c) => acc + c.amount, 0);

  const pieData = top5Customers.map((c) => ({
    name: c.name,
    value: c.amount,
  }));

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalTop5MonthlySpend > 0 
        ? ((data.amount / totalTop5MonthlySpend) * 100).toFixed(1)
        : '0';

      return (
        <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-700 shadow-2xl text-xs space-y-1.5 min-w-[200px]">
          <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-1">
            <span className="w-5 h-5 rounded-full bg-amber-500 text-neutral-950 font-bold flex items-center justify-center text-[10px]">
              #{data.rank}
            </span>
            <p className="font-bold text-white truncate max-w-[170px]">{data.name}</p>
          </div>
          <div className="flex justify-between items-center text-amber-400">
            <span>مشتريات هذا الشهر:</span>
            <span className="font-mono font-bold">{data.amount.toLocaleString()} ج.م</span>
          </div>
          <div className="flex justify-between items-center text-neutral-300 text-[11px]">
            <span>عدد الفواتير المسجلة:</span>
            <span className="font-mono">{data.invoices} فاتورة</span>
          </div>
          <div className="flex justify-between items-center text-emerald-400 text-[11px] pt-1 border-t border-neutral-800">
            <span>الحصة من كبار العملاء:</span>
            <span className="font-mono">%{percentage}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = totalTop5MonthlySpend > 0 
        ? ((data.value / totalTop5MonthlySpend) * 100).toFixed(1) 
        : '0';

      return (
        <div className="p-2.5 rounded-xl bg-surface-1 border border-neutral-700 shadow-xl text-xs space-y-1">
          <p className="font-bold text-white">{data.name}</p>
          <div className="flex items-center gap-2 text-amber-400 font-mono">
            <span>{Number(data.value).toLocaleString()} ج.م</span>
            <span className="text-neutral-400">({percentage}%)</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase mb-1">
            <Wrench className="w-4 h-4" />
            <span>الورش والعملاء والحسابات الآجلة</span>
          </div>
          <h2 className="text-xl font-black text-white">إدارة حسابات الورش الفنية والعملاء</h2>
          <div className="flex items-center gap-4 text-xs text-neutral-400 mt-1">
            <span>إجمالي الورش والعملاء: <strong className="text-white font-mono">{customers.length}</strong></span>
            <span>·</span>
            <span>إجمالي المبالغ الآجلة المستحقة: <strong className="text-rose-400 font-mono">{totalOutstandingCredit.toLocaleString()} ج.م</strong></span>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex-shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>إضافة ورشة / عميل جديد</span>
        </button>
      </div>

      <div className="p-6 rounded-3xl bg-gradient-to-r from-surface-2 via-surface-2 to-surface-2 border border-neutral-800 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>أكثر 5 عملاء شراءً خلال الشهر الحالي</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                  Top 5 VIP
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                تصور بياني لمشتريات كبار العملاء والورش ومساهمتهم في حجم مبيعات الشهر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto bg-surface-1 px-3 py-1.5 rounded-xl border border-neutral-800 text-xs">
            <span className="text-neutral-400">إجمالي مشتريات الخمسة الأوائل:</span>
            <span className="font-mono font-bold text-amber-400">
              {totalTop5MonthlySpend.toLocaleString()} ج.م
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-7 bg-surface-1 p-4 rounded-2xl border border-neutral-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-200">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span>ترتيب العملاء حسب قيمة المشتريات (ج.م)</span>
              </div>
              <span className="text-[11px] text-neutral-500">الشهر الحالي</span>
            </div>

            <div className="h-64 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5Customers} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis 
                    type="number" 
                    stroke="#6b7280" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="shortName" 
                    stroke="#d1d5db" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar 
                    dataKey="amount" 
                    radius={[0, 8, 8, 0]}
                    fill="#f59e0b"
                  >
                    {top5Customers.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 bg-surface-1 p-4 rounded-2xl border border-neutral-800/80 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-200">
                <PieIcon className="w-4 h-4 text-emerald-400" />
                <span>النسبة المئوية من مبيعات كبار العملاء</span>
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">100%</span>
            </div>

            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-pie-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {top5Customers.map((cust, idx) => {
            const isFirst = idx === 0;
            const isSecond = idx === 1;
            const isThird = idx === 2;

            return (
              <div
                key={cust.id}
                className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-all ${
                  isFirst
                    ? 'bg-gradient-to-b from-surface-2 to-surface-2 border-amber-500/60 shadow-lg shadow-amber-500/10'
                    : 'bg-surface-1 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                        isFirst
                          ? 'bg-amber-500 text-neutral-950'
                          : isSecond
                          ? 'bg-neutral-300 text-neutral-950'
                          : isThird
                          ? 'bg-amber-700 text-[#ffffff]'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      #{cust.rank}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                      {cust.type}
                    </span>
                  </div>

                  <h5 className="text-xs font-bold text-white line-clamp-1 title" title={cust.name}>
                    {cust.name}
                  </h5>

                  <div className="mt-2.5">
                    <span className="text-[10px] text-neutral-400 block">مشتريات الشهر:</span>
                    <span className="text-sm font-black text-amber-400 font-mono">
                      {cust.amount.toLocaleString()} ج.م
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-neutral-800 text-[10px] text-neutral-400 flex items-center justify-between">
                  <span>{cust.invoices} فاتورة</span>
                  <span className={cust.balance > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {cust.balance > 0 ? `آجل: ${cust.balance} ج.م` : cust.balance < 0 ? `رصيد له: ${Math.abs(cust.balance)} ج.م` : 'مسدد بالكامل'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span>كافة حسابات الورش والعملاء ({customers.length})</span>
          </h3>
          <span className="text-xs text-neutral-400">مرتبة حسب تاريخ النشاط</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 flex flex-col justify-between shadow-md space-y-4 hover:border-neutral-700 transition-all"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{c.name}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-amber-400 font-semibold mt-1 inline-block">
                      {c.type}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Wrench className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-xs text-neutral-400 flex items-center gap-1.5 mt-3">
                  <Phone className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="font-mono text-neutral-300">{c.phone}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-800/80 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-400">مشتريات هذا الشهر:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {(c.monthlyPurchases || 0).toLocaleString()} ج.م
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">الرصيد الآجل المستحق:</span>
                  <span className={`font-mono font-bold ${c.balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {c.balance < 0 ? `رصيد له: ${Math.abs(c.balance).toLocaleString()}` : c.balance.toLocaleString()} ج.م
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">إجمالي المشتريات التراكمية:</span>
                  <span className="font-mono text-white">
                    {c.totalPurchases.toLocaleString()} ج.م
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>آخر حركة:</span>
                  <span>{c.lastVisit}</span>
                </div>
              </div>

              {c.balance > 0 && (
                <button
                  onClick={() => {
                    setSettleModalCustomer(c);
                    setSettleAmount(c.balance);
                  }}
                  className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-xs font-bold text-neutral-200 transition-colors"
                >
                  تسديد دفعة من الحساب
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {settleModalCustomer && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSettleModalCustomer(null)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-surface-2 border border-neutral-800 p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold">تسجيل سند قبض / تسديد</h3>
              <button onClick={() => setSettleModalCustomer(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div>
                <span className="text-neutral-400">الحساب:</span>
                <p className="font-bold text-white text-sm mt-0.5">{settleModalCustomer.name}</p>
              </div>

              <div>
                <span className="text-neutral-400">المبلغ الآجل الإجمالي:</span>
                <p className="font-bold font-mono text-rose-400">{settleModalCustomer.balance.toLocaleString()} ج.م</p>
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">
                  المبلغ المسدد الآن (ج.م):
                </label>
                <input
                  type="number"
                  min="1"
                  max={settleModalCustomer.balance}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleConfirmSettle}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs shadow-md"
            >
              تأكيد استلام {settleAmount.toLocaleString()} ج.م
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="w-full max-w-md rounded-3xl bg-surface-2 border border-neutral-800 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <span>إضافة ورشة أو عميل جديد</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="py-4 space-y-3.5 text-xs">
              <div>
                <label className="text-neutral-300 font-bold block mb-1">اسم الورشة أو العميل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: ورشة الأمانة لميكانيكا السيارات"
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">رقم الجوال *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">نوع الحساب</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                >
                  <option value="ورشة فنية">ورشة فنية (صيانة وميكانيكا)</option>
                  <option value="عميل تجزئة">عميل تجزئة (أفراد)</option>
                  <option value="أسطول شركات">أسطول شركات (نقليات / تكسي)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg mt-4"
              >
                تسجيل العميل
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
