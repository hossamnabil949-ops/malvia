// أدوات فلترة التاريخ «من ... إلى» المستخدمة في المبيعات والمشتريات والمخزن.
// كل التواريخ في النظام بصيغة YYYY-MM-DD، لذلك المقارنة النصية آمنة.

export interface DateRange {
  from: string; // فارغ = بدون حد أدنى
  to: string;   // فارغ = بدون حد أعلى
}

export const EMPTY_DATE_RANGE: DateRange = { from: '', to: '' };

export const isDateRangeActive = (r: DateRange): boolean => Boolean(r.from || r.to);

/** هل التاريخ داخل المدى؟ التاريخ غير الصالح لا يطابق أي مدى مفعّل. */
export const inDateRange = (date: string | undefined | null, r: DateRange): boolean => {
  if (!isDateRangeActive(r)) return true;
  const d = (date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
};

export const todayISO = (): string => new Date().toISOString().split('T')[0];
