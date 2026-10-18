import React, { useEffect, useRef, useState } from 'react';
import {
  Home,
  ShoppingCart,
  Boxes,
  Receipt,
  Truck,
  Users,
  DollarSign,
  FileSpreadsheet,
  ClipboardList,
  TrendingUp,
  Settings,
  Bell,
  Mic,
  CarFront,
  Camera,
  Menu,
  X,
  LogOut,
  AlertTriangle,
  ChevronsRight,
  ChevronsLeft,
  LayoutGrid,
  ChevronDown,
  BookOpen,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';
import { UserSession } from '../types/autoParts';

export type ActiveTab =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'invoices'
  | 'purchases'
  | 'suppliers'
  | 'customers'
  | 'finance'
  | 'reports'
  | 'settings';

interface NavigationProps {
  currentTab: string;
  onTabChange: (tab: ActiveTab) => void;
  activeNotificationsCount: number;
  onOpenNotifications: () => void;
  onOpenVoiceAssistant: () => void;
  onOpenInventoryErrors: () => void;
  onOpenCarModels: () => void;
  onOpenPhotoSharing: () => void;
  onOpenExcelModal: () => void;
  onOpenDeploymentGuide?: () => void;
  onOpenInventoryAudit?: () => void;
  onLogout: () => void;
  currentUser: UserSession | null;
  shopName: string;
  /** Page content: rendered next to the sidebar, below the top bar. */
  children?: React.ReactNode;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'التشغيل',
    items: [
      { id: 'dashboard', label: 'الرئيسية', icon: Home },
      { id: 'pos', label: 'الكاشير (POS)', icon: ShoppingCart },
      { id: 'inventory', label: 'المخزون والقطع', icon: Boxes },
      { id: 'invoices', label: 'الفواتير والمرتجعات', icon: Receipt },
    ],
  },
  {
    title: 'المشتريات والحسابات',
    items: [
      { id: 'purchases', label: 'فواتير المشتريات', icon: ClipboardList },
      { id: 'suppliers', label: 'الموردين والحسابات', icon: Truck },
      { id: 'customers', label: 'العملاء والورش', icon: Users },
    ],
  },
  {
    title: 'المالية والتقارير',
    items: [
      { id: 'finance', label: 'المالية والخزينة', icon: DollarSign },
      { id: 'reports', label: 'التقارير الشاملة', icon: TrendingUp },
    ],
  },
  {
    title: 'النظام',
    items: [{ id: 'settings', label: 'الإعدادات', icon: Settings }],
  },
];

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

const COLLAPSE_KEY = 'malvia.sidebar.collapsed';

/* ------------------------------------------------------------------ */
/* Sidebar body (shared by desktop sidebar and mobile drawer)          */
/* ------------------------------------------------------------------ */
interface SidebarBodyProps {
  currentTab: string;
  onSelect: (tab: ActiveTab) => void;
  shopName: string;
  collapsed: boolean;
  onLogoClick: () => void;
}

const SidebarBody: React.FC<SidebarBodyProps> = ({
  currentTab,
  onSelect,
  shopName,
  collapsed,
  onLogoClick,
}) => (
  <>
    {/* Brand */}
    <button
      onClick={onLogoClick}
      className={`flex items-center shrink-0 h-16 border-b border-slate-800 transition hover:bg-slate-800/40 ${
        collapsed ? 'justify-center px-2' : 'gap-3 px-4'
      }`}
      title="الصفحة الرئيسية"
    >
      {collapsed ? (
        <img src="/icon-192.png" alt="MALVIA" className="h-9 w-9 rounded-lg" draggable={false} />
      ) : (
        <>
          <img src="/logo-header.png" alt="MALVIA" className="h-9 w-auto shrink-0" draggable={false} />
          <span className="min-w-0 text-start">
            <span className="block text-[10px] px-1.5 py-0.5 w-fit rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-bold whitespace-nowrap">
              قطع الغيار الذكي
            </span>
            <span className="block text-xs text-slate-400 truncate mt-0.5">
              {shopName || 'مركز خدمة وقطع الغيار'}
            </span>
          </span>
        </>
      )}
    </button>

    {/* Navigation groups */}
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-4">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.title}>
          {collapsed ? (
            gi > 0 && <div className="mx-2 mb-2 border-t border-slate-800" />
          ) : (
            <div className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-slate-500">
              {group.title}
            </div>
          )}
          <ul className="space-y-1">
            {group.items.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center rounded-xl text-sm font-semibold transition whitespace-nowrap ${
                      collapsed ? 'justify-center h-11' : 'gap-3 px-3 py-2.5'
                    } ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  </>
);

/* ------------------------------------------------------------------ */
/* Small dropdown helper (closes on outside click / Escape)            */
/* ------------------------------------------------------------------ */
const useDropdown = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  activeNotificationsCount,
  onOpenNotifications,
  onOpenVoiceAssistant,
  onOpenInventoryErrors,
  onOpenCarModels,
  onOpenPhotoSharing,
  onOpenExcelModal,
  onOpenDeploymentGuide,
  onOpenInventoryAudit,
  onLogout,
  currentUser,
  shopName,
  children,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const tools = useDropdown();

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable: ignore */
      }
      return next;
    });
  };

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const currentLabel = ALL_ITEMS.find(i => i.id === currentTab)?.label ?? '';

  const toolItems = [
    { label: 'موديلات السيارات', icon: CarFront, color: 'text-amber-400', onClick: onOpenCarModels },
    { label: 'مشاركة صور القطع', icon: Camera, color: 'text-cyan-400', onClick: onOpenPhotoSharing },
    { label: 'استيراد / تصدير إكسيل', icon: FileSpreadsheet, color: 'text-emerald-400', onClick: onOpenExcelModal },
    { label: 'جرد المخزون', icon: ClipboardCheck, color: 'text-violet-400', onClick: onOpenInventoryAudit },
    { label: 'دليل النشر والتشغيل', icon: BookOpen, color: 'text-slate-300', onClick: onOpenDeploymentGuide },
  ].filter(t => typeof t.onClick === 'function');

  return (
    <div className="min-h-screen flex">
      {/* ===== Desktop sidebar (right side in RTL) ===== */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 start-0 z-40 bg-slate-900 border-e border-slate-800 transition-[width] duration-200 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <SidebarBody
          currentTab={currentTab}
          onSelect={onTabChange}
          shopName={shopName}
          collapsed={collapsed}
          onLogoClick={() => onTabChange('dashboard')}
        />
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          className={`shrink-0 flex items-center h-12 border-t border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-xs font-semibold ${
            collapsed ? 'justify-center' : 'gap-2 px-5'
          }`}
        >
          {collapsed ? <ChevronsLeft className="w-5 h-5" /> : <ChevronsRight className="w-5 h-5" />}
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </aside>

      {/* ===== Mobile drawer ===== */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] flex flex-col bg-slate-900 border-e border-slate-800 shadow-2xl">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 end-3 z-10 p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              aria-label="إغلاق القائمة"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarBody
              currentTab={currentTab}
              onSelect={tab => {
                onTabChange(tab);
                setDrawerOpen(false);
              }}
              shopName={shopName}
              collapsed={false}
              onLogoClick={() => {
                onTabChange('dashboard');
                setDrawerOpen(false);
              }}
            />
          </aside>
        </div>
      )}

      {/* ===== Content column ===== */}
      <div
        className={`flex-1 min-w-0 flex flex-col transition-[padding] duration-200 ${
          collapsed ? 'lg:ps-[72px]' : 'lg:ps-64'
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-lg">
          <div className="h-full flex items-center justify-between gap-3 px-3 sm:px-6">
            {/* Start side: menu button (mobile) + page title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition shrink-0"
                aria-label="القائمة"
              >
                <Menu className="w-5 h-5" />
              </button>
              <img
                src="/logo-header.png"
                alt="MALVIA"
                className="lg:hidden h-8 w-auto shrink-0"
                draggable={false}
              />
              <h1 className="hidden lg:block text-lg font-black text-white truncate">
                {currentLabel}
              </h1>
            </div>

            {/* End side: quick actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={onOpenInventoryErrors}
                title="أخطاء وتصحيح المخزون"
                className="p-2 sm:px-3 sm:py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition flex items-center gap-1.5 text-xs font-bold whitespace-nowrap"
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden md:inline">أخطاء المخزون</span>
              </button>

              {/* Tools dropdown */}
              {toolItems.length > 0 && (
                <div className="relative" ref={tools.ref}>
                  <button
                    onClick={() => tools.setOpen(o => !o)}
                    title="أدوات سريعة"
                    aria-haspopup="menu"
                    aria-expanded={tools.open}
                    className={`p-2 sm:px-3 sm:py-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold whitespace-nowrap ${
                      tools.open
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden md:inline">أدوات</span>
                    <ChevronDown className="hidden md:block w-3.5 h-3.5" />
                  </button>
                  {tools.open && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full mt-2 w-60 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50"
                    >
                      {toolItems.map(t => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.label}
                            role="menuitem"
                            onClick={() => {
                              tools.setOpen(false);
                              t.onClick?.();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${t.color}`} />
                            <span className="truncate">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={onOpenNotifications}
                title="الإشعارات والتنبيهات"
                className="relative p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                <Bell className="w-4 h-4" />
                {activeNotificationsCount > 0 && (
                  <span className="absolute -top-1 -left-1 min-w-5 h-5 px-1 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {activeNotificationsCount}
                  </span>
                )}
              </button>

              <button
                onClick={onOpenVoiceAssistant}
                title="المساعد الصوتي الذكي"
                className="p-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold hover:scale-105 transition shadow-lg shadow-amber-500/20"
              >
                <Mic className="w-4 h-4" />
              </button>

              {/* User + logout */}
              <div className="flex items-center gap-1 ps-2 ms-0.5 border-s border-slate-800">
                {currentUser?.employeeName && (
                  <span
                    className="hidden xl:block max-w-[140px] truncate text-xs font-semibold text-slate-300 px-1"
                    title={currentUser.role}
                  >
                    {currentUser.employeeName}
                  </span>
                )}
                <button
                  onClick={onLogout}
                  title="تسجيل الخروج"
                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 w-full max-w-[1600px] mx-auto p-3 sm:p-6">{children}</main>
      </div>

      {/* ===== Mobile bottom bar ===== */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1 text-white shadow-2xl">
        <div className="flex items-center justify-around">
          <button
            onClick={() => onTabChange('dashboard')}
            className={`flex flex-col items-center py-1 px-2 rounded-xl transition ${
              currentTab === 'dashboard' ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">الرئيسية</span>
          </button>

          <button
            onClick={() => onTabChange('pos')}
            className={`flex flex-col items-center py-1 px-2 rounded-xl transition ${
              currentTab === 'pos' ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">الكاشير</span>
          </button>

          <button
            onClick={() => onTabChange('suppliers')}
            className="flex flex-col items-center -mt-4 bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 p-3 rounded-2xl shadow-lg shadow-amber-500/30 border-2 border-slate-900 active:scale-95 transition"
            title="حسابات الموردين والدفعات"
          >
            <Truck className="w-5 h-5 stroke-[2.5]" />
            <span className="text-[9px] font-black mt-0.5">الموردين</span>
          </button>

          <button
            onClick={() => onTabChange('inventory')}
            className={`flex flex-col items-center py-1 px-2 rounded-xl transition ${
              currentTab === 'inventory' ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Boxes className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">المخزون</span>
          </button>

          <button
            onClick={() => onTabChange('invoices')}
            className={`flex flex-col items-center py-1 px-2 rounded-xl transition ${
              currentTab === 'invoices' ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">الفواتير</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
