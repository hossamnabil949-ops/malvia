import React, { useState } from 'react';
import { 
  Home, 
  ShoppingCart, 
  Boxes, 
  Receipt, 
  Truck, 
  Users, 
  DollarSign, 
  FileSpreadsheet, 
  Settings, 
  Bell, 
  Mic, 
  CarFront, 
  Camera, 
  Menu, 
  X, 
  LogOut,
  AlertTriangle
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
}

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
  shopName
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mainTabs = [
    { id: 'dashboard' as ActiveTab, label: 'الرئيسية', icon: Home },
    { id: 'pos' as ActiveTab, label: 'الكاشير (POS)', icon: ShoppingCart },
    { id: 'inventory' as ActiveTab, label: 'المخزون والقطع', icon: Boxes },
    { id: 'invoices' as ActiveTab, label: 'الفواتير والمرتجعات', icon: Receipt },
    { id: 'suppliers' as ActiveTab, label: 'الموردين والحسابات', icon: Truck },
    { id: 'purchases' as ActiveTab, label: 'فواتير المشتريات', icon: FileSpreadsheet },
    { id: 'customers' as ActiveTab, label: 'العملاء والورش', icon: Users },
    { id: 'finance' as ActiveTab, label: 'المالية والخزينة', icon: DollarSign },
    { id: 'reports' as ActiveTab, label: 'التقارير الشاملة', icon: FileSpreadsheet },
    { id: 'settings' as ActiveTab, label: 'الإعدادات', icon: Settings },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo and Shop Identity */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                aria-label="القائمة"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              <div 
                onClick={() => onTabChange('dashboard')}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition">
                  <CarFront className="w-6 h-6 text-slate-950 stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-lg text-amber-400 tracking-wide">مالفيا</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-bold hidden sm:inline-block">
                      قطع الغيار الذكي
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate max-w-[150px] sm:max-w-[220px]">
                    {shopName || 'مركز خدمة وقطع الغيار'}
                  </p>
                </div>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
              {mainTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold transition ${
                      isActive 
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25' 
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Action Buttons & Shortcuts (Shop Operations Only) */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              
              {/* Inventory Discrepancy Errors */}
              <button
                onClick={onOpenInventoryErrors}
                title="أخطاء وتصحيح المخزون"
                className="p-2 sm:px-3 sm:py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition flex items-center gap-1.5 text-xs font-bold"
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden xl:inline">أخطاء المخزون</span>
              </button>

              {/* Car Models */}
              <button
                onClick={onOpenCarModels}
                title="إدارة موديلات السيارات وتوافق القطع"
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition"
              >
                <CarFront className="w-4 h-4" />
              </button>

              {/* Photo Sharing */}
              <button
                onClick={onOpenPhotoSharing}
                title="مشاركة وتصوير القطع للعملاء"
                className="p-2 rounded-xl bg-slate-800 text-cyan-400 hover:bg-slate-700 transition"
              >
                <Camera className="w-4 h-4" />
              </button>

              {/* Excel Import/Export */}
              <button
                onClick={onOpenExcelModal}
                title="استيراد وتصدير إكسيل"
                className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>

              {/* Notifications */}
              <button
                onClick={onOpenNotifications}
                title="الإشعارات والتنبيهات"
                className="relative p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                <Bell className="w-4 h-4" />
                {activeNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {activeNotificationsCount}
                  </span>
                )}
              </button>

              {/* AI Voice Assistant */}
              <button
                onClick={onOpenVoiceAssistant}
                title="المساعد الصوتي الذكي"
                className="p-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold hover:scale-105 transition shadow-lg shadow-amber-500/20"
              >
                <Mic className="w-4 h-4" />
              </button>

              {/* User Logout */}
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

        {/* Mobile Full Menu Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-900 border-b border-slate-800 px-4 py-4 space-y-2 animate-in slide-in-from-top duration-200">
            <div className="text-xs font-bold text-slate-400 px-2 pb-1 border-b border-slate-800">
              أقسام المحل ونقاط البيع
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {mainTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      onTabChange(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold transition ${
                      isActive 
                        ? 'bg-amber-500 text-slate-950 shadow-md' 
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-bold text-slate-400 px-2 pt-3 pb-1 border-b border-slate-800">
              الأدوات السريعة
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => { onOpenInventoryErrors(); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-semibold"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>أخطاء المخزون</span>
              </button>

              <button
                onClick={() => { onOpenCarModels(); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800 text-amber-400 text-xs font-semibold"
              >
                <CarFront className="w-4 h-4" />
                <span>موديلات السيارات</span>
              </button>

              <button
                onClick={() => { onOpenPhotoSharing(); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800 text-cyan-400 text-xs font-semibold"
              >
                <Camera className="w-4 h-4" />
                <span>مشاركة الصور</span>
              </button>

              <button
                onClick={() => { onOpenExcelModal(); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-semibold"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>شيت إكسيل</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar - Clean, touch-friendly, without screens */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1 text-white shadow-2xl">
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

          {/* Special Center Quick Access: Suppliers & Accounts */}
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
    </>
  );
};
