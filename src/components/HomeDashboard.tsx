import React from 'react';
import {
  ShoppingCart,
  ClipboardList,
  Boxes,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { ActiveTab } from './Navigation';
import { AutoPart, Invoice, TreasuryTransaction, UserSession } from '../types/autoParts';

interface HomeDashboardProps {
  parts: AutoPart[];
  invoices: Invoice[];
  currentSession?: UserSession | null;
  treasuryTransactions?: TreasuryTransaction[];
  onOpenTreasuryReports?: () => void;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenInvoiceModal: (invoice: Invoice) => void;
  onAddNewPart: () => void;
  onQuickSalePart: (part: AutoPart) => void;
  onOpenNotifications: () => void;
  onOpenVoiceAssistant: () => void;
  onOpenInventoryErrors?: () => void;
  onOpenCarModels?: () => void;
  onOpenPhotoSharing?: () => void;
  onOpenExcelModal?: () => void;
  canAccessTab?: (tab: string) => boolean;
}

interface MainSection {
  id: string;
  title: string;
  description: string;
  details: string;
  tab: ActiveTab;
  permissions: string[];
  icon: LucideIcon;
  tone: string;
}

const MAIN_SECTIONS: MainSection[] = [
  {
    id: 'sales',
    title: 'المبيعات',
    description: 'كل عمليات البيع وخدمة العملاء',
    details: 'الكاشير والفواتير والمرتجعات والورديات والعملاء',
    tab: 'pos',
    permissions: ['pos', 'shifts', 'invoices', 'customers'],
    icon: ShoppingCart,
    tone: 'blue',
  },
  {
    id: 'purchases',
    title: 'المشتريات',
    description: 'إدارة الشراء والتوريد',
    details: 'فواتير الشراء والموردون وحساباتهم',
    tab: 'purchases',
    permissions: ['purchases', 'suppliers'],
    icon: ClipboardList,
    tone: 'violet',
  },
  {
    id: 'inventory',
    title: 'المخزون والمخازن',
    description: 'تحكم كامل في الأصناف والأرصدة',
    details: 'الأصناف والمخازن والجرد والتحويلات والباركود',
    tab: 'inventory',
    permissions: ['inventory', 'lowstock', 'warehouses', 'tracking'],
    icon: Boxes,
    tone: 'teal',
  },
  {
    id: 'finance',
    title: 'المالية والخزينة',
    description: 'متابعة أموال المنشأة وحساباتها',
    details: 'الخزينة والبنوك والمصروفات والإيرادات والشيكات',
    tab: 'finance',
    permissions: ['finance', 'cheques'],
    icon: Wallet,
    tone: 'emerald',
  },
  {
    id: 'reports',
    title: 'التقارير',
    description: 'تقارير وأرقام تساعدك على اتخاذ القرار',
    details: 'التقارير والتحليلات وتصدير النتائج',
    tab: 'reports',
    permissions: ['reports'],
    icon: ChartNoAxesCombined,
    tone: 'amber',
  },
  {
    id: 'settings',
    title: 'الإعدادات',
    description: 'إدارة النظام وتجهيزاته',
    details: 'بيانات المنشأة والمستخدمون والصلاحيات والإعدادات',
    tab: 'settings',
    permissions: ['settings'],
    icon: Settings,
    tone: 'slate',
  },
];

const TONE_CLASSES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100 group-hover:bg-blue-600 group-hover:text-white',
  violet: 'bg-violet-50 text-violet-700 border-violet-100 group-hover:bg-violet-600 group-hover:text-white',
  teal: 'bg-teal-50 text-teal-700 border-teal-100 group-hover:bg-teal-600 group-hover:text-white',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white',
  amber: 'bg-amber-50 text-amber-700 border-amber-100 group-hover:bg-amber-500 group-hover:text-white',
  slate: 'bg-slate-100 text-slate-700 border-slate-200 group-hover:bg-slate-700 group-hover:text-white',
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentSession,
  onChangeTab,
  canAccessTab = () => true,
}) => {
  const visibleSections = MAIN_SECTIONS.filter(section =>
    section.permissions.some(permission => canAccessTab(permission))
  );

  return (
    <main className="malvia-home-hub" data-mobile-dashboard="true" dir="rtl">
      <header className="malvia-hub-header">
        <div>
          <div className="malvia-hub-eyebrow">MALVIA BUSINESS MANAGEMENT</div>
          <h2>مرحباً {currentSession?.employeeName ? currentSession.employeeName : 'بك'} 👋</h2>
          <p>اختر القسم الذي تريد العمل عليه</p>
        </div>
        <div className="malvia-hub-mark">M</div>
      </header>

      <section className="malvia-section-grid" aria-label="الأقسام الرئيسية">
        {visibleSections.map(section => {
          const Icon = section.icon;
          const targetTab = canAccessTab(section.tab)
            ? section.tab
            : section.permissions.find(permission => canAccessTab(permission)) as ActiveTab;
          return (
            <button
              key={section.id}
              type="button"
              className="malvia-section-card group"
              onClick={() => onChangeTab(targetTab)}
              aria-label={`فتح قسم ${section.title}`}
            >
              <span className={`malvia-section-icon ${TONE_CLASSES[section.tone]}`}>
                <Icon size={27} strokeWidth={1.9} />
              </span>
              <span className="malvia-section-copy">
                <strong>{section.title}</strong>
                <span>{section.description}</span>
                <small>{section.details}</small>
              </span>
              <span className="malvia-section-arrow" aria-hidden="true">
                <ArrowLeft size={19} />
              </span>
            </button>
          );
        })}
      </section>

      {visibleSections.length === 0 && (
        <div className="malvia-hub-empty">لا توجد أقسام متاحة لحسابك. يرجى مراجعة مدير النظام.</div>
      )}
    </main>
  );
};
