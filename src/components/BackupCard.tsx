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

  const [inspection, setInspection] = useState<{ fileName: string; exportedAt: string; company?: string; tenantId?: string; source?: string; resources: Array<{ name: string; count: number }>; total: number; warnings: string[] } | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const handleInspectFile = async (file?: File) => {
    setInspection(null);
    setInspectError(null);
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setInspectError('حجم الملف أكبر من الحد المسموح للفحص (100 ميجابايت).');
      return;
    }
    try {
      const raw = await file.text();
      const parsed: any = JSON.parse(raw);
      if (!parsed || parsed.app !== 'MALVIA' || !Number.isInteger(parsed.format) || !parsed.docs || typeof parsed.docs !== 'object' || Array.isArray(parsed.docs)) {
        throw new Error('صيغة الملف لا تطابق نسخة MALVIA الاحتياطية المعروفة.');
      }
      const resources = Object.entries(parsed.docs).map(([name, entry]: [string, any]) => {
        if (!entry || typeof entry !== 'object' || !Object.prototype.hasOwnProperty.call(entry, 'data')) {
          throw new Error('القسم ' + name + ' لا يحتوي على حقل البيانات المتوقع.');
        }
        const data = entry.data;
        const count = Array.isArray(data) ? data.length : data && typeof data === 'object' ? Object.keys(data).length : data == null ? 0 : 1;
        return { name, count };
      }).sort((a, b) => a.name.localeCompare(b.name));
      const warnings: string[] = [];
      if (parsed.format !== 1) warnings.push('إصدار تنسيق النسخة مختلف عن الإصدار المعروف (1)، يلزم التحقق من التوافق.');
      if (parsed.tenantId && tenantId && parsed.tenantId !== tenantId) warnings.push('النسخة تخص معرف محل مختلف عن المحل المفتوح حاليًا. لن يتم استيرادها.');
      if (!parsed.tenantId) warnings.push('النسخة لا تحتوي على معرف محل؛ يلزم التحقق من مصدرها قبل أي استيراد.');
      if (parsed.source === 'device') warnings.push('هذه نسخة محلية من الجهاز وقد لا تشمل أحدث بيانات السحابة.');
      setInspection({ fileName: file.name, exportedAt: parsed.exportedAt || 'غير محدد', company: parsed.company, tenantId: parsed.tenantId, source: parsed.source, resources, total: resources.reduce((sum, item) => sum + item.count, 0), warnings });
    } catch (error: any) {
      setInspectError(error?.message || 'تعذر قراءة ملف النسخة الاحتياطية.');
    }
  };

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

      <div className="border-t border-neutral-800 pt-4 space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-white">فحص نسخة احتياطية خارجية (Preview / QA)</h3>
          <p className="text-xs text-neutral-400 mt-1">اختر ملف JSON صادرًا من MALVIA لقراءة محتواه محليًا. الفحص لا يرفع الملف ولا يغيّر أي بيانات.</p>
        </div>
        <input type="file" accept=".json,application/json" onChange={(e) => handleInspectFile(e.target.files?.[0])} className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white" />
        {inspectError && <div role="alert" className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/20 rounded-xl p-3">{inspectError}</div>}
        {inspection && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-white">نتيجة فحص الملف</strong>
              <span className="text-[10px] text-emerald-300">قراءة محلية فقط</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300">
              <div>الملف: <b className="break-all">{inspection.fileName}</b></div>
              <div>إجمالي السجلات/المفاتيح: <b>{inspection.total.toLocaleString('en-US')}</b></div>
              <div>المحل: <b>{inspection.company || 'غير محدد'}</b></div>
              <div>تاريخ التصدير: <b>{inspection.exportedAt}</b></div>
              <div>المصدر: <b>{inspection.source || 'غير محدد'}</b></div>
              <div>معرف المحل: <b className="break-all">{inspection.tenantId || 'غير موجود'}</b></div>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-xs text-right">
                <thead><tr className="text-neutral-400"><th className="p-2">قسم البيانات</th><th className="p-2">عدد العناصر</th></tr></thead>
                <tbody>{inspection.resources.map((item) => <tr key={item.name} className="border-t border-neutral-800"><td className="p-2 text-neutral-200">{item.name}</td><td className="p-2 text-neutral-200">{item.count.toLocaleString('en-US')}</td></tr>)}</tbody>
              </table>
            </div>
            {inspection.warnings.map((warning, i) => <div key={i} className="text-xs text-amber-200 bg-amber-950/30 border border-amber-500/20 rounded-lg p-2">{warning}</div>)}
            <p className="text-xs text-neutral-400">لم يتم الاستيراد. هذه معاينة أولية لهيكل JSON وعدد العناصر فقط، وليست تدقيقًا محاسبيًا أو تحققًا من سلامة العلاقات.</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-neutral-500">
        تنبيه: الملف يحتوي على كل بيانات المحل بما فيها حسابات الموظفين، فاحفظه في مكان آمن ولا ترسله لأحد.
        لا ترفع ملف النسخة إلى محل قائم قبل إنشاء مساحة اختبار معزولة ومراجعة محتوياته.
      </p>
    </div>
  );
};
