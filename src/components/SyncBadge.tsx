import React, { useEffect, useState } from 'react';
import { SYNC_STATUS_EVENT, SyncStatus } from '../services/syncService';

const LABELS: Record<SyncStatus, string> = {
  idle: '',
  syncing: 'جارٍ المزامنة…',
  synced: 'متزامن ✓',
  offline: 'بدون إنترنت — سيُزامَن لاحقاً',
  error: 'تعذرت المزامنة — سنعيد المحاولة',
};

export const SyncBadge: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [detail, setDetail] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setStatus(d.status as SyncStatus);
      setDetail(d.detail || '');
      if (d.status === 'error') setExpanded(true);
      if (d.status === 'synced') setExpanded(false);
    };
    window.addEventListener(SYNC_STATUS_EVENT, h);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, h);
  }, []);
  if (status === 'idle') return null;
  let label = LABELS[status];
  if (status === 'error') {
    if (detail.includes('مفتاح غير مسجل')) label = 'هذا المحل غير مسجل في السحابة — أضفه من /owner ثم ادخل بمفتاحه';
    else if (detail.includes('معلق')) label = 'ترخيص المحل معلق';
    else label = 'تعذرت المزامنة — اضغط لعرض تفاصيل التشخيص';
  }
  const color = status === 'synced' ? 'text-emerald-400' : status === 'syncing' ? 'text-amber-400' : 'text-amber-400';
  return (
    <div className={`fixed bottom-20 lg:bottom-3 left-3 z-50 max-w-[min(94vw,520px)] text-[11px] font-bold rounded-xl bg-slate-900/95 border border-slate-700 shadow-xl ${color}`}>
      <button type="button" onClick={() => setExpanded(v => !v)} className="px-3 py-2 text-right w-full">
        {label}
      </button>
      {expanded && status === 'error' && (
        <div dir="rtl" className="border-t border-slate-700 px-3 py-2 font-mono font-medium text-[10px] leading-5 whitespace-pre-wrap break-words select-text">
          {detail || 'لم تصل تفاصيل تشخيص من الخادم.'}
          <div className="mt-1 text-slate-400 font-sans">التفاصيل لا تتضمن بيانات الموظفين أو كلمات المرور.</div>
        </div>
      )}
    </div>
  );
};
