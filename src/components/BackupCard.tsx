import React, { useState } from 'react';
import { DatabaseBackup, Download, Loader2, ShieldCheck } from 'lucide-react';
import { downloadJsonFile, exportShopBackup } from '../services/syncService';

interface BackupCardProps {
  tenantId?: string;
  licenseKey?: string;
  companyName?: string;
}

export const BackupCard: React.FC<BackupCardProps> = ({ tenantId, licenseKey, companyName }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleDownload = async () => {
    if (!tenantId || !licenseKey) {
      setMsg({ ok: false, text: 'لا يوجد ترخيص نشط لتحميل نسخته.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await exportShopBackup(tenantId, licenseKey, companyName);
    setBusy(false);
    if (!r.ok || !r.file) {
      setMsg({ ok: false, text: r.error || 'تعذر تحميل النسخة.' });
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`malvia-backup-${day}.json`, r.file);
    setMsg({
      ok: true,
      text:
        r.file.source === 'server'
          ? 'تم تحميل نسخة كاملة من بيانات المحل الحالية.'
          : 'لا يوجد اتصال بالإنترنت، فتم تحميل النسخة المحفوظة على هذا الجهاز.',
    });
  };

  return (
    <div className="bg-surface-2 border border-neutral-800 p-6 rounded-3xl shadow-lg space-y-4">
      <div className="flex items-center gap-2.5 border-b border-neutral-800 pb-3">
        <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
          <DatabaseBackup className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-white">النسخ الاحتياطي لبيانات المحل</h2>
          <p className="text-xs text-neutral-400">نسخة تلقائية كل يوم على السيرفر، ونسخة تحمّلها بنفسك على جهازك</p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/20 rounded-xl p-3">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>يحتفظ السيرفر بنسخة يومية من بياناتك (عند حدوث تغييرات) لمدة أسبوعين. وننصحك أيضًا بتحميل نسخة على جهازك مرة في الأسبوع على الأقل.</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-neutral-950 text-sm font-black transition"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span>تحميل نسخة احتياطية الآن</span>
        </button>
        {msg && (
          <span className={`text-xs font-bold ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</span>
        )}
      </div>

      <p className="text-[11px] text-neutral-500">
        تنبيه: الملف يحتوي على كل بيانات المحل بما فيها حسابات الموظفين، فاحفظه في مكان آمن ولا ترسله لأحد.
        لاسترجاع نسخة تواصل مع الدعم.
      </p>
    </div>
  );
};
