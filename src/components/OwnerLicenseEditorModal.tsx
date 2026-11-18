import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { TenantLicense, TenantPlan } from '../types/autoParts';

interface OwnerLicenseEditorModalProps {
  license: TenantLicense;
  onSave: (updated: TenantLicense) => void;
  onClose: () => void;
}

const PLAN_OPTIONS: TenantPlan[] = [
  'تجريبي مجاني (14 يوم)',
  'اشتراك شهري',
  'باقة سنوية PRO',
  'باقة VIP شاملة الفروع',
  'ترخيص دائم مدى الحياة',
];

const FEATURE_OPTIONS: { key: keyof TenantLicense['allowedFeatures']; label: string; fallback?: boolean }[] = [
  { key: 'canUsePos', label: 'نقطة البيع والمبيعات', fallback: true },
  { key: 'canUseInventory', label: 'إدارة المخزون', fallback: true },
  { key: 'canUseStockMonitoring', label: 'مراقبة المخزون والتنبيهات', fallback: true },
  { key: 'canUsePurchases', label: 'المشتريات', fallback: true },
  { key: 'canUseSuppliers', label: 'إدارة الموردين', fallback: true },
  { key: 'canUseCustomers', label: 'إدارة العملاء', fallback: true },
  { key: 'canUseTreasury', label: 'الخزينة والبنوك', fallback: true },
  { key: 'canUseReports', label: 'التقارير', fallback: true },
  { key: 'canUseAdvancedReports', label: 'التحليلات المتقدمة', fallback: true },
  { key: 'canUseAI', label: 'الذكاء الاصطناعي AI', fallback: true },
  { key: 'canUseVoiceAI', label: 'المساعد الصوتي', fallback: true },
  { key: 'canUseWorkshops', label: 'إدارة الورش والصيانة', fallback: false },
  { key: 'canUseHR', label: 'إدارة الموارد البشرية', fallback: false },
];

export const OwnerLicenseEditorModal: React.FC<OwnerLicenseEditorModalProps> = ({ license, onSave, onClose }) => {
  const [draft, setDraft] = useState<TenantLicense>(() => ({
    ...license,
    allowedFeatures: { ...license.allowedFeatures },
  }));
  const [error, setError] = useState('');
  const featureValues = useMemo(() => FEATURE_OPTIONS.map(item => ({
    ...item,
    enabled: Boolean(draft.allowedFeatures[item.key] ?? item.fallback ?? false),
  })), [draft.allowedFeatures]);

  const update = <K extends keyof TenantLicense>(key: K, value: TenantLicense[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.companyName.trim() || !draft.ownerName.trim() || !draft.licenseKey.trim()) {
      setError('اسم الشركة واسم المالك ومفتاح الترخيص حقول مطلوبة.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.expiryDate)) {
      setError('يرجى إدخال تاريخ بداية ونهاية صحيح.');
      return;
    }
    if (draft.expiryDate < draft.startDate) {
      setError('تاريخ انتهاء الترخيص لا يمكن أن يسبق تاريخ البداية.');
      return;
    }
    if (!Number.isInteger(draft.maxEmployees) || draft.maxEmployees < 1) {
      setError('عدد المستخدمين يجب أن يكون رقماً صحيحاً أكبر من صفر.');
      return;
    }
    if (draft.devicesLimit != null && (!Number.isInteger(draft.devicesLimit) || draft.devicesLimit < 1)) {
      setError('عدد الأجهزة يجب أن يكون رقماً صحيحاً أكبر من صفر.');
      return;
    }
    if (draft.customPrice != null && (!Number.isFinite(draft.customPrice) || draft.customPrice < 0)) {
      setError('السعر المخصص يجب أن يكون صفراً أو أكثر.');
      return;
    }
    onSave({
      ...draft,
      companyName: draft.companyName.trim(),
      ownerName: draft.ownerName.trim(),
      licenseKey: draft.licenseKey.trim().toUpperCase(),
      phone: draft.phone.trim(),
      city: draft.city.trim(),
      notes: draft.notes?.trim() || '',
      allowedFeatures: { ...draft.allowedFeatures },
    });
  };

  const fieldClass = 'w-full rounded-xl border border-neutral-700 bg-surface-1 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500';
  const labelClass = 'mb-1.5 block text-xs font-bold text-neutral-400';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" dir="rtl">
      <form onSubmit={handleSubmit} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-surface-2 text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-800 p-4">
          <div>
            <h3 className="font-black">تعديل اشتراك العميل وخصائصه</h3>
            <p className="mt-1 text-xs text-neutral-400">{license.companyName} · {license.tenantId}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
          <section>
            <h4 className="mb-3 text-sm font-black text-amber-300">بيانات العميل والترخيص</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label><span className={labelClass}>اسم الشركة / المحل *</span><input className={fieldClass} value={draft.companyName} onChange={e=>update('companyName',e.target.value)} /></label>
              <label><span className={labelClass}>اسم المالك *</span><input className={fieldClass} value={draft.ownerName} onChange={e=>update('ownerName',e.target.value)} /></label>
              <label><span className={labelClass}>رقم الهاتف</span><input className={fieldClass} value={draft.phone} onChange={e=>update('phone',e.target.value)} /></label>
              <label><span className={labelClass}>المدينة</span><input className={fieldClass} value={draft.city} onChange={e=>update('city',e.target.value)} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>مفتاح الترخيص *</span><input dir="ltr" className={fieldClass+' font-mono'} value={draft.licenseKey} onChange={e=>update('licenseKey',e.target.value)} /></label>
              <label><span className={labelClass}>الباقة</span><select className={fieldClass} value={draft.plan} onChange={e=>update('plan',e.target.value as TenantPlan)}>{PLAN_OPTIONS.map(plan=><option key={plan} value={plan}>{plan}</option>)}</select></label>
              <label><span className={labelClass}>السعر المتفق عليه (ج.م) — اختياري</span><input type="number" min="0" step="0.01" className={fieldClass} value={draft.customPrice ?? ''} placeholder="استخدم سعر الباقة الافتراضي" onChange={e=>update('customPrice',e.target.value===''?undefined:Number(e.target.value))} /></label>
              <label><span className={labelClass}>بداية الترخيص</span><input type="date" className={fieldClass} value={draft.startDate} onChange={e=>update('startDate',e.target.value)} /></label>
              <label><span className={labelClass}>نهاية الترخيص</span><input type="date" className={fieldClass} value={draft.expiryDate} onChange={e=>update('expiryDate',e.target.value)} /></label>
              <label><span className={labelClass}>الحد الأقصى للمستخدمين</span><input type="number" min="1" step="1" className={fieldClass} value={draft.maxEmployees} onChange={e=>update('maxEmployees',Number(e.target.value))} /></label>
              <label><span className={labelClass}>الحد الأقصى للأجهزة</span><input type="number" min="1" step="1" className={fieldClass} value={draft.devicesLimit ?? 1} onChange={e=>update('devicesLimit',Number(e.target.value))} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>ملاحظات إدارية</span><textarea rows={2} className={fieldClass} value={draft.notes ?? ''} onChange={e=>update('notes',e.target.value)} /></label>
            </div>
          </section>

          <section className="border-t border-neutral-800 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-amber-300">المكونات المتاحة لهذا العميل</h4>
              <span className="text-xs text-neutral-400">{featureValues.filter(item=>item.enabled).length} من {featureValues.length} مفعّل</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEATURE_OPTIONS.map(item => {
                const enabled = Boolean(draft.allowedFeatures[item.key] ?? item.fallback ?? false);
                return <label key={String(item.key)} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-surface-1 px-3 py-2.5 text-sm">
                  <span>{item.label}</span>
                  <input type="checkbox" checked={enabled} onChange={e=>setDraft(current=>({...current,allowedFeatures:{...current.allowedFeatures,[item.key]:e.target.checked}}))} className="h-4 w-4 accent-amber-500" />
                </label>;
              })}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-amber-200/80">حفظ هذه الاختيارات يسجل إعدادات الاشتراك. يجب أن يطبق محرك الصلاحيات المقابل منع الوصول من الواجهة والخادم قبل اعتبار أي مكوّن مستبعداً محمياً بالكامل.</p>
          </section>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-neutral-800 p-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-800 px-4 py-2.5 text-sm font-bold text-neutral-300 hover:bg-neutral-700">إلغاء</button>
          <button type="submit" className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black text-neutral-950 hover:bg-amber-400"><Check className="h-4 w-4" />حفظ التعديلات</button>
        </footer>
      </form>
    </div>
  );
};
