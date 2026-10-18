import React, { useState } from 'react';
import { 
  Download, 
  Smartphone, 
  Monitor, 
  CheckCircle2, 
  X, 
  Share2, 
  PlusSquare, 
  Sparkles,
  Zap,
  Globe,
  Wifi,
  Database,
  ShieldCheck
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'card' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '',
  variant = 'header'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled && variant === 'header') {
    return (
      <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>تطبيق MALVIA مُثبّت</span>
      </div>
    );
  }

  return (
    <>
      {variant === 'header' && (
        <button
          onClick={() => {
            if (isInstallable) {
              install();
            } else {
              setShowModal(true);
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-sm active:scale-95 ${className}`}
          title="تثبيت تطبيق MALVIA على الموبايل والكمبيوتر"
        >
          <Download className="w-3.5 h-3.5 animate-bounce" />
          <span className="hidden sm:inline">تنزيل التطبيق</span>
          <span className="sm:hidden">تثبيت</span>
        </button>
      )}

      {variant === 'settings' && (
        <button
          onClick={() => {
            if (isInstallable) {
              install();
            } else {
              setShowModal(true);
            }
          }}
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface-2 hover:bg-surface-3 border border-amber-500/30 text-white font-bold text-xs transition-all ${className}`}
        >
          <Download className="w-4 h-4 text-amber-400" />
          <span>تنزيل وتثبيت التطبيق على أجهزة الموظفين والكاشير</span>
        </button>
      )}

      {showModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="w-full max-w-xl bg-surface-2 rounded-3xl border border-amber-500/40 p-6 text-white shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    تنزيل تطبيق MALVIA وتشغيل النظام المتكامل
                  </h3>
                  <p className="text-xs text-neutral-400">
                    تطبيق سحابي PWA يعمل على جميع الأجهزة ومرتبط بالنظام لحظياً
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInstallable && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-surface-3 to-emerald-500/20 border border-amber-500/40 flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-bold text-white block">متصفحك يدعم التثبيت الفوري بنقرة واحدة!</span>
                  <span className="text-xs text-neutral-400">سيتم إضافة أيقونة MALVIA على هاتفك أو سطح المكتب</span>
                </div>
                <button
                  onClick={() => {
                    install();
                    setShowModal(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs shadow-lg active:scale-95 whitespace-nowrap"
                >
                  تثبيت الآن
                </button>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>طريقة التثبيت حسب جهازك:</span>
              </h4>

              <div className="p-3.5 rounded-2xl bg-surface-2 border border-neutral-800 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Smartphone className="w-4 h-4" />
                  <span>1. على هواتف أندرويد (Google Chrome):</span>
                </div>
                <p className="text-neutral-300 pr-6 leading-relaxed">
                  افتح الرابط في كروم، اضغط على زر <strong>القائمة (ثلاث نقاط أعلى اليسار)</strong> ثم اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو <strong>"الإضافة إلى الصفحة الرئيسية"</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-2 border border-neutral-800 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Share2 className="w-4 h-4" />
                  <span>2. على آيفون وآيباد (Safari):</span>
                </div>
                <p className="text-neutral-300 pr-6 leading-relaxed">
                  افتح الرابط في متصفح <strong>Safari</strong>، اضغط على زر <strong>المشاركة <Share2 className="w-3.5 h-3.5 inline mx-1 text-amber-400" /></strong> في شريط الأدوات بالأسفل، ثم مرر لأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen) <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-amber-400" /></strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-2 border border-neutral-800 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Monitor className="w-4 h-4" />
                  <span>3. على كمبيوتر المحل ولابتوب الإدارة (Chrome / Edge):</span>
                </div>
                <p className="text-neutral-300 pr-6 leading-relaxed">
                  ستجد أيقونة تثبيت صغيرة <Download className="w-3.5 h-3.5 inline mx-1 text-emerald-400" /> في شريط العنوان أعلى المتصفح، أو من قائمة المتصفح اختر <strong>"تثبيت MALVIA كتطبيق سطح مكتب"</strong>.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition-colors"
            >
              فهمت، حسناً
            </button>
          </div>
        </div>
      )}
    </>
  );
};
