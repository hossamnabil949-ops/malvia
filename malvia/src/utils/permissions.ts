// قواعد الصلاحيات كدوال نقية. المدير العام يملك كل شيء دائماً (لا يمكن حبسه خارج النظام).
// أي مفتاح من قائمة الشاشة يكفي لفتحها. القائمة الفارغة = متاحة للجميع.
import type { Employee, EmployeePermissions } from '../types/autoParts';

export type PermKey = keyof EmployeePermissions;
export const OWNER_ROLE: Employee['role'] = 'مدير عام';

export const TAB_ACCESS: Record<string, PermKey[]> = {
  dashboard: [],
  pos: ['canSellPos'],
  shifts: ['canSellPos', 'canManageTreasury'],
  inventory: ['canManageInventory'],
  warehouses: ['canManageInventory'],
  invoices: ['canSellPos', 'canViewReports'],
  purchases: ['canManagePurchases'],
  suppliers: ['canManagePurchases', 'canManageTreasury'],
  customers: ['canSellPos', 'canManageTreasury'],
  finance: ['canManageTreasury', 'canManagePartners'],
  cheques: ['canManageTreasury'],
  reports: ['canViewReports'],
  settings: ['canManageSettings'],
};

/** ترتيب اختيار أول شاشة مسموحة عند التحويل من شاشة ممنوعة. */
export const TAB_ORDER = ['dashboard', 'pos', 'shifts', 'invoices', 'customers', 'inventory', 'warehouses', 'purchases', 'suppliers', 'finance', 'cheques', 'reports', 'settings'];

export function hasTabAccess(role: string | undefined, permissions: Partial<EmployeePermissions> | undefined, tab: string): boolean {
  if (role === OWNER_ROLE) return true;
  const required = TAB_ACCESS[tab];
  if (!required) return false;                 // شاشة غير معرّفة: مغلقة افتراضياً (للمدير فقط)
  if (required.length === 0) return true;
  return required.some(k => Boolean(permissions?.[k]));
}

export function firstAllowedTab(role: string | undefined, permissions: Partial<EmployeePermissions> | undefined): string {
  return TAB_ORDER.find(t => hasTabAccess(role, permissions, t)) ?? 'dashboard';
}

const P = (over: Partial<EmployeePermissions>): EmployeePermissions => ({
  canSellPos: false, canManageInventory: false, canManagePurchases: false,
  canManageTreasury: false, canViewReports: false, canManageSettings: false, canManagePartners: false,
  ...over,
});

/** صلاحيات مقترحة لكل وظيفة (يمكن تعديلها يدوياً بعد التطبيق). */
export const ROLE_PRESETS: Record<Employee['role'], EmployeePermissions> = {
  'مدير عام': P({ canSellPos: true, canManageInventory: true, canManagePurchases: true, canManageTreasury: true, canViewReports: true, canManageSettings: true, canManagePartners: true }),
  'كاشير مبيعات': P({ canSellPos: true }),
  'أمين مستودع': P({ canManageInventory: true }),
  'محاسب مالي': P({ canManageTreasury: true, canViewReports: true }),
  'مسؤول مشتريات': P({ canManagePurchases: true }),
  'مشرف ورشة': P({ canSellPos: true }),
};
