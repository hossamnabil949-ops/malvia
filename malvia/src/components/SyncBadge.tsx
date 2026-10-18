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
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; setStatus(d.status as SyncStatus); setDetail(d.detail || ''); };
    window.addEventListener(SYNC_STATUS_EVENT, h);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, h);
  }, []);
  if (status === 'idle') return null;
  let label = LABELS[status];
  if (status === 'error') {
    if (detail.includes('مفتاح غير مسجل')) label = 'هذا المحل غير مسجل في السحابة — أضفه من /owner ثم ادخل بمفتاحه';
    else if (detail.includes('معلق')) label = 'ترخيص المحل معلق';
    else if (detail) label = 'تعذرت المزامنة: ' + detail.slice(0, 80);
  }
  const color = status === 'synced' ? 'text-emerald-400' : status === 'syncing' ? 'text-amber-400' : 'text-amber-400';
  return (
    <div className={`fixed bottom-20 lg:bottom-3 left-3 z-50 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-700 ${color}`}>
      {label}
    </div>
  );
};
