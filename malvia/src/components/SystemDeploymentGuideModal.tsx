import React, { useState } from 'react';
import { 
  Download, 
  Smartphone, 
  Monitor, 
  Key, 
  ShieldCheck, 
  Users, 
  Database, 
  CheckCircle2, 
  X, 
  Sparkles, 
  Share2, 
  PlusSquare, 
  Laptop, 
  Radio, 
  ArrowRight, 
  ExternalLink,
  Lock,
  Zap,
  PhoneCall,
  Clock,
  Printer,
  Barcode
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SystemDeploymentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  onOpenActivation?: () => void;
}

export const SystemDeploymentGuideModal: React.FC<SystemDeploymentGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenActivation,
}) => {
  const [activeTab, setActiveTab] = useState<'quickstart' | 'desktop' | 'mobile' | 'multidevice'>('quickstart');
  const { isInstallable, install } = usePWAInstall();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0F1422] rounded-3xl border border-amber-500/50 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-[#161F33] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-yellow-400/20 border border-amber-500/40 text-amber-400 shadow-md">
              <Download className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  دليل تشغيل وتثبيت نظام المحل
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                  دليل المالك الشامل
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                كيفية تثبيت MALVIA على الكمبيوتر والموبايل، وتوزيع المفاتيح للمحلات والتحكم بالصلاحيات
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-800 bg-[#0C101A] overflow-x-auto text-xs font-bold scrollbar-none">
          <button
            onClick={() => setActiveTab('quickstart')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'quickstart'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>1. كيف تبدأ وتشغل النظام؟</span>
          </button>

          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'desktop'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Monitor className="w-4 h-4 text-emerald-400" />
            <span>2. تثبيت على الكمبيوتر واللابتوب</span>
          </button>

          <button
            onClick={() => setActiveTab('mobile')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'mobile'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>3. تثبيت على الموبايل والتابلت</span>
          </button>



          <button
            onClick={() => setActiveTab('multidevice')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'multidevice'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>5. ربط عدة أجهزة ومستخدمين لنفس المحل</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-neutral-200">
          
          {/* TAB 1: Quickstart & How it links */}
          {activeTab === 'quickstart' && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#1A2338] to-emerald-500/15 border border-amber-500/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                  <Sparkles className="w-5 h-5" />
                  <span>الربط بين السيستم والتطبيق: نظام سحابي موحد بتقنية PWA الحديثة</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  لا تحتاج إلى تحميل تطبيق منفصل من متجر Google Play أو App Store ثم ربطه بالخادم بطرق معقدة.
                  نظام <strong>MALVIA</strong> مبني بأحدث معمارية برمجية سحابية موحدة:
                  <strong> نفس الرابط يعمل كبرنامج سطح مكتب للكمبيوتر، وكتطبيق موبايل سريع لهواتف الأندرويد والآيفون، مع ربط لحظي كامل لقاعدة البيانات</strong>.
                </p>
              </div>

              {/* Steps to launch */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-[#131828] border border-neutral-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 font-mono font-black flex items-center justify-center text-sm border border-amber-500/30">
                    1
                  </div>
                  <h4 className="font-bold text-white text-xs">إصدار مفتاح الترخيص للمحل</h4>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
يتم تفعيل المحل باستخدام مفتاح ترخيص مخصص يقدمه مسؤول النظام، دون إظهار أدوات الإدارة داخل واجهة المحل.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#131828] border border-neutral-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 font-mono font-black flex items-center justify-center text-sm border border-blue-500/30">
                    2
                  </div>
                  <h4 className="font-bold text-white text-xs">إرسال المفتاح للعميل بالواتساب</h4>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    تضغط على زر "نسخ ومشاركة" بالواتساب، فيصل للعميل رسالة جاهزة فيها مفتاح الترخيص الفريد الخاص بمحله ورابط المنظومة.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#131828] border border-neutral-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono font-black flex items-center justify-center text-sm border border-emerald-500/30">
                    3
                  </div>
                  <h4 className="font-bold text-white text-xs">تثبيت التطبيق والتشغيل الفوري</h4>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    يفتح العميل الرابط ويثبت التطبيق على جهازه، فيطلب منه كود التفعيل لأول مرة. بمجرد إدخاله، يُفتح المحل الخاص به فوراً مع حفظ داتا مستقلة تماماً.
                  </p>
                </div>
              </div>

              {/* Interactive Action Shortcuts */}
              {onOpenActivation && (
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                      onClick={() => {
                        onClose();
                        onOpenActivation();
                      }}
                      className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#182033] hover:bg-[#202B45] border border-neutral-700 text-neutral-200 font-bold text-xs active:scale-95 transition-all"
                    >
                      <Key className="w-4 h-4 text-amber-400" />
                      <span> إدخال وتفعيل كود الترخيص</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Desktop PC Installation */}
          {activeTab === 'desktop' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-[#131B2A] border border-emerald-500/30 flex items-start gap-3">
                <Monitor className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-white text-sm">تثبيت MALVIA على أجهزة الكمبيوتر واللابتوب (Windows & Mac)</h4>
                  <p className="text-neutral-300 leading-relaxed">
                    يتم تثبيت التطبيق كبرنامج مستقل (Desktop App) بدون أي برامج خارجية، ويظهر كأيقونة على سطح المكتب وشريط المهام (Taskbar)، ويعمل بكامل ال وبسرعة فائقة.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>خطوات التثبيت في متصفح Google Chrome:</span>
                  </div>
                  <ol className="space-y-2 text-neutral-300 pr-5 list-decimal leading-relaxed">
                    <li>افتح رابط المنظومة في متصفح جوجل كروم.</li>
                    <li>
                      ستظهر أيقونة كمبيوتر صغيرة <Download className="w-3.5 h-3.5 inline text-emerald-400 mx-1" /> في شريط العنوان بالأعلى بجوار زر المفضلة.
                    </li>
                    <li>اضغط على <strong>"تثبيت MALVIA" (Install App)</strong>.</li>
                    <li>سيُغلق المتصفح ويفتح النظام في نافذة مستقلة كبرنامج أصلي تماماً.</li>
                    <li>ستجد أيقونة التطبيق على سطح المكتب وقائمة ابدأ (Start Menu).</li>
                  </ol>
                </div>

                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-blue-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>خطوات التثبيت في متصفح Microsoft Edge:</span>
                  </div>
                  <ol className="space-y-2 text-neutral-300 pr-5 list-decimal leading-relaxed">
                    <li>افتح الرابط في متصفح إيدج على كمبيوتر المحل.</li>
                    <li>اضغط على القائمة (الثلاث نقاط أعلى اليمين أو اليسار).</li>
                    <li>اختر <strong>"التطبيقات" (Apps)</strong> ثم <strong>"تثبيت هذا الموقع كتطبيق" (Install this site as an app)</strong>.</li>
                    <li>اختر تثبيته على شريط المهام (Pin to Taskbar) للوصول السريع بنقرة واحدة يومياً.</li>
                  </ol>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#141A28] border border-neutral-800 space-y-2 text-xs">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>دعم الأجهزة وملحقات الكاشير في المحلات والورش:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-300">
                  <div className="flex items-center gap-2 bg-[#0E121B] p-2.5 rounded-xl border border-neutral-800">
                    <Printer className="w-3.5 h-3.5 text-emerald-400" />
                    <span>طابعات الفواتير الحرارية (80mm / 58mm Thermal Printers)</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0E121B] p-2.5 rounded-xl border border-neutral-800">
                    <Barcode className="w-3.5 h-3.5 text-amber-400" />
                    <span>قارئ الباركود اللاسلكي والـ USB للقطع والكراتين</span>
                  </div>
                </div>
              </div>

              {isInstallable && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      install();
                      onClose();
                    }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-neutral-950 font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>تثبيت برنامج سطح المكتب على هذا الجهاز الآن (بنقرة واحدة)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Mobile & Tablet Installation */}
          {activeTab === 'mobile' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-[#131E2A] border border-sky-500/30 flex items-start gap-3">
                <Smartphone className="w-6 h-6 text-sky-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-white text-sm">تثبيت التطبيق على هواتف أندرويد وآيفون وأجهزة التابلت</h4>
                  <p className="text-neutral-300 leading-relaxed">
                    يعمل كتطبيق هاتف ذكي سريع جداً، يدعم ملء ال، واستخدام الكاميرا لمسح الباركود، والمساعد الصوتي AI للتحدث بالصوت لتسجيل المبيعات والجرد في المستودع.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Android */}
                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-400">
                    <Smartphone className="w-4 h-4" />
                    <span>على هواتف أندرويد (Samsung / Xiaomi / Oppo / Huawei):</span>
                  </div>
                  <ol className="space-y-2 text-neutral-300 pr-5 list-decimal leading-relaxed">
                    <li>افتح الرابط في متصفح Google Chrome.</li>
                    <li>اضغط على <strong>زر القائمة (ثلاث نقاط رأسية)</strong> أعلى زاوية المتصفح.</li>
                    <li>اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو <strong>"الإضافة لل الرئيسية"</strong>.</li>
                    <li>اضغط "تثبيت"؛ ستظهر أيقونة MALVIA الذهبية بين تطبيقات هاتفك.</li>
                    <li>يفتح في وضع ملء ال بدون شريط روابط المتصفح.</li>
                  </ol>
                </div>

                {/* iPhone / iPad */}
                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sky-400">
                    <Smartphone className="w-4 h-4" />
                    <span>على هواتف iPhone وأجهزة iPad (متصفح Safari):</span>
                  </div>
                  <ol className="space-y-2 text-neutral-300 pr-5 list-decimal leading-relaxed">
                    <li>افتح رابط المنظومة في متصفح <strong>Safari</strong> حصراً.</li>
                    <li>
                      اضغط على زر <strong>المشاركة (Share)</strong> في شريط الأدوات بالأسفل <Share2 className="w-3.5 h-3.5 inline text-sky-400 mx-1" />.
                    </li>
                    <li>
                      مرر القائمة لأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong> <PlusSquare className="w-3.5 h-3.5 inline text-amber-400 mx-1" />.
                    </li>
                    <li>اضغط على <strong>"إضافة" (Add)</strong> في الزاوية العلوية.</li>
                    <li>سيصبح لديك تطبيق متكامل على  جهازك كأي تطبيق App Store.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Multi-Device Sync for Same Store */}
          {activeTab === 'multidevice' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-[#141B2E] border border-indigo-500/30 flex items-start gap-3">
                <Users className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-white text-sm">ربط عدة أجهزة ومستخدمين داخل نفس المحل أو الشركة</h4>
                  <p className="text-neutral-300 leading-relaxed">
                    كيف يستفيد المحل الواحد من تشغيل عدة أجهزة ( كاشير + تابلت أمين المستودع + هاتف صاحب المحل للمتابعة) بنفس كود الترخيص.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Monitor className="w-4 h-4" />
                    <span>جهاز الكاشير الرئيسي</span>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    إدخال كود ترخيص المحل. فتح  البيع السريع POS، تسجيل فواتير الزبائن والورش وطباعة إيصالات الدفع.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <Laptop className="w-4 h-4" />
                    <span>تابلت أمين المستودع</span>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    إدخال نفس كود الترخيص. يقوم أمين المخزن بإجراء الجرد الدوري، توريد فواتير المشتريات من الموردين، وإدخال أرقام الأرفف.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#121624] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-sky-400 font-bold">
                    <Smartphone className="w-4 h-4" />
                    <span>موبايل صاحب المحل</span>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    متابعة حركة درج النقدية والخزينة لحظة بلحظة، كشف حسابات الموردين، وتصدير شيتات الإكسيل والأرباح الشهرية.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#141A28] border border-neutral-800 space-y-2 text-xs">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>توزيع الصلاحيات على موظفي المحل (من  الإعدادات):</span>
                </h4>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  من تبويب <strong>"الإعدادات والموظفين"</strong> داخل النظام، يمكن لصاحب المحل إضافة مستخدمين (كاشير، أمين مستودع، محاسب مالي) مع تحديد صلاحيات كل موظف (مثل: منع الكاشير من رؤية رأس المال أو الأرباح أو حذف الفواتير).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0C101A] border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>نظام MALVIA Cloud ERP - الإصدار المؤسسي متعدد الفروع والمحلات</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-colors"
            >
              إغلاق الدليل
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
