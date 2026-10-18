import React, { useState } from 'react';
import { 
  Lock, 
  Key, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Phone, 
  Building2, 
  Calendar, 
  Sparkles, 
  ArrowLeft, 
  ExternalLink,
  CarFront
} from 'lucide-react';
import { TenantLicense } from '../types/autoParts';

interface TenantActivationGatewayProps {
  isOpen: boolean;
  isLocked?: boolean;
  onClose?: () => void;
  licenses: TenantLicense[];
  currentLicense: TenantLicense | null;
  onActivateKey: (key: string) => { success: boolean; message: string; license?: TenantLicense };
  onOpenDeploymentGuide?: () => void;
}

export const TenantActivationGateway: React.FC<TenantActivationGatewayProps> = ({
  isOpen,
  isLocked = false,
  onClose,
  licenses,
  currentLicense,
  onActivateKey,
  onOpenDeploymentGuide,
}) => {
  const [inputKey, setInputKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewLicense, setPreviewLicense] = useState<TenantLicense | null>(null);
  const [activatedSuccess, setActivatedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleKeyChange = (val: string) => {
    setInputKey(val);
    setErrorMsg(null);

    const clean = val.trim().toUpperCase();
    const found = licenses.find((l) => l.licenseKey.toUpperCase() === clean);
    if (found) {
      setPreviewLicense(found);
    } else {
      setPreviewLicense(null);
    }
  };

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    const result = onActivateKey(inputKey.trim());
    if (result.success) {
      setActivatedSuccess(true);
      setErrorMsg(null);
      setTimeout(() => {
        setActivatedSuccess(false);
        if (onClose) onClose();
      }, 1500);
    } else {
      setErrorMsg(result.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#0F1422] rounded-3xl border border-amber-500/50 p-6 sm:p-8 text-white shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center space-y-2">
          <img src="/logo-login.png" alt="MALVIA" className="mx-auto w-52 h-auto" draggable={false} />

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
            بوابة تفعيل تراخيص محلات <span className="text-amber-400 font-mono">MALVIA</span>
          </h2>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
            النظام السحابي الذكي لقطع غيار السيارات وإدارة المخازن والورش والخزينة. يتطلب التشغيل مفتاح ترخيص معتمد من مالك النظام.
          </p>
        </div>

        {currentLicense && (
          <div className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
            currentLicense.status === 'معلق مؤقتاً'
              ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
          }`}>
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                {currentLicense.status === 'معلق مؤقتاً'
                  ? 'تم تعليق ترخيص هذا المحل مؤقتاً من قِبل إدارة النظام'
                  : 'انتهت فترة صلاحية ترخيص المحل الحالي، يرجى التجديد'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-300">
              المحل: <strong>{currentLicense.companyName}</strong> | تاريخ الانتهاء: <strong>{currentLicense.expiryDate}</strong>
            </p>
          </div>
        )}

        <form onSubmit={handleActivate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>أدخل كود تفعيل محلك (License Activation Key):</span>
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">مثال: MALVIA-PRO-2026-EG01</span>
            </label>

            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={inputKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="MALVIA-XXXX-XXXX-XX"
                className="w-full h-12 px-4 rounded-2xl bg-[#141A28] border border-neutral-700 text-center text-sm font-mono tracking-widest text-amber-400 uppercase placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 shadow-inner"
              />
            </div>
          </div>

          {previewLicense && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#122820] to-[#121A28] border border-emerald-500/40 space-y-1.5 text-xs animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم التعرف على الترخيص: {previewLicense.companyName}</span>
              </div>
              <div className="text-[11px] text-neutral-300 flex items-center justify-between">
                <span>المالك: {previewLicense.ownerName} ({previewLicense.city})</span>
                <span className="font-mono text-amber-400 font-bold">صالح حتى: {previewLicense.expiryDate}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activatedSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs flex items-center justify-center gap-2 font-bold animate-pulse">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>تم تفعيل الترخيص وربط المحل بنجاح! جاري الفتح...</span>
            </div>
          )}

          <button
            type="submit"
            disabled={activatedSuccess || !inputKey.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            تفعيل وتشغيل نظام المحل الآن
          </button>
        </form>

        <div className="pt-3 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-400 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span>لطلب مفتاح أو تجديد: <strong>01009876543 (م. حسام نبيل)</strong></span>
          </div>


        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {onOpenDeploymentGuide && (
            <button
              type="button"
              onClick={onOpenDeploymentGuide}
              className="text-[11px] text-neutral-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
            >
              <span>دليل تثبيت وتشغيل التطبيق وربط الأجهزة</span>
            </button>
          )}

          {!isLocked && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="py-1 px-3 text-neutral-400 hover:text-neutral-200 text-xs text-center rounded-lg hover:bg-neutral-800 transition-colors"
            >
              إغلاق النافذة
            </button>
          ) : (
            <span className="text-[10px] text-neutral-500 font-mono">
              النظام محمي ومقيد بالترخيص
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
