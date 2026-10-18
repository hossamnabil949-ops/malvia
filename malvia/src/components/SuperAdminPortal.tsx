import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  Key, 
  Building2, 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  X, 
  Sparkles, 
  RotateCcw, 
  Phone, 
  MapPin, 
  User, 
  Sliders, 
  Send, 
  Zap, 
  Lock, 
  Eye, 
  Share2,
  ExternalLink,
  Laptop
} from 'lucide-react';
import { TenantLicense, TenantPlan, TenantStatus } from '../types/autoParts';

interface SuperAdminPortalProps {
  isOpen: boolean;
  onClose: () => void;
  licenses: TenantLicense[];
  activeTenantId: string;
  onUpdateLicenses: (newLicenses: TenantLicense[]) => void;
  onSelectTenant: (tenantId: string) => void;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  isOpen,
  onClose,
  licenses,
  activeTenantId,
  onUpdateLicenses,
  onSelectTenant,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TenantStatus>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal: Generate New License
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCity, setNewCity] = useState('القاهرة');
  const [newPlan, setNewPlan] = useState<TenantPlan>('باقة سنوية PRO');
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [newMaxEmployees, setNewMaxEmployees] = useState<number>(5);
  const [newNotes, setNewNotes] = useState('');

  const [features, setFeatures] = useState({
    canUsePos: true,
    canUseInventory: true,
    canUsePurchases: true,
    canUseSuppliers: true,
    canUseCustomers: true,
    canUseTreasury: true,
    canUseReports: true,
    canUseVoiceAI: true,
  });

  const MASTER_PIN_KEY = 'malvia_master_owner_pin_v1';

  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [newMasterPin, setNewMasterPin] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPin = localStorage.getItem(MASTER_PIN_KEY) || '';
    if (!storedPin || ['2026', 'malvia', 'admin'].includes(storedPin.toLowerCase())) {
      if (pinCode.trim().length < 12) { setPinError(true); return; }
      localStorage.setItem(MASTER_PIN_KEY, pinCode.trim());
      setIsAuthenticated(true); setPinError(false); setPinCode(''); return;
    }
    if (pinCode.trim() === storedPin) {
      setIsAuthenticated(true);
      setPinError(false);
      setPinCode('');
    } else {
      setPinError(true);
    }
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMasterPin.trim()) return;
    localStorage.setItem(MASTER_PIN_KEY, newMasterPin.trim());
    setPinChangeSuccess(true);
    setTimeout(() => {
      setPinChangeSuccess(false);
      setShowChangePinModal(false);
      setNewMasterPin('');
    }, 1500);
  };

  const filteredLicenses = useMemo(() => {
    return licenses.filter((lic) => {
      const matchQuery =
        lic.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lic.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lic.licenseKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lic.phone.includes(searchQuery) ||
        lic.city.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'all' || lic.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [licenses, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = licenses.length;
    const active = licenses.filter((l) => l.status === 'نشط').length;
    const suspended = licenses.filter((l) => l.status === 'معلق مؤقتاً').length;
    const now = new Date();
    const expiringSoon = licenses.filter((l) => {
      const exp = new Date(l.expiryDate);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 15 && diffDays >= 0 && l.status === 'نشط';
    }).length;

    return { total, active, suspended, expiringSoon };
  }, [licenses]);

  const getRemainingDays = (expiryDateStr: string) => {
    const now = new Date();
    const exp = new Date(expiryDateStr);
    const diffTime = exp.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const generateRandomKey = (cityStr: string) => {
    const prefix = 'MALVIA';
    const cityCode = cityStr.includes('إسكندرية') ? 'ALX' : (cityStr.includes('جيزة') ? 'GIZ' : 'CAI');
    const randomHex = Math.floor(1000 + Math.random() * 9000);
    const randomSec = Math.floor(10 + Math.random() * 90);
    return `${prefix}-${cityCode}-${randomHex}-${randomSec}`;
  };

  const handleCreateLicense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim() || !newOwnerName.trim() || !newPhone.trim()) return;

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

    const generatedKey = generateRandomKey(newCity);
    const tenantId = `tenant-${Date.now()}`;

    const newLic: TenantLicense = {
      id: `lic-${Date.now()}`,
      licenseKey: generatedKey,
      tenantId,
      companyName: newCompanyName.trim(),
      ownerName: newOwnerName.trim(),
      phone: newPhone.trim(),
      city: newCity.trim(),
      plan: newPlan,
      startDate: startDate.toISOString().split('T')[0],
      expiryDate: expiryDate.toISOString().split('T')[0],
      maxEmployees: newMaxEmployees,
      status: 'نشط',
      devicesCount: 1,
      lastActiveDate: 'تم الإنشاء للتو',
      allowedFeatures: { ...features },
      notes: newNotes.trim() || `تم التفعيل بتاريخ ${startDate.toISOString().split('T')[0]} لمدة ${durationMonths} شهر`,
    };

    onUpdateLicenses([newLic, ...licenses]);
    setShowGenerateModal(false);

    setNewCompanyName('');
    setNewOwnerName('');
    setNewPhone('');
    setNewNotes('');
  };

  const handleToggleStatus = (id: string) => {
    const updated = licenses.map((l) => {
      if (l.id === id) {
        const nextStatus: TenantStatus = l.status === 'نشط' ? 'معلق مؤقتاً' : 'نشط';
        return { ...l, status: nextStatus };
      }
      return l;
    });
    onUpdateLicenses(updated);
  };

  const handleExtendSubscription = (id: string, monthsToAdd: number) => {
    const updated = licenses.map((l) => {
      if (l.id === id) {
        const currentExp = new Date(l.expiryDate);
        const baseDate = currentExp.getTime() > Date.now() ? currentExp : new Date();
        baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
        return {
          ...l,
          expiryDate: baseDate.toISOString().split('T')[0],
          status: 'نشط' as TenantStatus,
        };
      }
      return l;
    });
    onUpdateLicenses(updated);
  };

  const handleCopyKey = (key: string, lic: TenantLicense) => {
    const message = `مرحباً أستاذ ${lic.ownerName}،
تم إصدار وتفعيل ترخيص نظام MALVIA لقطع الغيار والمخازن لمحلك:
اسم المحل: ${lic.companyName}
مفتاح التفعيل الخاص بك: ${key}
الباقة: ${lic.plan}
تاريخ الانتهاء: ${lic.expiryDate}
رابط تشغيل التطبيق والسيستم:
${window.location.origin}`;

    navigator.clipboard.writeText(message);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#0F1422] rounded-3xl border border-amber-500/50 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-[#182033] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <ShieldCheck className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  لوحة التحكم المركزية للمالك (MALVIA Master Super Admin)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                  تحكم التراخيص والشركات
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                إدارة تراخيص المحلات، توليد مفاتيح التفعيل، تمديد الاشتراكات، والتحكم بصلاحيات السيستم
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

        {!isAuthenticated ? (
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-4 flex-1">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
              <Lock className="w-8 h-8" />
            </div>
            
            <div className="max-w-md space-y-1.5">
              <h3 className="text-lg font-black text-white">المنطقة مقيدة لمالك النظام فقط</h3>
              <p className="text-xs text-neutral-400">
                أدخل رمز المالك. عند أول استخدام، أنشئ رمزًا قويًا لا يقل عن 12 حرفًا أو رقمًا.
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="w-full max-w-xs space-y-3 pt-2">
              <input
                type="password"
                autoFocus
                value={pinCode}
                onChange={(e) => {
                  setPinCode(e.target.value);
                  setPinError(false);
                }}
                placeholder="أدخل رمز المالك أو أنشئه أول مرة (12 خانة على الأقل)"
                className="w-full h-12 text-center text-lg tracking-widest font-mono rounded-2xl bg-[#141A28] border border-neutral-700 text-amber-400 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500"
              />

              {pinError && (
                <div className="text-xs text-rose-400 flex items-center justify-center gap-1 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>رمز الأمان غير صحيح. يرجى التأكد من كتابة رمز المالك المعتمد.</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                تأكيد الدخول للوحة المالك
              </button>
            </form>

            <span className="text-[11px] text-neutral-500 font-mono">MALVIA Enterprise Multi-Tenant Engine</span>
          </div>
        ) : (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-3xl bg-[#131828] border border-neutral-800 space-y-1">
                <span className="text-xs text-neutral-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>إجمالي المحلات المشتركة</span>
                </span>
                <span className="text-2xl font-black font-mono text-white block">{stats.total} محلات</span>
                <span className="text-[10px] text-neutral-500">مسجلة على سحابة مالفيا</span>
              </div>

              <div className="p-4 rounded-3xl bg-[#12241E] border border-emerald-500/30 space-y-1">
                <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>التراخيص النشطة السارية</span>
                </span>
                <span className="text-2xl font-black font-mono text-emerald-300 block">{stats.active} محل نشط</span>
                <span className="text-[10px] text-emerald-500/70">تعمل بدون أي انقطاع</span>
              </div>

              <div className="p-4 rounded-3xl bg-[#261E14] border border-amber-500/30 space-y-1">
                <span className="text-xs text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>أوشكت على الانتهاء (15 يوم)</span>
                </span>
                <span className="text-2xl font-black font-mono text-amber-300 block">{stats.expiringSoon} محلات</span>
                <span className="text-[10px] text-amber-500/70">تحتاج تواصل للتجديد</span>
              </div>

              <div className="p-4 rounded-3xl bg-[#221419] border border-rose-500/30 space-y-1">
                <span className="text-xs text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>محلات معلقة مؤقتاً</span>
                </span>
                <span className="text-2xl font-black font-mono text-rose-300 block">{stats.suspended} معلق</span>
                <span className="text-[10px] text-rose-500/70">متوقفة لحين سداد الاشتراك</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#131828] p-3.5 rounded-2xl border border-neutral-800">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم المحل، المالك، مفتاح التفعيل، الهاتف..."
                    className="w-full h-10 pr-9 pl-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-xs text-neutral-300 font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="all">كل الحالات</option>
                  <option value="نشط">نشط فقط</option>
                  <option value="معلق مؤقتاً">معلق مؤقتاً</option>
                  <option value="منتهي الصلاحية">منتهي الصلاحية</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChangePinModal(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition shadow-sm"
                  title="تغيير كلمة مرور المالك الرئيسية"
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>تغيير كلمة سر المالك</span>
                </button>

                <button
                  onClick={() => setShowGenerateModal(true)}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-neutral-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>إصدار وتفعيل ترخيص لمحل جديد</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-[#121624]">
              <table className="w-full text-right text-xs text-neutral-300">
                <thead className="bg-[#0C101A] text-neutral-400 text-[11px] border-b border-neutral-800">
                  <tr>
                    <th className="p-3.5">اسم المحل / الشركة</th>
                    <th className="p-3.5">مفتاح التفعيل (License Key)</th>
                    <th className="p-3.5">المالك والاتصال</th>
                    <th className="p-3.5">نوع الباقة</th>
                    <th className="p-3.5">فترة الترخيص</th>
                    <th className="p-3.5">المتبقي</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5 text-center">الإجراءات والتحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredLicenses.map((lic) => {
                    const daysLeft = getRemainingDays(lic.expiryDate);
                    const isExpiring = daysLeft <= 15 && daysLeft >= 0;
                    const isExpired = daysLeft < 0 || lic.status === 'منتهي الصلاحية';
                    const isCurrent = activeTenantId === lic.tenantId;

                    return (
                      <tr 
                        key={lic.id} 
                        className={`transition-colors hover:bg-[#181F30] ${isCurrent ? 'bg-amber-500/5 border-l-4 border-l-amber-500' : ''}`}
                      >
                        <td className="p-3.5 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span>{lic.companyName}</span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                                المحل المفتوح حالياً
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-amber-400" />
                            <span>{lic.city}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-amber-400 bg-black/40 px-2 py-1 rounded-lg border border-neutral-800 text-[11px]">
                              {lic.licenseKey}
                            </span>
                            <button
                              onClick={() => handleCopyKey(lic.licenseKey, lic)}
                              className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white"
                              title="نسخ المفتاح مع رسالة واتساب للعميل"
                            >
                              {copiedKey === lic.licenseKey ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-medium text-neutral-200">{lic.ownerName}</div>
                          <div className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            <span>{lic.phone}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-800 border border-neutral-700 text-neutral-200">
                            {lic.plan}
                          </span>
                        </td>

                        <td className="p-3.5 text-[11px] text-neutral-300 font-mono">
                          <div>من: {lic.startDate}</div>
                          <div>إلى: {lic.expiryDate}</div>
                        </td>

                        <td className="p-3.5">
                          {isExpired ? (
                            <span className="text-rose-400 font-bold text-[11px]">منتهي الصلاحية</span>
                          ) : (
                            <span className={`font-mono font-black text-xs ${isExpiring ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
                              {daysLeft} يوم
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            lic.status === 'نشط'
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${lic.status === 'نشط' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span>{lic.status}</span>
                          </span>
                        </td>

                        <td className="p-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleToggleStatus(lic.id)}
                              className={`p-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                                lic.status === 'نشط'
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              }`}
                              title={lic.status === 'نشط' ? 'إيقاف وتعليق المحل مؤقتاً' : 'إعادة تفعيل المحل'}
                            >
                              {lic.status === 'نشط' ? 'إيقاف' : 'تفعيل'}
                            </button>

                            <button
                              onClick={() => handleExtendSubscription(lic.id, 12)}
                              className="px-2 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-bold"
                              title="تمديد الاشتراك لمدة سنة إضافية"
                            >
                              +سنة
                            </button>

                            {!isCurrent && (
                              <button
                                onClick={() => {
                                  onSelectTenant(lic.tenantId);
                                  onClose();
                                }}
                                className="p-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px]"
                                title="فتح المحل ومعاينة بياناته"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#141E30] to-[#121624] border border-blue-500/30 flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1 text-neutral-300">
                <span className="font-bold text-white block">تحكم كامل ومطلق لك كصاحب النظام:</span>
                <p>
                  1. عندما يشترك معك محل جديد، اضغط على <strong>"إصدار وتفعيل ترخيص لمحل جديد"</strong> واملأ بياناته، ثم انسخ الكود وأرسله له على الواتساب.
                </p>
                <p>
                  2. المحل يفتح الرابط ويدخل المفتاح، فيفتح له السيستم المستقل الخاص به مع عزله التام عن باقي المحلات.
                </p>
                <p>
                  3. بمجرد انتهاء فترة اشتراكه، يُقفل السيستم تلقائياً لديه ولا يمكنه استخدامه حتى تقوم بتجديده أو تمديده من هذه اللوحة.
                </p>
              </div>
            </div>
          </div>
        )}

        {showGenerateModal && (
          <div 
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowGenerateModal(false)}
          >
            <div 
              className="w-full max-w-xl bg-[#121624] rounded-3xl border border-amber-500/40 p-6 text-white shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-black text-white">إصدار وتفعيل ترخيص محل / شركة جديدة</h3>
                </div>
                <button onClick={() => setShowGenerateModal(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateLicense} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">اسم المحل / الشركة *</label>
                    <input
                      type="text"
                      required
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="مثلاً: شركة الفرسان لقطع الغيار"
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">اسم صاحب المحل / المدير *</label>
                    <input
                      type="text"
                      required
                      value={newOwnerName}
                      onChange={(e) => setNewOwnerName(e.target.value)}
                      placeholder="أ. محمود الشناوي"
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">رقم الهاتف (لإرسال المفتاح) *</label>
                    <input
                      type="tel"
                      required
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">المدينة / الفرع</label>
                    <input
                      type="text"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      placeholder="القاهرة - مدينة نصر"
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">نوع الباقة</label>
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value as any)}
                      className="w-full h-10 px-2 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-bold"
                    >
                      <option value="باقة سنوية PRO">باقة سنوية PRO</option>
                      <option value="باقة VIP شاملة الفروع">باقة VIP شاملة الفروع</option>
                      <option value="اشتراك شهري">اشتراك شهري</option>
                      <option value="تجريبي مجاني (14 يوم)">تجريبي (14 يوم)</option>
                      <option value="ترخيص دائم مدى الحياة">ترخيص دائم</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">مدة الاشتراك (بالشهور)</label>
                    <select
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value))}
                      className="w-full h-10 px-2 rounded-xl bg-[#0E121B] border border-neutral-700 text-amber-400 font-bold"
                    >
                      <option value={1}>شهر واحد</option>
                      <option value={3}>3 شهور</option>
                      <option value={6}>6 شهور</option>
                      <option value={12}>سنة كاملة (12 شهر)</option>
                      <option value={24}>سنتين (24 شهر)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">عدد الموظفين المسموح</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newMaxEmployees}
                      onChange={(e) => setNewMaxEmployees(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0E121B] border border-neutral-800 space-y-2">
                  <span className="text-[11px] font-bold text-amber-400 block">الصلاحيات والميزات المفتوحة للمحل:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUsePos} 
                        onChange={(e) => setFeatures({ ...features, canUsePos: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>قسم البيع والكاشير (POS)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUseInventory} 
                        onChange={(e) => setFeatures({ ...features, canUseInventory: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>المخزن والجرد</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUsePurchases} 
                        onChange={(e) => setFeatures({ ...features, canUsePurchases: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>المشتريات والتوريد</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUseSuppliers} 
                        onChange={(e) => setFeatures({ ...features, canUseSuppliers: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>الموردين والدفعات</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUseCustomers} 
                        onChange={(e) => setFeatures({ ...features, canUseCustomers: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>الورش والعملاء</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUseTreasury} 
                        onChange={(e) => setFeatures({ ...features, canUseTreasury: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>الخزينة والمالية</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUseReports} 
                        onChange={(e) => setFeatures({ ...features, canUseReports: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>تصدير إكسيل</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={features.canUseVoiceAI} 
                        onChange={(e) => setFeatures({ ...features, canUseVoiceAI: e.target.checked })} 
                        className="rounded text-amber-500" 
                      />
                      <span>المساعد الصوتي AI</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">ملاحظات الترخيص وقيمة الاشتراك</label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="مثلاً: تم استلام دفعة سنوية 4500 جنيه عبر إنستاباي"
                    className="w-full h-10 px-3 rounded-xl bg-[#0E121B] border border-neutral-700 text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-neutral-950 font-black text-xs shadow-lg mt-2 active:scale-95 transition-all"
                >
                  توليد كود التفعيل واعتماد الترخيص
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Change Master PIN Modal */}
        {showChangePinModal && (
          <div 
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowChangePinModal(false)}
          >
            <div 
              className="w-full max-w-md bg-[#121624] rounded-3xl border border-amber-500/40 p-6 text-white shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">تغيير رمز مرور المالك (Master PIN)</h3>
                    <p className="text-[11px] text-neutral-400">الرمز الخاص بك للدخول إلى لوحة المالك المركزية</p>
                  </div>
                </div>
                <button onClick={() => setShowChangePinModal(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {pinChangeSuccess ? (
                <div className="p-6 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-white text-sm">تم حفظ رمز المرور الجديد بنجاح!</h4>
                  <p className="text-xs text-neutral-400">احتفظ برمزك الجديد لاستخدامه في المرات القادمة.</p>
                </div>
              ) : (
                <form onSubmit={handleSaveNewPin} className="space-y-4 text-xs">
                  <div>
                    <label className="text-neutral-300 font-bold block mb-1">
                      رمز المرور الجديد <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      autoFocus
                      placeholder="أدخل رمز مرور جديد قوي (أرقام أو حروف)"
                      value={newMasterPin}
                      onChange={(e) => setNewMasterPin(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl bg-[#0E121B] border border-neutral-700 text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-neutral-400 mt-1">
                      هذا الرمز خاص بك وحدك كصاحب النظام ولا يظهر لأي عميل أو موظف.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setShowChangePinModal(false)}
                      className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black shadow-lg shadow-amber-500/20 active:scale-95 transition"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>حفظ الرمز الجديد</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
