import React, { useState, useEffect } from 'react';
import { 
  Key, 
  User, 
  Lock, 
  CarFront, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Sparkles, 
  Smartphone, 
  Laptop, 
  Check, 
  Zap, 
  Sun, 
  Moon, 
  ShieldCheck 
} from 'lucide-react';
import { TenantLicense, Employee, UserSession } from '../types/autoParts';
import { activateFromCloud } from '../services/syncService';
import { authenticateShopUser, upsertTenantLicense, loadDeviceLicenseKey, getAppTheme, setAppTheme, AppTheme } from '../services/tenantService';
import { PWAInstallButton } from './PWAInstallButton';

interface ShopLoginViewProps {
  licenses: TenantLicense[];
  onLoginSuccess: (session: UserSession, tenant: TenantLicense, employees: Employee[]) => void;
}

// أزرار الدخول السريع وبيانات الدخول الافتراضية تظهر في وضع التطوير فقط (كانت تعرض admin/123456 لأي زائر)
const SHOW_DEMO_LOGIN = Boolean((import.meta as any).env?.DEV);

export const ShopLoginView: React.FC<ShopLoginViewProps> = ({
  licenses,
  onLoginSuccess,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChangingKey, setIsChangingKey] = useState(false);
  const [currentTheme, setCurrentThemeState] = useState<AppTheme>(getAppTheme);

  useEffect(() => {
    const saved = loadDeviceLicenseKey();
    if (saved) {
      setLicenseKey(saved);
    } else if (licenses.length > 0) {
      setLicenseKey(licenses[0].licenseKey);
    }
  }, [licenses]);

  const handleToggleTheme = () => {
    const nextTheme: AppTheme = currentTheme === 'light' ? 'blue' : 'light';
    setCurrentThemeState(nextTheme);
    setAppTheme(nextTheme);
  };

  const matchedTenant = React.useMemo(() => {
    if (!licenseKey.trim()) return null;
    const clean = licenseKey.trim().toUpperCase();
    return licenses.find(l => l.licenseKey.toUpperCase() === clean) || null;
  }, [licenseKey, licenses]);

  const handleSubmit = (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const u = customUser || username;
    const p = customPass || password;
    const key = licenseKey.trim() || (licenses.length > 0 ? licenses[0].licenseKey : 'MALVIA-PRO-2026-EG01');

    if (!u.trim()) {
      setErrorMessage('يرجى إدخال اسم المستخدم أو رقم الهاتف.');
      return;
    }
    if (!p.trim()) {
      setErrorMessage('يرجى إدخال كلمة المرور.');
      return;
    }

    setIsLoading(true);

    (async () => {
      // جهاز جديد: اجلب الترخيص وبيانات المحل من السحابة أولاً. لو لا يوجد إنترنت نكمل بالبيانات المحلية.
      const cloud = await activateFromCloud(key, u, p);
      if (cloud.ok && cloud.tenant) {
        upsertTenantLicense(cloud.tenant);
      } else if (!cloud.offline && cloud.error === 'الترخيص معلق') {
        setErrorMessage('تم تعليق ترخيص هذا المحل من إدارة النظام. يرجى مراجعة الإدارة.');
        setIsLoading(false);
        return;
      }

      const result = await authenticateShopUser(key, u, p);

      if (result.success && result.session && result.tenant && result.employees) {
        setSuccessMessage(result.message);
        setTimeout(() => {
          onLoginSuccess(result.session!, result.tenant!, result.employees!);
        }, 400);
      } else {
        setErrorMessage(result.message);
        setIsLoading(false);
      }
    })();
  };

  const handleDirectOwnerLogin = () => {
    handleSubmit(undefined, 'admin', '123456');
  };

  const handleDirectCashierLogin = () => {
    handleSubmit(undefined, 'ahmed', '1234');
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-0 via-surface-2 to-surface-0 text-neutral-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans select-none antialiased relative overflow-hidden">
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <header className="max-w-5xl w-full mx-auto flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm sm:text-base font-black text-white tracking-wide">
              نظام إدارة قطع الغيار ونقاط البيع
            </h1>
            <p className="text-[11px] text-neutral-400">منظومة سحابية تعمل على الكمبيوتر والموبايل وبياناتها متزامنة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-amber-400 transition-all active:scale-95"
            title="تبديل الوضع الليلي / النهاري"
          >
            {currentTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {currentTheme === 'light' ? 'الوضع الليلي' : 'الوضع النهاري'}
            </span>
          </button>

          <PWAInstallButton variant="header" />
        </div>
      </header>

      <main className="max-w-md w-full mx-auto my-auto py-6 z-10">
        <div className="bg-surface-2/95 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 relative">
          <div className="text-center space-y-1.5">
            <div className="mx-auto w-fit rounded-3xl bg-nav-bg px-6 py-3 mb-2"><img src="/logo-login.png" alt="MALVIA" className="mx-auto w-48 sm:w-56 h-auto" draggable={false} /></div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>نظام تجاري مستقل 100% — جاهز للبيع والتشغيل الفوري</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              تسجيل الدخول للنظام
            </h2>
            <p className="text-xs text-neutral-400">
              {SHOW_DEMO_LOGIN ? 'يمكنك الدخول بنقرة واحدة كمدير عام، أو كتابة بيانات الحساب' : 'أدخل مفتاح الترخيص واسم المستخدم وكلمة المرور'}
            </p>
          </div>

          {SHOW_DEMO_LOGIN && (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleDirectOwnerLogin}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-black text-xs shadow-xl shadow-amber-500/25 active:scale-95 transition-all flex items-center justify-between group disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-neutral-950 text-amber-400 flex items-center justify-center font-bold">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="text-right">
                  <div className="font-black text-neutral-950 text-xs">دخول مباشر كصاحب المحل / المدير العام</div>
                  <div className="text-[10px] text-neutral-800 font-bold">صلاحيات كاملة فورية بدون خطوات إضافية</div>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-neutral-950 group-hover:-translate-x-1 transition-transform" />
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleDirectCashierLogin}
              className="w-full py-2.5 px-4 rounded-xl bg-surface-3 hover:bg-surface-4 border border-neutral-700/80 text-neutral-200 text-xs font-bold transition-all flex items-center justify-between"
            >
              <span>دخول سريع ككاشير مبيعات (POS)</span>
              <span className="text-[10px] text-neutral-400 font-mono">user: ahmed</span>
            </button>
          </div>
          )}

          {SHOW_DEMO_LOGIN && (
          <div className="relative flex items-center justify-center">
            <div className="border-t border-neutral-800 w-full" />
            <span className="bg-surface-2 px-3 text-[11px] text-neutral-500 font-bold whitespace-nowrap">
              أو تسجيل الدخول اليدوي
            </span>
            <div className="border-t border-neutral-800 w-full" />
          </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
                <label className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>مفتاح ترخيص المحل (Store Key):</span>
                </label>
                {matchedTenant && !isChangingKey && (
                  <button
                    type="button"
                    onClick={() => setIsChangingKey(true)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline font-normal"
                  >
                    تغيير المفتاح
                  </button>
                )}
              </div>

              {matchedTenant && !isChangingKey ? (
                <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-surface-2 border border-emerald-500/40 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-emerald-300 block">
                      {matchedTenant.companyName}
                    </span>
                    <span className="text-[10px] text-neutral-400 block font-mono">
                      كود الترخيص: {matchedTenant.licenseKey} ({matchedTenant.city})
                    </span>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={licenseKey}
                    onChange={(e) => {
                      setLicenseKey(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="MALVIA-XXXX-XXXX-XX"
                    className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-neutral-700 text-xs font-mono text-amber-400 tracking-wider placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 shadow-inner uppercase"
                  />
                  {matchedTenant && (
                    <button
                      type="button"
                      onClick={() => setIsChangingKey(false)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-neutral-800 text-neutral-300 px-2 py-1 rounded hover:bg-neutral-700"
                    >
                      تثبيت
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>اسم المستخدم أو رقم الهاتف:</span>
              </label>

              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="مثال: admin أو ahmed أو رقم الهاتف"
                className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 shadow-inner"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>كلمة المرور:</span>
              </label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="••••••••"
                  className="w-full h-11 px-4 pr-4 pl-11 rounded-xl bg-surface-2 border border-neutral-700 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 shadow-inner font-mono"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span className="leading-relaxed font-bold">{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>جاري التحقق والدخول...</span>
                </>
              ) : (
                <>
                  <span>تسجيل الدخول للنظام</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="p-3.5 rounded-2xl bg-surface-1 border border-neutral-800 space-y-2 text-[11px] text-neutral-400">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>إرشادات صاحب المحل والموظفين:</span>
            </div>
            <p className="leading-relaxed text-neutral-300">
              * <strong>لصاحب المحل (أول مرة):</strong> اسم المستخدم هو <code className="text-amber-400 font-mono bg-black/40 px-1.5 py-0.5 rounded">admin</code> وكلمة المرور <code className="text-amber-400 font-mono bg-black/40 px-1.5 py-0.5 rounded">123456</code> — <strong className="text-rose-400">غيّرها فور الدخول من الإعدادات</strong>.
            </p>
            <p className="leading-relaxed text-neutral-400">
              * بعد الدخول، يمكنك من شاشة <strong>"الإعدادات والموظفين"</strong> تسجيل موظفيك (كاشير، أمين مخزن، محاسب) وتعيين كلمة مرور وصلاحيات مخصصة لكل موظف ليدخل بها من الموبايل أو الكمبيوتر.
            </p>

            {SHOW_DEMO_LOGIN && (
            <div className="pt-2 border-t border-neutral-800/80 flex items-center gap-2">
              <span className="text-[10px] text-neutral-500">تجربة سريعة:</span>
              <button
                type="button"
                onClick={() => handleQuickFill('admin', '123456')}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 text-[10px] font-bold"
              >
                صاحب المحل (admin)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('ahmed', '1234')}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-emerald-300 text-[10px] font-bold"
              >
                كاشير (ahmed)
              </button>
            </div>
            )}
          </div>

        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500 z-10 pt-4 border-t border-neutral-800/60">
        <div className="flex items-center gap-2">
          <span>MALVIA Cloud ERP v2.4</span>
          <span>•</span>
          <span>جميع الحقوق محفوظة لنظام MALVIA السحابي</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-neutral-400" />
            <Laptop className="w-3.5 h-3.5 text-neutral-400" />
            <span>يعمل على جميع الأجهزة والهواتف وأجهزة الكاشير</span>
          </span>
        </div>
      </footer>
    </div>
  );
};
