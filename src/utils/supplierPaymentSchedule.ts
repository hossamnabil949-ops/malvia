import type { SupplierPaymentRecurrence } from '../types/autoParts';

export interface SupplierScheduleRule {
  recurrence: SupplierPaymentRecurrence;
  startDate: string; // tenant-local YYYY-MM-DD
  installmentCount: number;
  intervalDays?: number;
  weekdays?: number[]; // 0=Sunday ... 6=Saturday
  dayOfMonth?: number; // 1..31; clamped to month end
  customDates?: string[];
}

const parseDate = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) throw new Error('تاريخ غير صالح؛ استخدم YYYY-MM-DD.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) throw new Error('التاريخ المحدد غير موجود.');
  return date;
};
const formatDate = (date: Date): string => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
const addDays = (date: Date, days: number): Date => { const next = new Date(date); next.setDate(next.getDate()+days); return next; };
const addMonthsClamped = (date: Date, months: number, day: number): Date => {
  const first = new Date(date.getFullYear(), date.getMonth()+months, 1, 12);
  const lastDay = new Date(first.getFullYear(), first.getMonth()+1, 0, 12).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day,lastDay), 12);
};

export function generateSupplierScheduleDates(rule: SupplierScheduleRule): string[] {
  const count = Math.floor(rule.installmentCount);
  if (!Number.isFinite(count) || count < 1 || count > 520) throw new Error('عدد الدفعات يجب أن يكون من 1 إلى 520.');
  const start = parseDate(rule.startDate);
  let dates: string[] = [];
  if (rule.recurrence === 'once') dates = [formatDate(start)];
  else if (rule.recurrence === 'custom') {
    dates = (rule.customDates || []).map(x => formatDate(parseDate(x))).sort();
    if (dates.length !== count) throw new Error('عدد التواريخ المحددة يجب أن يساوي عدد الدفعات.');
  } else if (rule.recurrence === 'every_n_days') {
    const interval = Math.floor(rule.intervalDays || 0);
    if (interval < 1 || interval > 366) throw new Error('الفاصل بالأيام يجب أن يكون من 1 إلى 366.');
    dates = Array.from({length:count}, (_,i)=>formatDate(addDays(start, i*interval)));
  } else if (rule.recurrence === 'monthly') {
    const day = Math.floor(rule.dayOfMonth || start.getDate());
    if (day < 1 || day > 31) throw new Error('يوم الشهر يجب أن يكون من 1 إلى 31.');
    dates = Array.from({length:count}, (_,i)=>formatDate(addMonthsClamped(start, i, day)));
  } else if (rule.recurrence === 'weekly') {
    const weekdays = [...new Set((rule.weekdays || [start.getDay()]).map(Number))].filter(x=>Number.isInteger(x)&&x>=0&&x<=6).sort((a,b)=>a-b);
    if (!weekdays.length) throw new Error('اختر يومًا واحدًا على الأقل من أيام الأسبوع.');
    let cursor = new Date(start);
    for (let guard=0; dates.length<count && guard<3660; guard++, cursor=addDays(cursor,1)) {
      if (cursor >= start && weekdays.includes(cursor.getDay())) dates.push(formatDate(cursor));
    }
    if (dates.length !== count) throw new Error('تعذر إنشاء كل مواعيد الجدول.');
  } else throw new Error('نظام التكرار غير مدعوم.');
  if (dates.some((d,i)=>i>0 && d<=dates[i-1])) throw new Error('يجب أن تكون تواريخ الدفعات متتابعة وغير مكررة.');
  return dates;
}

export function splitSupplierScheduleAmount(totalAmount: number, installmentCount: number): number[] {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('المبلغ الإجمالي يجب أن يكون أكبر من صفر.');
  const count = Math.floor(installmentCount);
  if (!Number.isInteger(count) || count < 1 || count > 520) throw new Error('عدد الدفعات غير صالح.');
  const totalCents = Math.round((totalAmount + Number.EPSILON) * 100);
  if (totalCents < count) throw new Error('المبلغ لا يكفي لتوزيعه على عدد الدفعات بالقروش.');
  const base = Math.floor(totalCents/count);
  return Array.from({length:count},(_,i)=>(i===count-1 ? totalCents-base*(count-1) : base)/100);
}
