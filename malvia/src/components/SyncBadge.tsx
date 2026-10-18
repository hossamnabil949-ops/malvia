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
  useEffect(() => {
    const h = (e: Event) => setStatus((e as CustomEvent).detail.status as SyncStatus);
    window.addEventListener(SYNC_STATUS_EVENT, h);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, h);
  }, []);
  if (status === 'idle') return null;
  const color = status === 'synced' ? 'text-emerald-400' : status === 'syncing' ? 'text-sky-400' : 'text-amber-400';
  return (
    <div className={`fixed bottom-20 lg:bottom-3 left-3 z-50 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-700 ${color}`}>
      {LABELS[status]}
    </div>
  );
};
