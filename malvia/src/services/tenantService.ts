import { 
  TenantLicense, 
  AutoPart, 
  Invoice, 
  Customer, 
  Supplier, 
  SupplierPayment,
  TreasuryTransaction, 
  Employee, 
  ShopSettings, 
  SalesReturn, 
  PurchaseInvoice, 
  PurchaseReturn, 
  Expense, 
  Partner, 
  UserSession,
  CarModel,
  PartReservation,
  InventoryDiscrepancyError,
  AuditEntry,
  StockMovement,
  Warehouse,
  StockLevel,
  StockTransfer,
  Shift
} from '../types/autoParts';

import { 
  INITIAL_TENANT_LICENSES, 
  INITIAL_PARTS, 
  INITIAL_INVOICES, 
  INITIAL_CUSTOMERS, 
  INITIAL_SUPPLIERS, 
  INITIAL_SUPPLIER_PAYMENTS,
  INITIAL_TREASURY_TRANSACTIONS, 
  INITIAL_EMPLOYEES, 
  INITIAL_SHOP_SETTINGS,
  INITIAL_SALES_RETURNS,
  INITIAL_PURCHASE_INVOICES,
  INITIAL_PURCHASE_RETURNS,
  INITIAL_EXPENSES,
  INITIAL_PARTNERS,
  INITIAL_CAR_MODELS,
  INITIAL_RESERVATIONS,
  INITIAL_INVENTORY_ERRORS
} from '../data/autoPartsData';

import { markDirty, SYNC_STATUS_EVENT } from './syncService';
import { DEFAULT_PASSWORDS, hashPassword, isHashed, verifyPassword } from './passwordService';

const LICENSES_KEY = 'malvia_tenant_licenses_v1';
const ACTIVE_TENANT_KEY = 'malvia_active_tenant_id_v1';
const SESSION_KEY = 'malvia_user_session_v1';
const SAVED_LICENSE_KEY = 'malvia_device_saved_license_key_v1';
const THEME_KEY = 'malvia_app_theme_v1';
export const MASTER_OWNER_PIN_KEY = 'malvia_master_owner_pin_v1';

export type AppTheme = 'blue' | 'graphite' | 'light';

export const APP_THEMES: AppTheme[] = ['blue', 'graphite', 'light'];
const DEFAULT_THEME: AppTheme = 'blue';
const THEME_META_COLORS: Record<AppTheme, string> = {
  blue: '#0A0E17',
  graphite: '#0E0E10',
  light: '#0F172A',
};

export function loadTenantLicenses(): TenantLicense[] {
  try {
    const raw = localStorage.getItem(LICENSES_KEY);
    if (raw) {
      const parsed: TenantLicense[] = JSON.parse(raw);
      const now = new Date().toISOString().split('T')[0];
      return parsed.map(lic => {
        if (lic.expiryDate < now && lic.status === 'نشط') {
          return { ...lic, status: 'منتهي الصلاحية' };
        }
        return lic;
      });
    }
  } catch (err) {
    console.warn('Error loading licenses from storage:', err);
  }
  return INITIAL_TENANT_LICENSES;
}

export function saveTenantLicenses(licenses: TenantLicense[]): void {
  try {
    localStorage.setItem(LICENSES_KEY, JSON.stringify(licenses));
  } catch (err) {
    console.warn('Error saving licenses to storage:', err);
  }
}

export function getActiveTenantId(): string {
  try {
    const active = localStorage.getItem(ACTIVE_TENANT_KEY);
    if (active) return active;
  } catch {
    // ignore
  }
  return INITIAL_TENANT_LICENSES[0].tenantId;
}

export function setActiveTenantId(tenantId: string): void {
  try {
    localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
  } catch {
    // ignore
  }
}

function getTenantKey(tenantId: string, resource: string) {
  return `malvia_${tenantId}_${resource}`;
}

export function getAppTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && (APP_THEMES as string[]).includes(saved)) {
      return saved as AppTheme;
    }
  } catch {
    // ignore
  }
  return DEFAULT_THEME;
}

/** Applies a theme to the page (class on <body> + browser bar colour) without saving it. */
export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const body = document.body;
  APP_THEMES.forEach(t => body.classList.remove(`theme-${t}`));
  body.classList.add(`theme-${theme}`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_META_COLORS[theme]);
}

export function setAppTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.warn('Error saving theme:', err);
  }
  applyAppTheme(theme);
}

export function loadTenantStoreData(tenant: TenantLicense) {
  const tenantId = tenant.tenantId;
  const isDemoCleared = localStorage.getItem(getTenantKey(tenantId, 'demo_cleared')) === 'true';

  const loadResource = <T>(resource: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(getTenantKey(tenantId, resource));
      if (raw !== null) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    if (isDemoCleared && Array.isArray(fallback)) {
      return [] as unknown as T;
    }
    return fallback;
  };

  const tenantSettings: ShopSettings = {
    ...INITIAL_SHOP_SETTINGS,
    shopName: tenant.companyName,
    shopSubtitle: `نظام MALVIA السحابي المتكامل لإدارة قطع الغيار والورش - فرع ${tenant.city}`,
    phone: tenant.phone,
    email: `contact@${tenant.tenantId}.com`,
    address: `${tenant.city} - مجمع قطع الغيار التجاري`,
  };

  return {
    parts: loadResource<AutoPart[]>('parts', INITIAL_PARTS),
    invoices: loadResource<Invoice[]>('invoices', INITIAL_INVOICES),
    customers: loadResource<Customer[]>('customers', INITIAL_CUSTOMERS),
    suppliers: loadResource<Supplier[]>('suppliers', INITIAL_SUPPLIERS),
    supplierPayments: loadResource<SupplierPayment[]>('supplierPayments', INITIAL_SUPPLIER_PAYMENTS),
    treasuryTransactions: loadResource<TreasuryTransaction[]>('treasury', INITIAL_TREASURY_TRANSACTIONS),
    employees: loadResource<Employee[]>('employees', INITIAL_EMPLOYEES),
    settings: loadResource<ShopSettings>('settings', tenantSettings),
    salesReturns: loadResource<SalesReturn[]>('salesReturns', INITIAL_SALES_RETURNS),
    purchaseInvoices: loadResource<PurchaseInvoice[]>('purchaseInvoices', INITIAL_PURCHASE_INVOICES),
    purchaseReturns: loadResource<PurchaseReturn[]>('purchaseReturns', INITIAL_PURCHASE_RETURNS),
    expenses: loadResource<Expense[]>('expenses', INITIAL_EXPENSES),
    partners: loadResource<Partner[]>('partners', INITIAL_PARTNERS),
    carModels: loadResource<CarModel[]>('carModels', INITIAL_CAR_MODELS),
    reservations: loadResource<PartReservation[]>('reservations', INITIAL_RESERVATIONS),
    inventoryErrors: loadResource<InventoryDiscrepancyError[]>('inventoryErrors', INITIAL_INVENTORY_ERRORS),
    auditLog: loadResource<AuditEntry[]>('auditLog', []),
    stockMovements: loadResource<StockMovement[]>('stockMovements', []),
    shifts: loadResource<Shift[]>('shifts', []),
    warehouses: loadResource<Warehouse[]>('warehouses', []),
    stockLevels: loadResource<StockLevel[]>('stockLevels', []),
    stockTransfers: loadResource<StockTransfer[]>('stockTransfers', []),
  };
}

export function saveTenantStoreData(
  tenantId: string,
  data: {
    parts?: AutoPart[];
    invoices?: Invoice[];
    customers?: Customer[];
    suppliers?: Supplier[];
    supplierPayments?: SupplierPayment[];
    treasuryTransactions?: TreasuryTransaction[];
    employees?: Employee[];
    settings?: ShopSettings;
    salesReturns?: SalesReturn[];
    purchaseInvoices?: PurchaseInvoice[];
    purchaseReturns?: PurchaseReturn[];
    expenses?: Expense[];
    partners?: Partner[];
    carModels?: CarModel[];
    reservations?: PartReservation[];
    inventoryErrors?: InventoryDiscrepancyError[];
    auditLog?: AuditEntry[];
    stockMovements?: StockMovement[];
    shifts?: Shift[];
    warehouses?: Warehouse[];
    stockLevels?: StockLevel[];
    stockTransfers?: StockTransfer[];
  }
) {
  try {
    Object.entries(data).forEach(([resource, val]) => {
      if (val !== undefined) {
        localStorage.setItem(getTenantKey(tenantId, resource), JSON.stringify(val));
      }
    });
    markDirty(tenantId, Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k));
  } catch (err) {
    console.error('Error saving tenant store data:', err);
    // امتلاء مساحة المتصفح كان يمر بصمت => نبلّغ الواجهة بدل إخفاء ضياع التغييرات
    try {
      window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: { status: 'error', detail: 'تعذّر حفظ التغييرات محلياً (المساحة ممتلئة). خذ نسخة احتياطية الآن.' } }));
    } catch { /* ignore */ }
  }
}

export function clearTenantDemoData(tenantId: string): Employee[] {
  try {
    const emptyArrayJson = JSON.stringify([]);
    localStorage.setItem(getTenantKey(tenantId, 'parts'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'invoices'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'customers'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'suppliers'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'supplierPayments'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'treasury'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'salesReturns'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'purchaseInvoices'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'purchaseReturns'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'expenses'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'partners'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'reservations'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'inventoryErrors'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'auditLog'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'stockMovements'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'shifts'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'warehouses'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'stockLevels'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'stockTransfers'), emptyArrayJson);
    localStorage.setItem(getTenantKey(tenantId, 'demo_cleared'), 'true');

    const rawEmps = localStorage.getItem(getTenantKey(tenantId, 'employees'));
    const empsList: Employee[] = rawEmps ? JSON.parse(rawEmps) : INITIAL_EMPLOYEES;
    const ownerAccount = empsList.find(e => e.role === 'مدير عام' || e.username === 'admin') || INITIAL_EMPLOYEES[0];
    const cleanedStaff = [ownerAccount];
    localStorage.setItem(getTenantKey(tenantId, 'employees'), JSON.stringify(cleanedStaff));
    markDirty(tenantId, ['parts','invoices','customers','suppliers','supplierPayments','treasury','salesReturns','purchaseInvoices','purchaseReturns','expenses','partners','reservations','inventoryErrors','employees','auditLog','stockMovements','shifts','warehouses','stockLevels','stockTransfers']);

    return cleanedStaff;
  } catch (err) {
    console.warn('Error clearing demo data:', err);
    return [INITIAL_EMPLOYEES[0]];
  }
}

export async function updateOwnerPassword(
  tenantId: string, 
  newPassword: string,
  newOwnerName?: string
): Promise<{ success: boolean; message: string; updatedEmployee?: Employee }> {
  try {
    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, message: 'كلمة المرور يجب أن تكون 4 خانات على الأقل.' };
    }
    const cleanPass = newPassword.trim();
    const raw = localStorage.getItem(getTenantKey(tenantId, 'employees'));
    let emps: Employee[] = raw ? JSON.parse(raw) : INITIAL_EMPLOYEES;

    let targetIdx = emps.findIndex(e => e.role === 'مدير عام' || e.username === 'admin');
    if (targetIdx < 0 && emps.length > 0) targetIdx = 0;

    if (targetIdx >= 0) {
      const { password: _legacyPlain, ...ownerWithoutPlain } = emps[targetIdx];
      emps[targetIdx] = {
        ...ownerWithoutPlain,
        passwordHash: await hashPassword(cleanPass),
        name: newOwnerName && newOwnerName.trim().length > 0 ? newOwnerName.trim() : emps[targetIdx].name,
      };
      localStorage.setItem(getTenantKey(tenantId, 'employees'), JSON.stringify(emps));
      markDirty(tenantId, ['employees']);

      const currentSession = loadUserSession();
      if (currentSession && (currentSession.employeeId === emps[targetIdx].id || currentSession.role === 'مدير عام')) {
        currentSession.employeeName = emps[targetIdx].name;
        saveUserSession(currentSession);
      }

      return {
        success: true,
        message: 'تم حفظ كلمة مرور المالك الجديدة بنجاح! يمكنك الآن تسجيل الدخول بها.',
        updatedEmployee: emps[targetIdx]
      };
    }

    return { success: false, message: 'لم يتم العثور على حساب المالك لتحديثه' };
  } catch (err) {
    return { success: false, message: 'حدث خطأ أثناء حفظ كلمة المرور الجديدة' };
  }
}

export function saveUserSession(session: UserSession | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (err) {
    console.warn('Error saving user session:', err);
  }
}

export function loadUserSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

export function clearUserSession(): void {
  saveUserSession(null);
}

export function saveDeviceLicenseKey(key: string): void {
  try {
    localStorage.setItem(SAVED_LICENSE_KEY, key.trim().toUpperCase());
  } catch {
    // ignore
  }
}

export function loadDeviceLicenseKey(): string {
  try {
    const saved = localStorage.getItem(SAVED_LICENSE_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  return INITIAL_TENANT_LICENSES[0].licenseKey;
}

export const getDeviceSavedLicenseKey = loadDeviceLicenseKey;

export async function authenticateShopUser(
  licenseKey: string,
  usernameOrPhone: string,
  passwordInput: string
): Promise<{ 
  success: boolean; 
  message: string; 
  session?: UserSession; 
  tenant?: TenantLicense; 
  employees?: Employee[];
}> {
  const cleanKey = licenseKey.trim().toUpperCase();
  const licenses = loadTenantLicenses();
  const tenant = licenses.find(l => l.licenseKey.toUpperCase() === cleanKey);

  if (!tenant) {
    return {
      success: false,
      message: 'مفتاح ترخيص المحل غير مسجل. يرجى التأكد من كتابة المفتاح المعتمد الممنوح لك من إدارة المنظومة.'
    };
  }

  if (tenant.status === 'معلق مؤقتاً') {
    return {
      success: false,
      message: 'تم تعليق ترخيص هذا المحل مؤقتاً من قِبل إدارة النظام. يرجى مراجعة إدارة المنظومة لتسوية الاشتراك.'
    };
  }

  const now = new Date().toISOString().split('T')[0];
  if (tenant.expiryDate < now) {
    return {
      success: false,
      message: `انتهت صلاحية ترخيص هذا المحل بتاريخ (${tenant.expiryDate}). يرجى تجديد الاشتراك مع الإدارة.`
    };
  }

  const storeData = loadTenantStoreData(tenant);
  const employees = storeData.employees && storeData.employees.length > 0 ? storeData.employees : INITIAL_EMPLOYEES;

  const cleanUser = usernameOrPhone.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  const matchedEmp = employees.find(e => 
    (e.username && e.username.toLowerCase() === cleanUser) ||
    e.phone === cleanUser ||
    e.name.toLowerCase() === cleanUser ||
    (cleanUser === 'admin' && e.role === 'مدير عام')
  );

  if (!matchedEmp) {
    return {
      success: false,
      message: 'اسم المستخدم أو الموظف غير مسجل في هذا المحل. (لصاحب المحل أول مرة: استخدم admin)',
      employees
    };
  }

  if (matchedEmp.status === 'معلق') {
    return {
      success: false,
      message: 'تم إيقاف حساب هذا الموظف مؤقتاً بواسطة إدارة المحل.'
    };
  }

  // التحقق: الحساب المجزّأ أولاً. الحسابات القديمة (نص) تُقبل مرة واحدة ثم تُحوَّل كلها إلى تجزئة.
  let passwordOk = false;
  if (matchedEmp.passwordHash && isHashed(matchedEmp.passwordHash)) {
    passwordOk = await verifyPassword(cleanPass, matchedEmp.passwordHash);
  } else {
    const legacyPlain = matchedEmp.password || (matchedEmp.role === 'مدير عام' ? '123456' : '1234');
    passwordOk = cleanPass === legacyPlain;
  }
  if (!passwordOk) {
    return {
      success: false,
      message: 'كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور الخاصة بك أو مراجعة مدير المحل.',
      employees
    };
  }

  // ترحيل: أي موظف ما زالت كلمته نصاً (أو بلا كلمة) تُحفظ مجزّأة وتُحذف النسخة النصية من الداتا المتزامنة
  let migratedEmployees = employees;
  if (employees.some(e => !e.passwordHash || e.password !== undefined)) {
    migratedEmployees = await Promise.all(employees.map(async (e) => {
      if (e.passwordHash && e.password === undefined) return e;
      const { password: plain, ...rest } = e;
      const passwordHash = e.passwordHash && isHashed(e.passwordHash)
        ? e.passwordHash
        : await hashPassword(plain || (e.role === 'مدير عام' ? '123456' : '1234'));
      return { ...rest, passwordHash } as Employee;
    }));
    try {
      localStorage.setItem(getTenantKey(tenant.tenantId, 'employees'), JSON.stringify(migratedEmployees));
      markDirty(tenant.tenantId, ['employees']);
    } catch (err) {
      console.error('تعذّر حفظ ترحيل كلمات المرور', err);
    }
  }
  const usingDefaultPassword = DEFAULT_PASSWORDS.includes(cleanPass);

  const session: UserSession = {
    tenantId: tenant.tenantId,
    licenseKey: tenant.licenseKey,
    companyName: tenant.companyName,
    employeeId: matchedEmp.id,
    employeeName: matchedEmp.name,
    role: matchedEmp.role,
    permissions: matchedEmp.permissions,
    loginTime: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
  };

  saveUserSession(session);
  saveDeviceLicenseKey(tenant.licenseKey);
  setActiveTenantId(tenant.tenantId);

  return {
    success: true,
    message: `مرحباً بك يا ${matchedEmp.name} (${matchedEmp.role}) في نظام ${tenant.companyName}!` +
      (usingDefaultPassword ? ' ⚠ كلمة المرور افتراضية: غيّرها من الإعدادات.' : ''),
    session,
    tenant,
    employees: migratedEmployees
  };
}

export const authenticateShopStaff = authenticateShopUser;

export function getMasterOwnerPin(): string {
  try {
    return localStorage.getItem(MASTER_OWNER_PIN_KEY) || '2026';
  } catch {
    return '2026';
  }
}

export function setMasterOwnerPin(newPin: string): boolean {
  try {
    if (!newPin || newPin.trim().length < 3) return false;
    localStorage.setItem(MASTER_OWNER_PIN_KEY, newPin.trim());
    return true;
  } catch {
    return false;
  }
}

/** يضيف/يحدّث ترخيص محل جاء من السحابة في القائمة المحلية. */
export function upsertTenantLicense(license: TenantLicense): void {
  const list = loadTenantLicenses();
  const i = list.findIndex(l => l.tenantId === license.tenantId || l.licenseKey.toUpperCase() === license.licenseKey.toUpperCase());
  if (i >= 0) list[i] = { ...list[i], ...license }; else list.push(license);
  saveTenantLicenses(list);
}
