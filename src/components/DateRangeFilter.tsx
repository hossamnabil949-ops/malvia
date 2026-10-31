import React from 'react';
import { Calendar, X } from 'lucide-react';
import { DateRange, EMPTY_DATE_RANGE, isDateRangeActive } from '../utils/dateRange';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

/** فلتر تاريخ «من : إلى» موحد لشاشات المبيعات والمشتريات والمخزن. */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange, className = '' }) => {
  const active = isDateRangeActive(value);
  const inputCls =
    'h-11 px-2 rounded-xl bg-surface-1 border border-neutral-700 text-neutral-200 text-xs focus:outline-none focus:border-amber-400 min-w-0 flex-1 sm:flex-none sm:w-36';

  return (
    <div className={`flex items-center gap-2 w-full sm:w-auto ${className}`}>
      <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 flex-1 sm:flex-none">
        <span>من:</span>
        <input
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 flex-1 sm:flex-none">
        <span>إلى:</span>
        <input
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className={inputCls}
        />
      </label>
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_DATE_RANGE)}
          className="h-11 w-11 shrink-0 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center"
          title="مسح فلتر التاريخ"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
