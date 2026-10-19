import React, { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, Download, Loader2, RefreshCw, RotateCcw, X, AlertTriangle } from 'lucide-react';
import { TenantLicense } from '../types/autoParts';
import {
  BackupMeta,
  adminCreateBackup,
  adminFetchBackup,
  adminListBackups,
  adminRestoreBackup,
  downloadJsonFile,
} from '../services/syncService';

interface Props {
  license: TenantLicense;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  auto: 'تلقائية يومية',
  manual: 'يدوية',
  'pre-restore': 'أمان قبل استرجاع',
};

const formatSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

export const TenantBackupsModal: React.FC<Props> = ({ license, onClose }) => {
  const [backups, setBackups] = useState<BackupMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await adminListBackups(license.tenantId);
    setLoading(false);
    if (r.ok) setBackups(r.backups || []);
    else setMsg({ ok: false, text: r.error || 'تعذر تحميل القائمة' });
  }, [license.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setBusy('create');
    setMsg(null);
    const r = await adminCreateBackup(license.tenantId);
    setBusy(null);
    if (r.ok) {
      setMsg({ ok: true, text: 'تم إنشاء نسخة احتياطية الآن.' });
      load();
    } else setMsg({ ok: false, text: r.error || 'فشل إنشاء النسخة' });
  };

  const handleDownload = async (id: number) => {
    setBusy(`dl-${id}`);
    const r = await adminFetchBackup(id);
    setBusy(null);
    if (r.ok) {
      const day = String(r.file?.created_at || '').slice(0, 10);
      downloadJsonFile(`malvia-${license.licenseKey}-${day}-#${id}.json`, r.file);
    } else setMsg({ ok: false, text: r.error || 'فشل تحميل النسخة' });
  };

  const handleRestore = async (id: number) => {
    setBusy(`rs-${id}`);
    setMsg(null);
    const r = await adminRestoreBackup(license.tenantId, id);
    setBusy(null);
    setConfirmId(null);
    if (r.ok) {
      setMsg({
        ok: true,
        text: 'تم الاسترجاع. أُخذت نسخة أمان قبله للتراجع عنه إن لزم. اطلب من العميل إغلاق التطبيق على كل أجهزته ثم فتحه من جديد.',
      });
      load();
    } else setMsg({ ok: false, text: r.error || 'فشل الاسترجاع' });
  };

  const confirmBackup = backups?.find(b => b.id === confirmId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
      <div className="bg-surface-2 border border-neutral-700 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <DatabaseBackup className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-white">النسخ الاحتياطية والاسترجاع</h3>
              <p className="text-xs text-neutral-400 truncate">{license.companyName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-neutral-950 text-sm font-black"
            >
              {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
              نسخة احتياطية الآن
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <span className="text-[11px] text-neutral-500">يحتفظ النظام بآخر 14 نسخة يومية و10 يدوية.</span>
          </div>

          {msg && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border ${
                msg.ok
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              {msg.text}
            </div>
          )}

          {loading && !backups && (
            <div className="py-10 flex justify-center text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}

          {backups && backups.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-400">
              لا توجد نسخ بعد. تُنشأ أول نسخة تلقائية في الليلة القادمة، أو اضغط «نسخة احتياطية الآن».
            </div>
          )}

          <ul className="space-y-2">
            {backups?.map(b => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-surface-1 border border-neutral-800"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{formatDate(b.created_at)}</div>
                  <div className="text-[11px] text-neutral-400">
                    {KIND_LABEL[b.kind] || b.kind} · {formatSize(b.size_bytes)} · {b.resources} قسم
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleDownload(b.id)}
                    disabled={!!busy}
                    title="تحميل ملف النسخة"
                    className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 disabled:opacity-60"
                  >
                    {busy === `dl-${b.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setConfirmId(b.id)}
                    disabled={!!busy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold disabled:opacity-60"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    استرجاع
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {confirmBackup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70">
          <div className="bg-surface-2 border border-rose-500/40 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="font-black">تأكيد الاسترجاع</h4>
            </div>
            <p className="text-sm text-neutral-200 leading-relaxed">
              سيتم استبدال <b>كل بيانات «{license.companyName}»</b> الحالية بنسخة بتاريخ{' '}
              <b>{formatDate(confirmBackup.created_at)}</b>. أي عمل تم بعد هذا التاريخ سيختفي.
              سيأخذ النظام نسخة أمان من الوضع الحالي قبل الاسترجاع حتى تتمكن من التراجع.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRestore(confirmBackup.id)}
                disabled={!!busy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-60 text-[#ffffff] text-sm font-black"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                نعم، استرجع
              </button>
              <button
                onClick={() => setConfirmId(null)}
                disabled={!!busy}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
