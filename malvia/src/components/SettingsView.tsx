import React, { useState } from 'react';
import { hashPassword } from '../services/passwordService';
import { 
  Settings, 
  Users, 
  ShieldCheck, 
  Building2, 
  CarFront, 
  Upload, 
  Save, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  X, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  DollarSign, 
  Percent, 
  Sparkles,
  UserPlus,
  Lock,
  BadgeCheck,
  Check,
  RotateCcw,
  Key,
  BookOpen,
  Clock,
  ExternalLink,
  Sun,
  Moon,
  Palette,
  Eye,
  EyeOff,
  AlertTriangle,
  Zap,
  Car,
  FileSpreadsheet,
  Link as LinkIcon
} from 'lucide-react';
import { ROLE_PRESETS } from '../utils/permissions';
import { resolveLoyalty } from '../utils/loyaltyLogic';
import { ShopSettings, Employee, EmployeePermissions, TenantLicense } from '../types/autoParts';
import { AppTheme, getAppTheme, setAppTheme } from '../services/tenantService';
import { PWAInstallButton } from './PWAInstallButton';
import { BackupCard } from './BackupCard';

interface SettingsViewProps {
  settings: ShopSettings;
  employees: Employee[];
  activeLicense?: TenantLicense | null;
  onUpdateSettings: (newSettings: ShopSettings) => void;
  onAddEmployee: (employee: Employee) => void;
  onUpdateEmployee: (employee: Employee) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onSetActiveEmployee: (employeeId: string) => void;
  onClearDemoData?: () => void;
  onOpenDeploymentGuide?: () => void;
  onOpenExcelModal?: () => void;
  currentTheme?: AppTheme;
  onSelectTheme?: (theme: AppTheme) => void;
  onChangeOwnerPassword?: (newPassword: string, ownerName?: string) => Promise<{ success: boolean; message: string }>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  employees,
  activeLicense,
  onUpdateSettings,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onSetActiveEmployee,
  onClearDemoData,
  onOpenDeploymentGuide,
  onOpenExcelModal,
  currentTheme = getAppTheme(),
  onSelectTheme,
  onChangeOwnerPassword,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'employees'>('profile');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  const [systemName, setSystemName] = useState(settings.systemName || 'MALVIA');
  const [shopName, setShopName] = useState(settings.shopName || '');
  const [shopSubtitle, setShopSubtitle] = useState(settings.shopSubtitle || '');
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [email, setEmail] = useState(settings.email || '');
  const [address, setAddress] = useState(settings.address || '');
  const [commercialRegister, setCommercialRegister] = useState(settings.commercialRegister || '');
  const [taxId, setTaxId] = useState(settings.taxId || '');
  const [currency, setCurrency] = useState(settings.currency || 'ج.م');
  const [vatRate, setVatRate] = useState(settings.vatRate || 14);
  const [invoiceFooterNotes, setInvoiceFooterNotes] = useState(settings.invoiceFooterNotes || '');

  const ownerAccount = employees.find(e => e.role === 'مدير عام' || e.username === 'admin') || employees[0];
  const [ownerDisplayName, setOwnerDisplayName] = useState(ownerAccount?.name || 'المدير العام / مالك المحل');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [ownerPasswordMsg, setOwnerPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    setSystemName(settings.systemName || 'MALVIA');
    setShopName(settings.shopName || '');
    setShopSubtitle(settings.shopSubtitle || '');
    setLogoUrl(settings.logoUrl || '');
    setPhone(settings.phone || '');
    setEmail(settings.email || '');
    setAddress(settings.address || '');
    setCommercialRegister(settings.commercialRegister || '');
    setTaxId(settings.taxId || '');
    setCurrency(settings.currency || 'ج.م');
    setVatRate(settings.vatRate || 14);
    setInvoiceFooterNotes(settings.invoiceFooterNotes || '');
  }, [settings]);

  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [empName, setEmpName] = useState('');
  const [empUsername, setEmpUsername] = useState('');
  const [empPassword, setEmpPassword] = useState('1234');
  const [empRole, setEmpRole] = useState<Employee['role']>('كاشير مبيعات');
  const [empPhone, setEmpPhone] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empShift, setEmpShift] = useState<Employee['shift']>('صباحي');
  const [empSalary, setEmpSalary] = useState(4500);
  const [loyEnabled, setLoyEnabled] = useState(resolveLoyalty(settings.loyalty).enabled);
  const [loyEgpPerPoint, setLoyEgpPerPoint] = useState(String(resolveLoyalty(settings.loyalty).egpPerPoint));
  const [loyPointValue, setLoyPointValue] = useState(String(resolveLoyalty(settings.loyalty).pointValueEgp));
  const [loyMin, setLoyMin] = useState(String(resolveLoyalty(settings.loyalty).minRedeemPoints));
  const [loyExpiry, setLoyExpiry] = useState(String(resolveLoyalty(settings.loyalty).expiryMonths));
  const [loySaved, setLoySaved] = useState(false);
  const handleSaveLoyalty = () => {
    const cfg = resolveLoyalty({
      enabled: loyEnabled,
      egpPerPoint: Number(loyEgpPerPoint),
      pointValueEgp: Number(loyPointValue),
      minRedeemPoints: Number(loyMin),
      expiryMonths: Number(loyExpiry),
    });
    onUpdateSettings({ ...settings, loyalty: cfg });
    setLoyEgpPerPoint(String(cfg.egpPerPoint));
    setLoyPointValue(String(cfg.pointValueEgp));
    setLoyMin(String(cfg.minRedeemPoints));
    setLoyExpiry(String(cfg.expiryMonths));
    setLoySaved(true);
    setTimeout(() => setLoySaved(false), 3000);
  };
  const [empPermissions, setEmpPermissions] = useState<EmployeePermissions>({
    canSellPos: true,
    canManageInventory: false,
    canManagePurchases: false,
    canManageTreasury: false,
    canViewReports: false,
    canManageSettings: false,
    canManagePartners: false,
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ShopSettings = {
      ...settings,
      systemName,
      shopName,
      shopSubtitle,
      logoUrl,
      phone,
      email,
      address,
      commercialRegister,
      taxId,
      currency,
      vatRate: Number(vatRate),
      invoiceFooterNotes,
    };

    onUpdateSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleOwnerPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnerPasswordMsg(null);

    if (!newOwnerPassword.trim()) {
      setOwnerPasswordMsg({ type: 'error', text: 'يرجى إدخال كلمة المرور الجديدة.' });
      return;
    }
    if (newOwnerPassword.trim().length < 4) {
      setOwnerPasswordMsg({ type: 'error', text: 'كلمة المرور يجب أن تتكون من 4 خانات على الأقل.' });
      return;
    }
    if (newOwnerPassword.trim() !== confirmOwnerPassword.trim()) {
      setOwnerPasswordMsg({ type: 'error', text: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' });
      return;
    }

    if (onChangeOwnerPassword) {
      const res = await onChangeOwnerPassword(newOwnerPassword.trim(), ownerDisplayName.trim());
      if (res.success) {
        setOwnerPasswordMsg({ type: 'success', text: res.message });
        setNewOwnerPassword('');
        setConfirmOwnerPassword('');
        setTimeout(() => setOwnerPasswordMsg(null), 5000);
      } else {
        setOwnerPasswordMsg({ type: 'error', text: res.message });
      }
    }
  };

  const [activeTheme, setActiveTheme] = useState<AppTheme>(currentTheme);

  const handleThemeChange = (th: AppTheme) => {
    setActiveTheme(th);
    if (onSelectTheme) {
      onSelectTheme(th);
    } else {
      setAppTheme(th);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim() || !empPhone.trim()) return;
    const passwordHash = await hashPassword(empPassword.trim() || '1234');

    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: empName.trim(),
      role: empRole,
      phone: empPhone.trim(),
      username: empUsername.trim().toLowerCase() || `user${Date.now().toString().slice(-4)}`,
      passwordHash,
      email: empEmail.trim() || undefined,
      shift: empShift,
      salary: Number(empSalary) || 0,
      joinDate: new Date().toISOString().split('T')[0],
      status: 'نشط',
      permissions: empPermissions,
    };

    onAddEmployee(newEmp);
    setShowAddEmpModal(false);

    setEmpName('');
    setEmpUsername('');
    setEmpPassword('1234');
    setEmpPhone('');
    setEmpEmail('');
    setEmpSalary(4500);
  };

  const handleSaveEditedEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    // كلمة المرور الجديدة (إن كُتبت) تُحفظ مجزّأة؛ تركها فارغة يُبقي الحالية
    const { password: newPlain, ...rest } = editingEmployee;
    const updated: Employee = newPlain && newPlain.trim()
      ? { ...rest, passwordHash: await hashPassword(newPlain.trim()) }
      : rest;
    onUpdateEmployee(updated);
    setEditingEmployee(null);
  };

  const toggleEditPermission = (key: keyof EmployeePermissions) => {
    if (!editingEmployee) return;
    setEditingEmployee({
      ...editingEmployee,
      permissions: {
        ...editingEmployee.permissions,
        [key]: !editingEmployee.permissions[key]
      }
    });
  };

  const toggleNewPermission = (key: keyof EmployeePermissions) => {
    setEmpPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const permissionLabels: { key: keyof EmployeePermissions; label: string; desc: string }[] = [
    { key: 'canSellPos', label: 'إصدار فواتير البيع (الكاشير)', desc: 'استخدام POS وإصدار الفواتير للعملاء' },
    { key: 'canManageInventory', label: 'إدارة وتعديل المخزون والجرد', desc: 'إضافة أصناف جديدة وتعديل أسعار التكلفة والبيع' },
    { key: 'canManagePurchases', label: 'فواتير المشتريات والموردين', desc: 'إصدار فواتير الشراء وتوريد البضاعة للمستودع' },
    { key: 'canManageTreasury', label: 'الخزينة وسندات الصرف والقبض', desc: 'سداد دفعات الموردين وتحصيل الديون الآجلة' },
    { key: 'canViewReports', label: 'تقارير إكسيل والتقارير المالية', desc: 'الاطلاع على تقارير المبيعات وتصدير ملفات Excel' },
    { key: 'canManagePartners', label: 'إدارة الشركاء ورأس المال', desc: 'توزيع الأرباح وضخ رأس المال ونسب الحصص' },
    { key: 'canManageSettings', label: 'إدارة الإعدادات والموظفين', desc: 'تعديل بيانات المحل والشعار وتعيين الصلاحيات' },
  ];

  const THEMES_LIST: {
    id: AppTheme;
    name: string;
    desc: string;
    isLight?: boolean;
    preview: { page: string; nav: string; card: string; accent: string; text: string; ok: string; bad: string };
  }[] = [
    {
      id: 'blue',
      name: 'أزرق داكن (الافتراضي)',
      desc: 'بنفس زرقة شعار MALVIA، فتبدو الواجهة والشعار عائلة واحدة',
      preview: { page: '#0A0E17', nav: '#0D1320', card: '#131C2E', accent: '#3B82F6', text: '#E3EAF6', ok: '#34D399', bad: '#FB7185' },
    },
    {
      id: 'graphite',
      name: 'جرافيت وبرتقالي',
      desc: 'رمادي فحمي مع برتقالي، بطابع الورش والسيارات',
      preview: { page: '#0E0E10', nav: '#131315', card: '#1B1B1E', accent: '#F97316', text: '#F4F4F5', ok: '#34D399', bad: '#FB7185' },
    },
    {
      id: 'light',
      name: 'فاتح نظيف',
      desc: 'صفحات بيضاء واضحة في إضاءة المحل، مع شريط جانبي داكن',
      isLight: true,
      preview: { page: '#F1F5F9', nav: '#0F172A', card: '#FFFFFF', accent: '#2563EB', text: '#0F172A', ok: '#059669', bad: '#E11D48' },
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-surface-2 via-surface-2 to-surface-2 p-5 rounded-3xl border border-neutral-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">إعدادات النظام، المظهر، وفريق العمل</h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                MALVIA ERP v2.4
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              تخصيص بيانات وشعار المحل، تغيير كلمة مرور المالك، اختيار ألوان المظهر والدارك مود، وإدارة الموظفين
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">




          {onOpenExcelModal && (
            <button
              onClick={onOpenExcelModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-500 text-emerald-400 text-xs font-bold transition-all shadow-sm"
              title="استيراد وتصدير إكسيل"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>شيتات إكسيل</span>
            </button>
          )}

          {savedSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold animate-pulse">
              <CheckCircle2 className="w-4 h-4" />
              <span>تم حفظ الإعدادات!</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'profile'
              ? 'bg-amber-500 text-neutral-950 font-black shadow-md shadow-amber-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>ملف المحل، ألوان المظهر، وكلمة مرور المالك</span>
        </button>

        <button
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'employees'
              ? 'bg-amber-500 text-neutral-950 font-black shadow-md shadow-amber-500/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>تسجيل الموظفين والصلاحيات ({employees.length})</span>
        </button>
      </div>

      {activeTab === 'profile' ? (
        <div className="space-y-6">
          <BackupCard
            tenantId={activeLicense?.tenantId}
            licenseKey={activeLicense?.licenseKey}
            companyName={activeLicense?.companyName}
          />

          <div className="bg-surface-2 border border-neutral-800 p-6 rounded-3xl shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white">برنامج ولاء العملاء</h3>
                <p className="text-[11px] text-neutral-400">العميل المسجّل يكسب نقاطاً على مشترياته ويستبدلها بخصم في الكاشير (ضمن سقف الخصم المسموح).</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-200 cursor-pointer">
                <input type="checkbox" checked={loyEnabled} onChange={(e) => setLoyEnabled(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                تفعيل
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-neutral-300 font-bold mb-1">كل كم جنيه = نقطة؟</label>
                <input type="number" min="1" step="any" value={loyEgpPerPoint} onChange={(e) => setLoyEgpPerPoint(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono" />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">قيمة النقطة عند الاستبدال (ج.م)</label>
                <input type="number" min="0.01" step="any" value={loyPointValue} onChange={(e) => setLoyPointValue(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono" />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">أقل نقاط للاستبدال</label>
                <input type="number" min="1" step="1" value={loyMin} onChange={(e) => setLoyMin(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono" />
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">صلاحية النقاط (بالشهور)</label>
                <input type="number" min="0" step="1" value={loyExpiry} onChange={(e) => setLoyExpiry(e.target.value)} placeholder="0 = بدون انتهاء" className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveLoyalty} className="h-9 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black">حفظ إعدادات الولاء</button>
              {loySaved && <span className="text-xs font-bold text-emerald-400">تم الحفظ</span>}
              <span className="text-[11px] text-neutral-500">مثال: 1 نقطة لكل 10 ج.م، والنقطة بنصف جنيه ≈ 5% مكافأة. الصلاحية تسري على النقاط الجديدة فقط (0 = بدون انتهاء).</span>
            </div>
          </div>

          <div className="bg-surface-2 border border-neutral-800 p-6 rounded-3xl shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-white">
                    ألوان مظهر وخلفية النظام والوضع الليلي/النهاري (Dark / Light Mode)
                  </h2>
                  <p className="text-xs text-neutral-400">
                    اختر اللون المفضل لواجهة النظام لتتناسب مع ديكور المحل أو أجهزة الكاشير
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleThemeChange(activeTheme === 'light' ? 'blue' : 'light')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-300 text-xs font-bold border border-neutral-700 self-start sm:self-auto transition-all"
              >
                {activeTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                <span>{activeTheme === 'light' ? 'التبديل إلى الوضع الليلي' : 'التبديل إلى الوضع النهاري'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {THEMES_LIST.map((th) => {
                const isSelected = activeTheme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleThemeChange(th.id)}
                    className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between relative overflow-hidden group ${
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/40 bg-gradient-to-b from-surface-3 to-surface-2'
                        : 'border-neutral-800 bg-surface-1 hover:border-neutral-700'
                    }`}
                  >
                    <div className="space-y-1.5 z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                          {th.name}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950">
                            <Check className="w-3 h-3" />
                            <span>المفعل حالياً</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        {th.desc}
                      </p>
                    </div>

                    <div
                      className="mt-3 rounded-xl p-2 flex gap-1.5 h-24 border border-neutral-700"
                      style={{ background: th.preview.page }}
                      aria-hidden="true"
                    >
                      <div className="w-9 rounded-lg p-1 space-y-1" style={{ background: th.preview.nav }}>
                        <div className="h-1.5 rounded" style={{ background: th.preview.accent }} />
                        <div className="h-1.5 rounded opacity-40" style={{ background: th.preview.text }} />
                        <div className="h-1.5 rounded opacity-40" style={{ background: th.preview.text }} />
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-1 content-start">
                        <div className="rounded-md h-6" style={{ background: th.preview.card }} />
                        <div className="rounded-md h-6" style={{ background: th.preview.card }}>
                          <div className="h-1.5 w-1/2 rounded mt-2 mx-1" style={{ background: th.preview.ok }} />
                        </div>
                        <div className="rounded-md h-6" style={{ background: th.preview.card }}>
                          <div className="h-1.5 w-1/2 rounded mt-2 mx-1" style={{ background: th.preview.bad }} />
                        </div>
                        <div className="rounded-md h-5 col-span-3" style={{ background: th.preview.accent }} />
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-neutral-400 font-bold">
                      {th.isLight ? 'وضع فاتح' : 'وضع ليلي'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-surface-2 border border-amber-500/40 p-6 rounded-3xl shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>تغيير كلمة مرور المالك والمدير العام (Master Password)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      حساب admin
                    </span>
                  </h2>
                  <p className="text-xs text-neutral-400">
                    تعيين كلمة مرور جديدة لحساب المالك المستخدم للدخول من أي موبايل أو جهاز كمبيوتر
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleOwnerPasswordSubmit} className="space-y-4 max-w-2xl text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    اسم المالك / المدير العام:
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerDisplayName}
                    onChange={(e) => setOwnerDisplayName(e.target.value)}
                    placeholder="المدير العام"
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 font-bold text-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">يظهر في رأس النظام والفواتير</p>
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    كلمة المرور الجديدة <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showOwnerPassword ? 'text' : 'password'}
                      required
                      value={newOwnerPassword}
                      onChange={(e) => setNewOwnerPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 pl-10 font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                    >
                      {showOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">4 أحرف أو أرقام على الأقل</p>
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    تأكيد كلمة المرور <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type={showOwnerPassword ? 'text' : 'password'}
                    required
                    value={confirmOwnerPassword}
                    onChange={(e) => setConfirmOwnerPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">إعادة كتابة كلمة المرور</p>
                </div>
              </div>

              {ownerPasswordMsg && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  ownerPasswordMsg.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                }`}>
                  {ownerPasswordMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{ownerPasswordMsg.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ كلمة مرور المالك الجديدة</span>
                </button>
              </div>
            </form>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4 bg-surface-2 border border-neutral-800 p-6 rounded-3xl shadow-lg">
                <h2 className="text-sm font-extrabold text-white flex items-center gap-2 border-b border-neutral-800 pb-3">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span>بيانات المؤسسة والفواتير الضريبية</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">
                      اسم النظام البرمجي <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={systemName}
                      onChange={(e) => setSystemName(e.target.value)}
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 font-black text-amber-400 text-sm focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-neutral-400 mt-1">الاسم الأساسي للسيستم (MALVIA)</p>
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">
                      اسم المحل / المعرض التجاري <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 font-bold text-white focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-neutral-400 mt-1">يظهر في رأس الفواتير الضريبية والإيصالات</p>
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-neutral-300 font-bold mb-1">الوصف والنشاط التجاري</label>
                  <input
                    type="text"
                    value={shopSubtitle}
                    onChange={(e) => setShopSubtitle(e.target.value)}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">
                      أرقام الهاتف والتواصل <span className="text-amber-400">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-surface-2 border border-neutral-700 rounded-xl pr-9 pl-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">البريد الإلكتروني</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-surface-2 border border-neutral-700 rounded-xl pr-9 pl-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-neutral-300 font-bold mb-1">
                    العنوان والمقر الرئيسي للمحل <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl pr-9 pl-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">السجل التجاري (CR)</label>
                    <input
                      type="text"
                      value={commercialRegister}
                      onChange={(e) => setCommercialRegister(e.target.value)}
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">الرقم الضريبي (VAT)</label>
                    <input
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">عملة الحسابات والفواتير</label>
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="مثال: ج.م أو ر.س أو $"
                      className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-bold mb-1">نسبة ضريبة القيمة المضافة (%)</label>
                    <div className="relative">
                      <Percent className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={vatRate}
                        onChange={(e) => setVatRate(Number(e.target.value))}
                        className="w-full bg-surface-2 border border-neutral-700 rounded-xl pr-3 pl-9 py-2.5 font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-neutral-300 font-bold mb-1">شروط وملاحظات أسفل الفاتورة</label>
                  <textarea
                    rows={2}
                    value={invoiceFooterNotes}
                    onChange={(e) => setInvoiceFooterNotes(e.target.value)}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ بيانات المحل والفاتورة</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-surface-2 border border-neutral-800 p-6 rounded-3xl shadow-lg space-y-4">
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <CarFront className="w-4 h-4 text-amber-400" />
                    <span>شعار وهوية المحل التجارية</span>
                  </h3>

                  <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-surface-1 border border-dashed border-neutral-700 text-center">
                    {logoUrl ? (
                      <div className="relative group">
                        <img
                          src={logoUrl}
                          alt="Logo Preview"
                          className="w-28 h-28 object-contain rounded-2xl bg-black/40 p-2 border border-neutral-700 shadow-md"
                        />
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="absolute -top-2 -right-2 p-1 rounded-full bg-rose-500 text-[#ffffff] shadow-md hover:bg-rose-600"
                          title="حذف الشعار"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 p-0.5 shadow-md flex items-center justify-center">
                        <div className="w-full h-full rounded-[14px] bg-surface-1 flex items-center justify-center text-amber-400">
                          <CarFront className="w-10 h-10" />
                        </div>
                      </div>
                    )}

                    <div className="mt-3 text-center">
                      <h3 className="text-sm font-extrabold text-white">{systemName}</h3>
                      <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">{shopName}</p>
                    </div>

                    <div className="mt-4 w-full">
                      <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold cursor-pointer border border-neutral-700 hover:border-amber-500 transition-all">
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span>رفع شعار المحل المخصص</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-surface-2 via-surface-2 to-surface-2 border border-amber-500/40 p-5 rounded-3xl space-y-3 shadow-lg">
                  <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>تثبيت التطبيق على أي موبايل أو كمبيوتر</span>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    يعمل النظام مستقلاً على جميع الهواتف الذكية (Android / iPhone) وأجهزة الكاشير واللابتوب بدون أي بريد إلكتروني.
                  </p>
                  <PWAInstallButton variant="settings" className="w-full justify-center" />
                </div>
              </div>
            </div>

            <div className="bg-surface-0 border border-rose-500/40 p-6 rounded-3xl shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>إعادة ضبط المصنع ومسح كافة البيانات التجريبية والموظفين</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        خاص بالمالك
                      </span>
                    </h3>
                    <p className="text-xs text-neutral-300 mt-1 max-w-2xl leading-relaxed">
                      يتيح هذا الإجراء تفريغ المخزون وحذف الفواتير وحسابات العملاء والموردين وتقارير تحليل المبيعات، ومسح الموظفين التجريبيين الإضافيين (مع الإبقاء فقط على حساب المالك الرئيسي admin).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-[#ffffff] font-black text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-95 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>مسح البيانات التجريبية والموظفين بالكامل</span>
                </button>
              </div>

              {clearSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold animate-pulse">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>تم بنجاح تصفير كافة البيانات، الموظفين التجريبيين، وتقارير التحليل والمبيعات! النظام الآن فارغ وجاهز تماماً.</span>
                </div>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-2 p-4 rounded-2xl border border-neutral-800">
            <div>
              <h2 className="text-sm font-extrabold text-white">فريق العمل والموظفين المسجلين</h2>
              <p className="text-xs text-neutral-400">إدارة الصلاحيات لكل موظف وتحديد المسؤول الحالي في النظام</p>
            </div>

            <button
              onClick={() => setShowAddEmpModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" />
              <span>تسجيل موظف جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => {
              const isActiveUser = settings.activeEmployeeId === emp.id;
              const isOwner = emp.role === 'مدير عام' || emp.username === 'admin';
              return (
                <div
                  key={emp.id}
                  className={`bg-surface-2 border rounded-2xl p-4 flex flex-col justify-between transition-all shadow-md ${
                    isActiveUser
                      ? 'border-amber-500/60 ring-1 ring-amber-500/30 bg-gradient-to-b from-surface-2 to-surface-2'
                      : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                        وردية: {emp.shift}
                      </span>
                      <div className="flex items-center gap-1">
                        {isOwner && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            مالك النظام
                          </span>
                        )}
                        {isActiveUser && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950">
                            المستخدم الحالي ✓
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-sm font-extrabold text-white">{emp.name}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-400">{emp.role}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">({emp.phone})</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-neutral-800/80 space-y-1.5 text-[11px]">
                      <span className="text-neutral-400 block font-bold">الصلاحيات الممنوحة:</span>
                      <div className="flex flex-wrap gap-1">
                        {emp.permissions.canSellPos && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px]">بيع POS</span>
                        )}
                        {emp.permissions.canManageInventory && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px]">مخزون وجرد</span>
                        )}
                        {emp.permissions.canManagePurchases && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px]">مشتريات وموردين</span>
                        )}
                        {emp.permissions.canManageTreasury && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px]">الخزينة والصرف</span>
                        )}
                        {emp.permissions.canViewReports && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px]">تقارير إكسيل</span>
                        )}
                        {emp.permissions.canManagePartners && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 text-[10px]">الشركاء والأرباح</span>
                        )}
                        {emp.permissions.canManageSettings && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px]">الإعدادات</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setEditingEmployee(emp)}
                      className="flex items-center gap-1 py-1.5 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition-all"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>تعديل الصلاحيات</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {!isOwner && (
                        <button
                          onClick={() => onDeleteEmployee(emp.id)}
                          className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 transition-all"
                          title="حذف الموظف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {!isActiveUser && (
                        <button
                          onClick={() => onSetActiveEmployee(emp.id)}
                          className="py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-neutral-950 text-xs font-bold border border-amber-500/30 transition-all"
                        >
                          تعيين ككاشير حالي
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-2 border border-neutral-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">تسجيل موظف جديد في نظام MALVIA</h3>
                  <p className="text-xs text-neutral-400">تحديد الدور الوظيفي والصلاحيات على النظام</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddEmpModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    اسم الموظف <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: أحمد فتحي"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">المسمى الوظيفي</label>
                  <select
                    value={empRole}
                    onChange={(e) => {
                      const r = e.target.value as Employee['role'];
                      setEmpRole(r);
                      setEmpPermissions({ ...ROLE_PRESETS[r] }); // صلاحيات مقترحة للوظيفة، تُعدَّل يدوياً بعدها
                    }}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="كاشير مبيعات">كاشير مبيعات</option>
                    <option value="أمين مستودع">أمين مستودع</option>
                    <option value="محاسب مالي">محاسب مالي</option>
                    <option value="مسؤول مشتريات">مسؤول مشتريات</option>
                    <option value="مشرف ورشة">مشرف ورشة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    رقم الهاتف <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="010XXXXXXXX"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">الوردية</label>
                  <select
                    value={empShift}
                    onChange={(e) => setEmpShift(e.target.value as Employee['shift'])}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="صباحي">صباحي</option>
                    <option value="مسائي">مسائي</option>
                    <option value="شامل">شامل</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-neutral-900/60 p-3 rounded-2xl border border-neutral-800">
                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    اسم المستخدم للدخول <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: ahmed أو cashier"
                    value={empUsername}
                    onChange={(e) => setEmpUsername(e.target.value)}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    كلمة المرور / PIN <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 1234"
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2">
                <span className="block text-xs font-black text-amber-400">تحديد صلاحيات الموظف على النظام:</span>
                <div className="space-y-2">
                  {permissionLabels.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-start gap-2.5 cursor-pointer hover:bg-neutral-800/40 p-1.5 rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={empPermissions[perm.key]}
                        onChange={() => toggleNewPermission(perm.key)}
                        className="mt-0.5 rounded text-amber-500 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-white text-xs">{perm.label}</div>
                        <div className="text-[10px] text-neutral-400">{perm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تسجيل الموظف</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-2 border border-neutral-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">تعديل بيانات وصلاحيات: {editingEmployee.name}</h3>
                <p className="text-xs text-neutral-400">الوظيفة: {editingEmployee.role} | هاتف: {editingEmployee.phone}</p>
              </div>
              <button
                onClick={() => setEditingEmployee(null)}
                className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-neutral-900/60 p-3 rounded-2xl border border-neutral-800">
                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    اسم الموظف:
                  </label>
                  <input
                    type="text"
                    required
                    value={editingEmployee.name}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    المسمى الوظيفي:
                  </label>
                  <select
                    value={editingEmployee.role}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value as Employee['role'] })}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="كاشير مبيعات">كاشير مبيعات</option>
                    <option value="أمين مستودع">أمين مستودع</option>
                    <option value="محاسب مالي">محاسب مالي</option>
                    <option value="مسؤول مشتريات">مسؤول مشتريات</option>
                    <option value="مدير عام">مدير عام</option>
                    <option value="مشرف ورشة">مشرف ورشة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    اسم المستخدم للدخول:
                  </label>
                  <input
                    type="text"
                    required
                    value={editingEmployee.username || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, username: e.target.value })}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1">
                    كلمة المرور / PIN:
                  </label>
                  <input
                    type="text"
                    placeholder="اتركه فارغاً للإبقاء على كلمة المرور الحالية"
                    autoComplete="new-password"
                    value={editingEmployee.password || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, password: e.target.value })}
                    className="w-full bg-surface-2 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-black text-amber-400">الصلاحيات المتاحة:</span>
                  <button
                    type="button"
                    onClick={() => setEditingEmployee({ ...editingEmployee, permissions: { ...ROLE_PRESETS[editingEmployee.role] } })}
                    className="text-[11px] font-bold text-sky-300 hover:text-sky-200"
                    title="يستبدل الصلاحيات الحالية بالصلاحيات المقترحة لهذه الوظيفة"
                  >
                    تطبيق صلاحيات الوظيفة الافتراضية
                  </button>
                </div>
                <div className="space-y-2">
                  {permissionLabels.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-start gap-2.5 cursor-pointer hover:bg-neutral-800/40 p-2 rounded-xl transition-colors border border-transparent hover:border-neutral-700"
                    >
                      <input
                        type="checkbox"
                        checked={editingEmployee.permissions[perm.key]}
                        onChange={() => toggleEditPermission(perm.key)}
                        className="mt-0.5 rounded text-amber-500 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-white text-xs">{perm.label}</div>
                        <div className="text-[10px] text-neutral-400">{perm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ الصلاحيات المحدثة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowClearConfirm(false)}
        >
          <div 
            className="w-full max-w-md bg-surface-2 border border-rose-500/50 rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                <RotateCcw className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">تأكيد مسح كافة البيانات التجريبية والموظفين</h3>
                <p className="text-xs text-rose-300">تحذير أمان: هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed bg-surface-1 p-3.5 rounded-2xl border border-neutral-800">
              سيتم تفريغ كافة أصناف قطع الغيار، فواتير المبيعات، مرتجعات البيع، حسابات العملاء، حسابات الموردين، فواتير المشتريات، حركة الخزينة، وتقارير التحليل البياني، ومسح كافة الموظفين التجريبيين الإضافيين (مع الإبقاء فقط على حساب المالك الرئيسي admin).
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-all"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearDemoData) {
                    onClearDemoData();
                  }
                  setShowClearConfirm(false);
                  setClearSuccess(true);
                  setTimeout(() => setClearSuccess(false), 6000);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-[#ffffff] font-black text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>نعم، احذف كافة البيانات والموظفين الآن</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
