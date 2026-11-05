import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Plus, 
  Printer, 
  FileDown, 
  Receipt, 
  CreditCard, 
  Banknote, 
  Zap, 
  Smartphone, 
  Clock, 
  PieChart as PieIcon,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  FileSpreadsheet,
  FileText,
  BadgeCheck,
  Building2,
  Percent,
  Download,
  Coins,
  ShieldCheck,
  Briefcase,
  History,
  Scale,
  Sparkles,
  UserPlus,
  ArrowRightLeft,
  PiggyBank
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { 
  Invoice, 
  Customer,
  Supplier,
  Expense, 
  Partner, 
  ProfitDistributionRecord, 
  PaymentMethod,
  ExpenseCategory,
  CapitalTransaction,
  CapitalTransactionType,
  PartnerWithdrawal,
  PartnerExitSettlement,
  PartnerSettlementPayment,
  TreasuryTransaction,
  AutoPart,
  SalesReturn,
  Shift
} from '../types/autoParts';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS_LIST } from '../data/autoPartsData';
import { TreasuryAccountsReport } from './TreasuryAccountsReport';
import { AuditLogPanel } from './AuditLogPanel';
import { BankLedgerView } from './BankLedgerView';
import { OpeningBalancesPanel } from './OpeningBalancesPanel';
import type { OpeningBalanceRecord } from '../utils/openingBalanceLogic';
import type { BankAccount, CardSettlementBatch, BankLedgerEntry } from '../utils/bankLedger';
import { requiresSpecificBankAccount } from '../utils/paymentMethods';

interface FinanceViewProps {
  invoices: Invoice[];
  parts?: AutoPart[];
  customers?: Customer[];
  suppliers?: Supplier[];
  salesReturns?: SalesReturn[];
  purchaseInvoices?: import('../types/autoParts').PurchaseInvoice[];
  purchaseReturns?: import('../types/autoParts').PurchaseReturn[];
  taxRegistered?: boolean;
  expenses: Expense[];
  partners: Partner[];
  distributions: ProfitDistributionRecord[];
  capitalTransactions?: CapitalTransaction[];
  treasuryTransactions?: TreasuryTransaction[];
  shifts?: Shift[];
  auditLog?: import('../types/autoParts').AuditEntry[];
  stockMovements?: import('../types/autoParts').StockMovement[];
  treasuryBalance?: number;
  bankAccounts?: BankAccount[];
  cardSettlements?: CardSettlementBatch[];
  bankLedgerEntries?: BankLedgerEntry[];
  outstandingVisaBalance?: number;
  onAddBankAccount?: (account: BankAccount) => void;
  onSettleVisa?: (batch: CardSettlementBatch) => { ok: boolean; message?: string };
  onTransferBank?: (input: { id: string; sourceBankAccountId: string; destinationBankAccountId: string; amount: number; date: string; reference: string }) => { ok: boolean; message?: string };
  canManageExpenses?: boolean;
  canManageTreasury?: boolean;
  canManagePartners?: boolean;
  partnerWithdrawals?: PartnerWithdrawal[];
  partnerExitSettlements?: PartnerExitSettlement[];
  partnerSettlementPayments?: PartnerSettlementPayment[];
  onUpdatePartnerProfile?: (partnerId: string, profile: { name: string; role: string; phone: string }) => boolean | void;
  onRecordPartnerWithdrawal?: (withdrawal: PartnerWithdrawal) => boolean | void;
  onCreatePartnerExitSettlement?: (settlement: PartnerExitSettlement) => boolean | void;
  onApprovePartnerExitSettlement?: (settlementId: string) => boolean | void;
  onRecordPartnerSettlementPayment?: (payment: PartnerSettlementPayment) => boolean | void;
  onAddExpense: (expense: Expense) => void;
  onAddDistribution: (record: ProfitDistributionRecord) => void;
  onAddPartner?: (partner: Partner, paymentMethod: string, notes: string, bankAccountId?: string) => boolean | void;
  onUpdatePartnerShare?: (partnerId: string, newSharePercentage: number) => void;
  onInjectCapital?: (partnerId: string, amount: number, paymentMethod: string, notes: string, recalculatePercentages: boolean, bankAccountId?: string) => void;
  onReinvestProfit?: (partnerId: string, amount: number, notes: string) => void;
  openingBalances?: OpeningBalanceRecord[];
  onApproveOpeningBalances?: (record: OpeningBalanceRecord) => boolean;
  canManageOpeningBalances?: boolean;
  currentUserName?: string;
}

const PAYMENT_COLORS: Record<string, string> = {
  'نقدي': '#10b981',
  'فيزا / بطاقة': '#3b82f6',
  'انستاباي / InstaPay': '#a855f7',
  'محفظة إلكترونية': '#06b6d4',
  'آجل / حساب ورشة': '#f59e0b',
};

const PARTNER_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#06b6d4'];

export const FinanceView: React.FC<FinanceViewProps> = ({
  invoices,
  parts = [],
  customers = [],
  suppliers = [],
  salesReturns = [],
  purchaseInvoices = [],
  purchaseReturns = [],
  taxRegistered = false,
  expenses,
  partners,
  distributions,
  capitalTransactions = [],
  treasuryTransactions = [],
  shifts = [],
  auditLog = [],
  stockMovements = [],
  treasuryBalance,
  onAddExpense,
  onAddDistribution,
  onAddPartner,
  onUpdatePartnerShare,
  onInjectCapital,
  onReinvestProfit,
  bankAccounts = [], cardSettlements = [], bankLedgerEntries = [], outstandingVisaBalance = 0,
  onAddBankAccount, onSettleVisa, onTransferBank,
  canManageExpenses = true, canManageTreasury = true, canManagePartners = true,
  partnerWithdrawals = [], partnerExitSettlements = [], partnerSettlementPayments = [],
  onUpdatePartnerProfile, onRecordPartnerWithdrawal, onCreatePartnerExitSettlement, onApprovePartnerExitSettlement, onRecordPartnerSettlementPayment,
  openingBalances = [], onApproveOpeningBalances, canManageOpeningBalances = false, currentUserName = 'المدير العام',
}) => {
  type FinanceTab = 'income' | 'equity' | 'treasury' | 'expenses' | 'audit' | 'bankLedger';
  const [activeFinanceTab, setActiveFinanceTab] = useState<FinanceTab>(canManagePartners ? 'equity' : canManageTreasury ? 'treasury' : 'expenses');
  const availableFinanceTabs: FinanceTab[] = [
    ...(canManagePartners ? ['equity' as FinanceTab] : []),
    ...(canManageTreasury ? ['income', 'treasury', 'bankLedger', 'audit'] as FinanceTab[] : []),
    ...(canManageExpenses ? ['expenses' as FinanceTab] : []),
  ];
  useEffect(() => {
    if (availableFinanceTabs.length && !availableFinanceTabs.includes(activeFinanceTab)) setActiveFinanceTab(availableFinanceTabs[0]);
  }, [canManageExpenses, canManageTreasury, canManagePartners, activeFinanceTab]);
  
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAddPartnerModal, setShowAddPartnerModal] = useState(false);
  const [showInjectCapitalModal, setShowInjectCapitalModal] = useState(false);
  const [showReinvestProfitModal, setShowReinvestProfitModal] = useState(false);
  const [showAdjustSharesModal, setShowAdjustSharesModal] = useState(false);
  const [partnerAction, setPartnerAction] = useState<'edit' | 'withdrawal' | 'exit' | 'payment' | null>(null);
  const [actionPartnerId, setActionPartnerId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [partnerActionAmount, setPartnerActionAmount] = useState(0);
  const [partnerActionKind, setPartnerActionKind] = useState<'withdrawal' | 'advance'>('withdrawal');
  const [partnerActionMethod, setPartnerActionMethod] = useState('نقدي');
  const [partnerActionBankId, setPartnerActionBankId] = useState('');
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
  const [exitCapital, setExitCapital] = useState(0);
  const [exitProfit, setExitProfit] = useState(0);
  const [exitOtherEntitlements, setExitOtherEntitlements] = useState(0);
  const [exitWithdrawals, setExitWithdrawals] = useState(0);
  const [exitAdvances, setExitAdvances] = useState(0);
  const [exitDeductions, setExitDeductions] = useState(0);
  const [exitDueDate, setExitDueDate] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [actionSettlementId, setActionSettlementId] = useState('');
  const [paymentTransferReference, setPaymentTransferReference] = useState('');

  const [targetPartnerId, setTargetPartnerId] = useState<string>(partners[0]?.id || '');
  
  const [activeVoucher, setActiveVoucher] = useState<{
    voucherNo: string;
    type: 'profit_distribution' | 'capital_injection' | 'profit_reinvestment';
    title: string;
    partnerName: string;
    partnerRole: string;
    sharePercentage: number;
    amount: number;
    date: string;
    paymentMethod: string;
    periodOrReason: string;
    capitalBefore?: number;
    capitalAfter?: number;
    notes?: string;
  } | null>(null);

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('إيجار المحل والمستودع');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<PaymentMethod>('نقدي');
  const [expenseBankAccountId, setExpenseBankAccountId] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerRole, setNewPartnerRole] = useState('شريك ممول ورأس المال');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  const [newPartnerInitialCapital, setNewPartnerInitialCapital] = useState<number>(100000);
  const [newPartnerPaymentMethod, setNewPartnerPaymentMethod] = useState<string>('فيزا / بطاقة');
  const [newPartnerBankAccountId, setNewPartnerBankAccountId] = useState('');
  const [newPartnerNotes, setNewPartnerNotes] = useState('حصة تأسيسية جديدة بموجب عقد الشراكة');

  const [injectAmount, setInjectAmount] = useState<number>(25000);
  const [injectPaymentMethod, setInjectPaymentMethod] = useState<string>('فيزا / بطاقة');
  const [injectBankAccountId, setInjectBankAccountId] = useState('');
  const [injectNotes, setInjectNotes] = useState('ضخ سيولة لتمويل شراء دفعة قطع غيار أصلية');

  const [distributionPaymentMethod, setDistributionPaymentMethod] = useState<string>('نقدي');
  const [distributionBankAccountId, setDistributionBankAccountId] = useState('');
  const [reinvestAmount, setReinvestAmount] = useState<number>(5000);
  const [reinvestNotes, setReinvestNotes] = useState('رسملة الأرباح الدورية وإضافتها لحصة رأس المال المستثمر');

  React.useEffect(() => {
    if (!targetPartnerId && partners.length > 0) setTargetPartnerId(partners[0].id);
  }, [partners, targetPartnerId]);

  const activePartners = partners.filter(partner => (partner.status || 'ACTIVE') === 'ACTIVE');
  const currentPartnerCapitalTotal = activePartners.reduce((sum, partner) =>
    sum + (partner.totalCurrentCapital || partner.initialCapital + (partner.addedCapital || 0) + (partner.reinvestedProfits || 0)), 0);
  const newPartnerSharePercent = currentPartnerCapitalTotal + newPartnerInitialCapital > 0
    ? Number(((newPartnerInitialCapital / (currentPartnerCapitalTotal + newPartnerInitialCapital)) * 100).toFixed(4))
    : 0;

  // تكلفة البضاعة المباعة من تكلفة كل صنف مباع فعلياً:
  // 1) تكلفة الوحدة المسجلة في الفاتورة وقت البيع، وإلا
  // 2) تكلفة الصنف الحالية من المخزون (بالمطابقة برقم القطعة)، وإلا
  // 3) تقدير 70% من سعر البيع (ويُنبَّه المستخدم لعدد هذه البنود).
  const { totalSalesRevenue, estimatedCOGS, estimatedCostItemsCount } = useMemo(() => {
    const norm = (v: string) => (v || '').toLowerCase().replace(/[\s\-_.\/]/g, '');
    const costByPart = new Map<string, number>();
    parts.forEach((p) => costByPart.set(norm(p.partNumber), p.costPrice));

    let revenue = 0;
    let cogs = 0;
    let estimatedCount = 0;

    invoices.forEach((inv) => {
      if (inv.status === 'ملغاة') return;
      // Revenue is recorded before VAT: tax collected from customers is not business income.
      revenue += Math.max(0, inv.subtotal - inv.discount);
      inv.items.forEach((it) => {
        let unitCost = it.costPrice;
        if (unitCost === undefined) unitCost = costByPart.get(norm(it.partNumber));
        if (unitCost === undefined) {
          // Never invent a 70% cost estimate: missing cost must be visible as incomplete data.
          unitCost = 0;
          estimatedCount += 1;
        }
        cogs += unitCost * it.quantity;
      });
    });

    // المرتجعات: تُخصم من الإيراد، وتكلفة القطع المرتجعة تُخصم من التكلفة
    const voidedIds = new Set(invoices.filter(i => i.status === 'ملغاة').map(i => i.id));
    salesReturns.forEach((ret) => {
      if (voidedIds.has(ret.invoiceId)) return; // فاتورة ملغاة: خرجت كلها من الإيراد والتكلفة ولا تُخصم مرتجعاتها مرتين
      const original = invoices.find(inv => inv.id === ret.invoiceId);
      const refundBeforeTax = original && original.grandTotal > 0
        ? (ret.totalRefundAmount || 0) * (Math.max(0, original.subtotal - original.discount) / original.grandTotal)
        : 0;
      revenue -= refundBeforeTax;
      ret.items.forEach((it) => {
        const unitCost = costByPart.get(norm(it.partNumber)) ?? 0;
        cogs -= unitCost * it.quantity;
      });
    });

    return {
      totalSalesRevenue: Math.max(0, revenue),
      estimatedCOGS: Math.max(0, Math.round(cogs)),
      estimatedCostItemsCount: estimatedCount,
    };
  }, [invoices, parts, salesReturns]);

  const grossProfit = totalSalesRevenue - estimatedCOGS;
  const netVatDue = useMemo(() => {
    if (!taxRegistered) return 0;
    const outputVat = invoices.filter(inv => inv.status !== 'ملغاة').reduce((sum, inv) => sum + (inv.tax || 0), 0);
    const outputVatReturns = salesReturns.reduce((sum, ret) => {
      const original = invoices.find(inv => inv.id === ret.invoiceId);
      return original && original.status !== 'ملغاة' && original.grandTotal > 0
        ? sum + ret.totalRefundAmount * ((original.tax || 0) / original.grandTotal)
        : sum;
    }, 0);
    const inputVat = purchaseInvoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
    const inputVatReturns = purchaseReturns.reduce((sum, ret) => {
      const original = purchaseInvoices.find(inv => inv.id === ret.purchaseInvoiceId);
      return original && original.grandTotal > 0
        ? sum + ret.totalReturnAmount * ((original.tax || 0) / original.grandTotal)
        : sum;
    }, 0);
    return Math.round((outputVat - outputVatReturns - inputVat + inputVatReturns) * 100) / 100;
  }, [taxRegistered, invoices, salesReturns, purchaseInvoices, purchaseReturns]);
  // نسبة الربح على أساس التكلفة وليس سعر البيع
  const grossProfitMargin = estimatedCOGS > 0 ? ((grossProfit / estimatedCOGS) * 100).toFixed(1) : '0';

  const totalOperatingExpenses = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses]);

  // VAT is excluded from sales revenue above; do not deduct the VAT liability from profit again.
  const netDistributableProfit = Math.max(0, grossProfit - totalOperatingExpenses);
  const netProfitMargin = estimatedCOGS > 0 ? ((netDistributableProfit / estimatedCOGS) * 100).toFixed(1) : '0';

  const totalInitialCapital = useMemo(() => {
    return activePartners.reduce((sum, p) => sum + (p.initialCapital || 0), 0);
  }, [activePartners]);

  const totalAddedCapital = useMemo(() => {
    return activePartners.reduce((sum, p) => sum + (p.addedCapital || 0), 0);
  }, [activePartners]);

  const totalReinvestedProfits = useMemo(() => {
    return activePartners.reduce((sum, p) => sum + (p.reinvestedProfits || 0), 0);
  }, [activePartners]);

  const totalCurrentCapital = useMemo(() => {
    return activePartners.reduce((sum, p) => {
      const current = p.totalCurrentCapital || (p.initialCapital + (p.addedCapital || 0) + (p.reinvestedProfits || 0));
      return sum + current - (p.totalWithdrawn || 0);
    }, 0);
  }, [activePartners]);

  const totalEquity = totalCurrentCapital + netDistributableProfit;

  const paymentBreakdown = useMemo(() => {
    const counts: Record<string, { total: number; count: number }> = {
      'نقدي': { total: 0, count: 0 },
      'فيزا / بطاقة': { total: 0, count: 0 },
      'انستاباي / InstaPay': { total: 0, count: 0 },
      'محفظة إلكترونية': { total: 0, count: 0 },
      'آجل / حساب ورشة': { total: 0, count: 0 },
    };
    const classify = (method: string): string | null => {
      const m = String(method || '').trim().toLowerCase();
      if (m.includes('آجل') || m.includes('credit') || m.includes('حساب ورشة')) return 'آجل / حساب ورشة';
      if (m.includes('فيزا') || m.includes('بطاقة') || m.includes('شبكة') || m.includes('مدى') || m.includes('visa') || m.includes('card')) return 'فيزا / بطاقة';
      if (m.includes('انستا') || m.includes('إنستا') || m.includes('insta')) return 'انستاباي / InstaPay';
      if (m.includes('محفظ') || m.includes('فودافون') || m.includes('wallet')) return 'محفظة إلكترونية';
      if (m.includes('نقد') || m.includes('كاش') || m === 'cash') return 'نقدي';
      return null;
    };

    invoices.filter(inv => inv.status !== 'ملغاة').forEach(inv => {
      const splitPayments = Array.isArray(inv.payments) && inv.payments.length
        ? inv.payments
        : [{ method: inv.paymentMethod, amount: Math.max(0, inv.grandTotal - (inv.creditAmount || 0)) }];
      const paid = splitPayments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
      const returned = Math.min(paid, Math.max(0, Number(inv.returnedAmount || 0)));
      const factor = paid > 0 ? (paid - returned) / paid : 1;
      const invoiceKeys = new Set<string>();
      splitPayments.forEach(payment => {
        const key = classify(String(payment.method));
        if (!key) return;
        const amount = Math.max(0, Number(payment.amount) || 0) * factor;
        counts[key].total += amount;
        if (amount > 0) invoiceKeys.add(key);
      });
      const credit = Math.max(0, Number(inv.creditAmount || 0));
      if (credit > 0) {
        counts['آجل / حساب ورشة'].total += credit;
        invoiceKeys.add('آجل / حساب ورشة');
      }
      invoiceKeys.forEach(key => { counts[key].count += 1; });
    });

    return [
      { name: 'نقدي (كاش بالخزينة)', amount: counts['نقدي'].total, count: counts['نقدي'].count, key: 'نقدي' },
      { name: 'فيزا ومدى (الحساب البنكي)', amount: counts['فيزا / بطاقة'].total, count: counts['فيزا / بطاقة'].count, key: 'فيزا / بطاقة' },
      { name: 'انستاباي InstaPay', amount: counts['انستاباي / InstaPay'].total, count: counts['انستاباي / InstaPay'].count, key: 'انستاباي / InstaPay' },
      { name: 'محافظ إلكترونية كاش', amount: counts['محفظة إلكترونية'].total, count: counts['محفظة إلكترونية'].count, key: 'محفظة إلكترونية' },
      { name: 'ذمم مدينة (آجل ورش)', amount: counts['آجل / حساب ورشة'].total, count: counts['آجل / حساب ورشة'].count, key: 'آجل / حساب ورشة' },
    ];
  }, [invoices]);

  const totalLiquidFunds = useMemo(() => {
    return paymentBreakdown
      .filter((pb) => pb.key !== 'آجل / حساب ورشة')
      .reduce((sum, pb) => sum + pb.amount, 0) - totalOperatingExpenses;
  }, [paymentBreakdown, totalOperatingExpenses]);

  const partnerPieData = useMemo(() => {
    return activePartners.map((p, idx) => ({
      name: p.name,
      value: p.sharePercentage,
      capital: p.totalCurrentCapital || (p.initialCapital + (p.addedCapital || 0) + (p.reinvestedProfits || 0)),
      color: PARTNER_COLORS[idx % PARTNER_COLORS.length],
    }));
  }, [activePartners]);

  const selectedTargetPartner = useMemo(() => {
    return activePartners.find((p) => p.id === targetPartnerId) || activePartners[0];
  }, [activePartners, targetPartnerId]);

  const targetPartnerProfitShare = useMemo(() => {
    if (!selectedTargetPartner) return 0;
    return Number(((netDistributableProfit * selectedTargetPartner.sharePercentage) / 100).toFixed(2));
  }, [netDistributableProfit, selectedTargetPartner]);

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || expenseAmount <= 0) return;

    const newExp: Expense = {
      id: `exp-${Date.now()}`,
      title: expenseTitle.trim(),
      category: expenseCategory,
      amount: expenseAmount,
      date: new Date().toISOString().split('T')[0],
      paymentMethod: expensePaymentMethod,
      bankAccountId: requiresSpecificBankAccount(expensePaymentMethod) ? expenseBankAccountId : undefined,
      notes: expenseNotes,
      recordedBy: 'المحاسب المالي',
    };

    onAddExpense(newExp);
    setExpenseTitle('');
    setExpenseAmount(0);
    setExpenseNotes('');
    setShowAddExpenseModal(false);
  };

  const handleExecuteDistribution = () => {
    if (netDistributableProfit <= 0) return;
    if (requiresSpecificBankAccount(distributionPaymentMethod) && !bankAccounts.some(account => account.id === distributionBankAccountId && account.active)) return;

    const record: ProfitDistributionRecord = {
      id: `dist-${Date.now()}`,
      period: `دورة ${new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`,
      date: new Date().toISOString().split('T')[0],
      totalSales: totalSalesRevenue,
      costOfGoodsSold: estimatedCOGS,
      grossProfit: grossProfit,
      totalExpenses: totalOperatingExpenses,
      netProfit: netDistributableProfit,
      paymentMethod: distributionPaymentMethod,
      bankAccountId: requiresSpecificBankAccount(distributionPaymentMethod) ? distributionBankAccountId : undefined,
      partnerShares: activePartners.map((p) => ({
        partnerId: p.id,
        partnerName: p.name,
        percentage: p.sharePercentage,
        shareAmount: Number(((netDistributableProfit * p.sharePercentage) / 100).toFixed(2)),
      })),
    };

    onAddDistribution(record);
    setShowDistributeModal(false);
  };

  const handleSubmitAddPartner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName.trim() || newPartnerInitialCapital <= 0 || newPartnerSharePercent <= 0) return;

    const newPartner: Partner = {
      id: `part-${Date.now()}`,
      name: newPartnerName.trim(),
      role: newPartnerRole,
      phone: newPartnerPhone || '0100000000',
      sharePercentage: newPartnerSharePercent,
      initialCapital: newPartnerInitialCapital,
      addedCapital: 0,
      reinvestedProfits: 0,
      totalCurrentCapital: newPartnerInitialCapital,
      totalWithdrawn: 0,
      joinDate: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
    };

    if (onAddPartner && onAddPartner(newPartner, newPartnerPaymentMethod, newPartnerNotes, requiresSpecificBankAccount(newPartnerPaymentMethod) ? newPartnerBankAccountId : undefined) === false) return;

    setShowAddPartnerModal(false);
    setNewPartnerName('');
    setNewPartnerInitialCapital(100000);
  };

  const handleSubmitInjectCapital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetPartner || injectAmount <= 0) return;
    if (requiresSpecificBankAccount(injectPaymentMethod) && !bankAccounts.some(account => account.id === injectBankAccountId && account.active)) return;

    const currentCap = selectedTargetPartner.totalCurrentCapital || (selectedTargetPartner.initialCapital + (selectedTargetPartner.addedCapital || 0) + (selectedTargetPartner.reinvestedProfits || 0));
    const newCap = currentCap + injectAmount;

    if (onInjectCapital) {
      onInjectCapital(
        selectedTargetPartner.id,
        injectAmount,
        injectPaymentMethod,
        injectNotes,
        true,
        requiresSpecificBankAccount(injectPaymentMethod) ? injectBankAccountId : undefined
      );
    }

    setActiveVoucher({
      voucherNo: `CAP-${Math.floor(10000 + Math.random() * 90000)}`,
      type: 'capital_injection',
      title: 'سند إيداع وتوريد رأس مال إضافي (زيادة حصة)',
      partnerName: selectedTargetPartner.name,
      partnerRole: selectedTargetPartner.role,
      sharePercentage: selectedTargetPartner.sharePercentage,
      amount: injectAmount,
      date: new Date().toLocaleDateString('ar-EG'),
      paymentMethod: injectPaymentMethod,
      periodOrReason: injectNotes || 'ضخ سيولة رأسمالية لزيادة حصة الشريك',
      capitalBefore: currentCap,
      capitalAfter: newCap,
      notes: 'تم قيد المبلغ في حساب رأس المال العامل وحقوق الملكية للمؤسسة بنجاح'
    });

    setShowInjectCapitalModal(false);
  };

  const handleSubmitReinvestProfit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetPartner || reinvestAmount <= 0) return;

    const currentCap = selectedTargetPartner.totalCurrentCapital || (selectedTargetPartner.initialCapital + (selectedTargetPartner.addedCapital || 0) + (selectedTargetPartner.reinvestedProfits || 0));
    const newCap = currentCap + reinvestAmount;

    if (onReinvestProfit) {
      onReinvestProfit(selectedTargetPartner.id, reinvestAmount, reinvestNotes);
    }

    setActiveVoucher({
      voucherNo: `CAP-REIN-${Math.floor(10000 + Math.random() * 90000)}`,
      type: 'profit_reinvestment',
      title: 'سند قيد واحتجاز أرباح في رأس المال (رسملة أرباح الشريك)',
      partnerName: selectedTargetPartner.name,
      partnerRole: selectedTargetPartner.role,
      sharePercentage: selectedTargetPartner.sharePercentage,
      amount: reinvestAmount,
      date: new Date().toLocaleDateString('ar-EG'),
      paymentMethod: 'حساب الأرباح المحتجزة / رأس المال',
      periodOrReason: reinvestNotes || 'رسملة الأرباح الدورية وضخها بحصة رأس المال',
      capitalBefore: currentCap,
      capitalAfter: newCap,
      notes: 'تم تحويل حصة الأرباح من الصرف النقدي وإضافتها رسمياً إلى رأس مال الشريك الدائم'
    });

    setShowReinvestProfitModal(false);
  };


  const openPartnerAction = (partner: Partner, action: 'edit' | 'withdrawal' | 'exit') => {
    setActionPartnerId(partner.id);
    setPartnerAction(action);
    setProfileName(partner.name); setProfileRole(partner.role); setProfilePhone(partner.phone);
    setPartnerActionAmount(0); setPartnerActionKind('withdrawal'); setPartnerActionMethod('نقدي'); setPartnerActionBankId('');
    setExitDate(new Date().toISOString().slice(0, 10)); setExitCapital(partner.totalCurrentCapital || partner.initialCapital || 0);
    const priorPartnerMovements = partnerWithdrawals.filter(w => w.partnerId === partner.id && w.date <= new Date().toISOString().slice(0,10));
    setExitProfit(0); setExitOtherEntitlements(0); setExitWithdrawals(priorPartnerMovements.filter(w => w.kind === 'withdrawal').reduce((sum,w) => sum + w.amount, 0)); setExitAdvances(priorPartnerMovements.filter(w => w.kind === 'advance').reduce((sum,w) => sum + w.amount, 0)); setExitDeductions(0); setExitDueDate(''); setExitNotes('');
  };

  const submitPartnerAction = (e: React.FormEvent) => {
    e.preventDefault();
    const partner = partners.find(p => p.id === actionPartnerId);
    if (!partner || !partnerAction) return;
    if (partnerAction === 'edit') {
      if (!profileName.trim() || !profilePhone.trim()) return;
      if (onUpdatePartnerProfile?.(partner.id, { name: profileName.trim(), role: profileRole.trim(), phone: profilePhone.trim() }) === false) return;
    } else if (partnerAction === 'withdrawal') {
      if (!Number.isFinite(partnerActionAmount) || partnerActionAmount <= 0) return;
      if (requiresSpecificBankAccount(partnerActionMethod) && !bankAccounts.some(a => a.id === partnerActionBankId && a.active)) return;
      const record: PartnerWithdrawal = { id: `PW-${Date.now()}`, partnerId: partner.id, partnerName: partner.name, kind: partnerActionKind, amount: partnerActionAmount, date: new Date().toISOString().slice(0,10), paymentMethod: partnerActionMethod, bankAccountId: requiresSpecificBankAccount(partnerActionMethod) ? partnerActionBankId : undefined, notes: '', recordedBy: currentUserName };
      if (onRecordPartnerWithdrawal?.(record) === false) return;
    } else if (partnerAction === 'exit') {
      const netPayable = Number((exitCapital + exitProfit + exitOtherEntitlements - exitWithdrawals - exitAdvances - exitDeductions).toFixed(2));
      if (netPayable < 0) { window.alert('صافي التسوية لا يمكن أن يكون سالباً؛ راجع الاستحقاقات والخصومات.'); return; }
      const record: PartnerExitSettlement = { id: `PXS-${Date.now()}`, partnerId: partner.id, partnerName: partner.name, exitDate, capitalEntitlement: exitCapital, profitEntitlement: exitProfit, otherEntitlements: exitOtherEntitlements, withdrawalsDeducted: exitWithdrawals, advancesDeducted: exitAdvances, otherDeductions: exitDeductions, netPayable, status: 'draft', notes: exitNotes, createdAt: new Date().toISOString(), createdBy: currentUserName, dueDate: exitDueDate || undefined };
      if (onCreatePartnerExitSettlement?.(record) === false) return;
    } else if (partnerAction === 'payment') {
      const settlement = partnerExitSettlements.find(s => s.id === actionSettlementId);
      const paid = partnerSettlementPayments.filter(p => p.settlementId === actionSettlementId).reduce((sum, p) => sum + p.amount, 0);
      const remaining = (settlement?.netPayable || 0) - paid;
      if (!settlement || partnerActionAmount <= 0 || partnerActionAmount > remaining + 0.0001) { window.alert('المبلغ يتجاوز المستحق المتبقي أو غير صالح.'); return; }
      if (requiresSpecificBankAccount(partnerActionMethod) && !bankAccounts.some(a => a.id === partnerActionBankId && a.active)) return;
      const payment: PartnerSettlementPayment = { id: `PX-PAY-${Date.now()}`, settlementId: settlement.id, partnerId: settlement.partnerId, amount: partnerActionAmount, date: new Date().toISOString().slice(0,10), paymentMethod: partnerActionMethod, bankAccountId: requiresSpecificBankAccount(partnerActionMethod) ? partnerActionBankId : undefined, transferReference: paymentTransferReference.trim() || undefined, receiptNumber: `PX-R-${Date.now()}`, notes: '', recordedBy: currentUserName };
      if (onRecordPartnerSettlementPayment?.(payment) === false) return;
    }
    setPartnerAction(null);
  };

  const handleSaveAdjustedShares = () => {
    if (onUpdatePartnerShare) {
      Object.entries(editingShares).forEach(([partnerId, share]) => {
        onUpdatePartnerShare(partnerId, share);
      });
    }
    setShowAdjustSharesModal(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12 animate-fadeIn" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 border border-neutral-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" />
              <span>نظام المحاسبة ورأس المال والشركاء</span>
            </span>
            <span className="text-neutral-500 text-xs font-mono">النسخة المالية الشاملة 2026</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white mt-2">
            إدارة رأس المال وحقوق الملكية والعمليات المالية
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            متابعة رأس المال التأسيسي، زيادة الحصص، رسملة أرباح الشركاء، قائمة الدخل، وأنظمة الدفع المعتمدة
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManageExpenses && <button
            onClick={() => setShowAddExpenseModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-surface-3 hover:bg-surface-4 text-white border border-neutral-700 font-bold text-xs transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>تسجيل مصروف</span>
          </button>}

          {(canManageTreasury || canManagePartners) && <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-black text-xs transition-all shadow-md active:scale-95"
          >
            <FileText className="w-4 h-4" />
            <span>القوائم المالية الختامية</span>
          </button>}
        </div>
      </div>

      {availableFinanceTabs.length > 1 && <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 border-b border-neutral-800 pb-3">
        {[
          ...(canManagePartners ? [{ id: 'equity', label: 'رأس المال والشركاء وحصص الملكية', icon: Users, badge: `${partners.length} شركاء` }] : []),
          ...(canManageTreasury ? [
            { id: 'income', label: 'قائمة الدخل والأرباح (P&L)', icon: TrendingUp },
            { id: 'treasury', label: 'أنظمة الدفع والخزينة', icon: Banknote },
            { id: 'bankLedger', label: 'الحسابات البنكية والتسويات', icon: Building2 },
            { id: 'audit', label: 'سجل التدقيق وحركات المخزون', icon: FileText },
          ] : []),
          ...(canManageExpenses ? [{ id: 'expenses', label: 'سجل المصروفات التشغيلية', icon: TrendingDown }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFinanceTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFinanceTab(tab.id as any)}
              className={`w-full min-w-0 min-h-[58px] flex items-center justify-start gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-right whitespace-normal leading-snug transition-all border ${
                isActive
                  ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-md'
                  : 'bg-surface-2 text-neutral-300 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="min-w-0 flex-1">{tab.label}</span>
              {tab.badge && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-neutral-950/20 text-neutral-900 font-black' : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>}

      {activeFinanceTab === 'bankLedger' && canManageTreasury && onAddBankAccount && onSettleVisa && (
        <BankLedgerView accounts={bankAccounts} settlements={cardSettlements} entries={bankLedgerEntries} outstandingVisaBalance={outstandingVisaBalance} onAddBankAccount={onAddBankAccount} onSettleVisa={onSettleVisa} onTransferBank={onTransferBank} />
      )}

      {activeFinanceTab === 'equity' && canManagePartners && (
        <div className="space-y-6">
          {canManageOpeningBalances && onApproveOpeningBalances && <OpeningBalancesPanel existing={openingBalances} partners={partners} parts={parts} bankAccounts={bankAccounts} customers={customers} suppliers={suppliers} currentUser={currentUserName} onApprove={onApproveOpeningBalances} />}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-3xl bg-surface-2 border border-neutral-800 relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>رأس المال التأسيسي الأول</span>
                <Building2 className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xl md:text-2xl font-black text-amber-400 font-mono mt-1.5 block">
                {totalInitialCapital.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 mt-1 block">
                مجموع الحصص الأصلية المودعة عند التأسيس
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-surface-2 border border-neutral-800 relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>رأس المال الإضافي المجرى ضخه</span>
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xl md:text-2xl font-black text-amber-400 font-mono mt-1.5 block">
                +{totalAddedCapital.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 mt-1 block">
                سيولة نقدية ضخها الشركاء لزيادة الحصص
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-surface-2 border border-neutral-800 relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span>الأرباح المعادة رسملتها</span>
                <PiggyBank className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-xl md:text-2xl font-black text-emerald-400 font-mono mt-1.5 block">
                +{totalReinvestedProfits.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 mt-1 block">
                أرباح دخلت برأس المال بدلاً من سحبها
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-950/40 to-surface-2 border border-emerald-500/40 relative overflow-hidden">
              <div className="flex items-center justify-between text-emerald-400 text-xs font-bold">
                <span>إجمالي حقوق الملكية الحالية</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-xl md:text-2xl font-black text-emerald-400 font-mono mt-1.5 block">
                {totalEquity.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-emerald-500/80 mt-1 block">
                رأس المال الفعلي ({totalCurrentCapital.toLocaleString()}) + أرباح الدورة
              </span>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase mb-1">
                <Sparkles className="w-4 h-4" />
                <span>إجراءات رأس المال والشركاء المحاسبية</span>
              </div>
              <h3 className="text-base font-bold text-white">
                تعديل الحصص، ضخ سيولة إضافية، ورسملة أرباح الشركاء
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                يمكن لكل شريك زيادة حصته بضخ أموال جديدة أو تحويل أرباحه المكتسبة لحصة رأس المال مباشرة
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowAddPartnerModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-surface-3 hover:bg-surface-4 text-amber-300 border border-amber-500/30 font-bold text-xs transition-all shadow-sm active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة شريك جديد</span>
              </button>

              <button
                onClick={() => {
                  setTargetPartnerId(partners[0]?.id || '');
                  setShowInjectCapitalModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-surface-3 hover:bg-surface-4 text-amber-300 border border-amber-500/30 font-bold text-xs transition-all shadow-sm active:scale-95"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>ضخ رأس مال إضافي</span>
              </button>

              <button
                onClick={() => {
                  setTargetPartnerId(partners[0]?.id || '');
                  setShowReinvestProfitModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-emerald-950/40 hover:bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition-all shadow-sm active:scale-95"
              >
                <PiggyBank className="w-4 h-4" />
                <span>رسملة الأرباح (إدخالها برأس المال)</span>
              </button>

              <span className="text-[11px] text-neutral-500 self-center">النسب محسوبة تلقائيًا من مساهمات رأس المال</span>

              <button
                onClick={() => setShowDistributeModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
              >
                <Receipt className="w-4 h-4" />
                <span>توزيع الأرباح النقدية</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="p-6 rounded-3xl bg-surface-2 border border-neutral-800 space-y-4 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">توزيع نسب الملكية وحصص الشركاء</h4>
                </div>
                <span className="text-[11px] font-mono text-neutral-400">100% الإجمالي</span>
              </div>

              <div className="h-56 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={partnerPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {partnerPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any, name: any) => [`${val}% من الأرباح والملكية`, name]}
                      contentStyle={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-neutral-700)', borderRadius: '12px', fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-neutral-400">رأس المال الفعلي</span>
                  <span className="font-mono font-black text-amber-400 text-sm">{totalCurrentCapital.toLocaleString()}</span>
                  <span className="text-[9px] text-neutral-500">ج.م</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                {partnerPieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-neutral-300 font-semibold">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-neutral-400 text-[11px]">{item.capital.toLocaleString()} ج.م</span>
                      <span className="font-bold text-white">%{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>تفاصيل حسابات الشركاء ورؤوس أموالهم الحالية</span>
                </h4>
                <span className="text-xs text-neutral-400">
                  صافي الربح القابل للتوزيع حالياً: <strong className="text-emerald-400 font-mono">{netDistributableProfit.toLocaleString()} ج.م</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {partners.map((partner, idx) => {
                  const partnerShareAmount = (partner.status || 'ACTIVE') === 'ACTIVE' ? Number(((netDistributableProfit * partner.sharePercentage) / 100).toFixed(2)) : 0;
                  const currentCapital = partner.totalCurrentCapital || (partner.initialCapital + (partner.addedCapital || 0) + (partner.reinvestedProfits || 0));

                  return (
                    <div
                      key={partner.id}
                      className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 hover:border-neutral-700 transition-all space-y-4 shadow-lg relative overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARTNER_COLORS[idx % PARTNER_COLORS.length] }} />
                              <h5 className="text-sm font-bold text-white">{partner.name}</h5>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5">{partner.role}</p>
                            <span className="text-[10px] text-neutral-500 font-mono">جوال: {partner.phone} | انضم: {partner.joinDate || '2026-01-01'}</span>
                          </div>

                          <div className="text-left rtl:text-right">
                            <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 block text-center">
                              %{partner.sharePercentage}
                            </span>
                            <span className="text-[10px] text-neutral-500 block text-center mt-1">نسبة الحصة</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-surface-1 border border-neutral-800/80 space-y-2 text-xs mt-3.5">
                          <div className="flex justify-between items-center pb-2 border-b border-neutral-800 font-bold">
                            <span className="text-amber-300">إجمالي رأس مال الشريك الحالي:</span>
                            <span className="font-mono text-base text-amber-400 font-black">
                              {currentCapital.toLocaleString()} ج.م
                            </span>
                          </div>

                          <div className="flex justify-between text-neutral-400 text-[11px]">
                            <span>• رأس المال التأسيسي الأول:</span>
                            <span className="font-mono text-neutral-200">{partner.initialCapital.toLocaleString()} ج.م</span>
                          </div>

                          <div className="flex justify-between text-neutral-400 text-[11px]">
                            <span>• رأس المال الإضافي المجرى ضخه:</span>
                            <span className="font-mono text-amber-400">+{((partner.addedCapital || 0)).toLocaleString()} ج.م</span>
                          </div>

                          <div className="flex justify-between text-neutral-400 text-[11px]">
                            <span>• الأرباح المعادة رسملتها بالحصة:</span>
                            <span className="font-mono text-emerald-400">+{((partner.reinvestedProfits || 0)).toLocaleString()} ج.م</span>
                          </div>

                          <div className="pt-2 border-t border-neutral-800/60 flex justify-between items-center text-xs">
                            <span className="text-emerald-400 font-bold">الأرباح المستحقة للدورة الحالية:</span>
                            <span className="font-mono font-black text-emerald-400 text-sm">
                              {partnerShareAmount.toLocaleString()} ج.م
                            </span>
                          </div>

                          <div className="flex justify-between text-neutral-500 text-[10px]">
                            <span>إجمالي المسحوبات النقدية السابقة:</span>
                            <span className="font-mono text-neutral-400">{partner.totalWithdrawn.toLocaleString()} ج.م</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-800 grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => {
                            setTargetPartnerId(partner.id);
                            setShowInjectCapitalModal(true);
                          }}
                          className="py-2 px-1 rounded-xl bg-surface-3 hover:bg-surface-4 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                          title="ضخ أموال جديدة وزيادة الحصة"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>ضخ رأس مال</span>
                        </button>

                        <button
                          onClick={() => {
                            setTargetPartnerId(partner.id);
                            setShowReinvestProfitModal(true);
                          }}
                          className="py-2 px-1 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/40 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                          title="إدخال أرباح الشريك في رأس المال"
                        >
                          <PiggyBank className="w-3.5 h-3.5" />
                          <span>رسملة الأرباح</span>
                        </button>

                        <button
                          onClick={() => {
                            setActiveVoucher({
                              voucherNo: `VOUCH-${Math.floor(1000 + Math.random() * 9000)}`,
                              type: 'profit_distribution',
                              title: 'سند صرف وتوزيع أرباح دورية لشريك',
                              partnerName: partner.name,
                              partnerRole: partner.role,
                              sharePercentage: partner.sharePercentage,
                              amount: partnerShareAmount,
                              date: new Date().toLocaleDateString('ar-EG'),
                              paymentMethod: 'تحويل بنكي فوري (سريع / آيبان)',
                              periodOrReason: 'أرباح دورة المبيعات الحالية (بعد خصم التكاليف)',
                              capitalBefore: currentCapital,
                              capitalAfter: currentCapital,
                              notes: 'تم اعتماد الصرف بالتحويل البنكي لحساب الشريك المعتمد'
                            });
                          }}
                          className="py-2 px-1 rounded-xl bg-surface-3 hover:bg-surface-4 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                          title="طباعة سند صرف أرباح دورية"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>سند الصرف</span>
                        </button>
                        <button onClick={() => openPartnerAction(partner, 'edit')} className="py-2 px-1 rounded-xl bg-surface-3 text-sky-300 text-[11px] font-bold">تعديل البيانات</button>
                        {(partner.status || 'ACTIVE') === 'ACTIVE' && <button onClick={() => openPartnerAction(partner, 'withdrawal')} className="py-2 px-1 rounded-xl bg-surface-3 text-orange-300 text-[11px] font-bold">مسحوبات / سلفة</button>}
                        {(partner.status || 'ACTIVE') === 'ACTIVE' && <button onClick={() => openPartnerAction(partner, 'exit')} className="py-2 px-1 rounded-xl bg-rose-950/40 text-rose-300 text-[11px] font-bold">بدء التخارج</button>}
                        {(partner.status || 'ACTIVE') !== 'ACTIVE' && <span className="col-span-3 text-center text-[11px] text-rose-300 py-2">الشريك غير نشط — {partner.exitDate || 'بانتظار اعتماد التخارج'}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {partnerExitSettlements.length > 0 && canManagePartners && (
        <div className="p-5 rounded-3xl bg-surface-2 border border-neutral-800 space-y-3">
          <h3 className="text-sm font-bold text-white">تسويات تخارج الشركاء والمبالغ المستحقة</h3>
          {partnerExitSettlements.map(settlement => {
            const paid = partnerSettlementPayments.filter(p => p.settlementId === settlement.id).reduce((sum,p) => sum + p.amount, 0);
            const remaining = Math.max(0, settlement.netPayable - paid);
            return <div key={settlement.id} className="p-3 rounded-2xl bg-surface-1 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="text-xs space-y-1"><strong className="text-white">{settlement.partnerName}</strong><p className="text-neutral-400">تاريخ التخارج: {settlement.exitDate} · صافي المستحق: {settlement.netPayable.toLocaleString()} ج.م</p><p className="text-neutral-400">مدفوع: {paid.toLocaleString()} · متبقي: <b className="text-amber-300">{remaining.toLocaleString()} ج.م</b></p><span className="text-[10px] text-neutral-500">الحالة: {settlement.status === 'draft' ? 'مسودة — لم يعتمد التخارج' : settlement.status === 'approved' ? 'معتمد' : settlement.status === 'partially_paid' ? 'مسدد جزئياً' : settlement.status === 'paid' ? 'مسدد بالكامل' : 'ملغي'}</span></div>
              <div className="flex gap-2">{settlement.status === 'draft' && <button onClick={() => { if (window.confirm('اعتماد التخارج وإيقاف استحقاق الأرباح من تاريخ التخارج؟')) onApprovePartnerExitSettlement?.(settlement.id); }} className="px-3 py-2 rounded-xl bg-amber-500 text-neutral-950 text-xs font-bold">اعتماد التخارج</button>}{['approved','partially_paid'].includes(settlement.status) && remaining > 0 && <button onClick={() => { setActionSettlementId(settlement.id); setActionPartnerId(settlement.partnerId); setPartnerAction('payment'); setPartnerActionAmount(remaining); setPartnerActionMethod('نقدي'); setPartnerActionBankId(''); setPaymentTransferReference(''); }} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">تسجيل دفعة / قسط</button>}</div>
            </div>;
          })}
        </div>
      )}

      {activeFinanceTab === 'income' && canManageTreasury && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
              <span className="text-neutral-400 text-xs block">إجمالي الإيرادات (المبيعات)</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
                {totalSalesRevenue.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 mt-1 block">صافي بعد المرتجعات، شامل الفواتير النقدية والآجلة ({invoices.length} فاتورة)</span>
            </div>

            <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
              <span className="text-neutral-400 text-xs block">تكلفة البضاعة المباعة (COGS)</span>
              <span className="text-xl font-black text-neutral-300 font-mono mt-1 block">
                {estimatedCOGS.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 mt-1 block">
                محسوبة من تكلفة كل صنف مباع
                {estimatedCostItemsCount > 0 && ` (${estimatedCostItemsCount} بند بتكلفة تقديرية لعدم توفر تكلفته)`}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-surface-2 border border-neutral-800">
              <span className="text-neutral-400 text-xs block">المصروفات التشغيلية</span>
              <span className="text-xl font-black text-rose-400 font-mono mt-1 block">
                {totalOperatingExpenses.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-neutral-500 mt-1 block">إيجار، رواتب، شحن، كهرباء</span>
            </div>

            <div className="p-4 rounded-2xl bg-surface-2 border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-surface-2">
              <span className="text-emerald-400 text-xs font-bold block">صافي الربح القابل للتوزيع</span>
              <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
                {netDistributableProfit.toLocaleString()} ج.م
              </span>
              <span className="text-[10px] text-emerald-500/80 mt-1 block">هامش ربح صافي: %{netProfitMargin}</span>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-surface-2 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  جدول قائمة الدخل التفصيلي (Income Statement)
                </h3>
              </div>
            </div>

            <div className="divide-y divide-neutral-800 text-xs">
              <div className="py-2.5 flex justify-between font-bold">
                <span className="text-neutral-300">1. إجمالي مبيعات قطع الغيار</span>
                <span className="font-mono text-white text-sm">{totalSalesRevenue.toFixed(2)} ج.م</span>
              </div>

              <div className="py-2.5 flex justify-between text-neutral-400">
                <span>(-) تكلفة القطع المباعة (شراء البضاعة من الوكيل والموردين)</span>
                <span className="font-mono text-neutral-300">-{estimatedCOGS.toFixed(2)} ج.م</span>
              </div>

              <div className="py-2.5 flex justify-between font-bold bg-surface-1 px-3 rounded-lg text-amber-400">
                <span>(=) مجمل الربح التجاري (Gross Profit) - هامش %{grossProfitMargin}</span>
                <span className="font-mono">{grossProfit.toFixed(2)} ج.م</span>
              </div>

              <div className="py-2.5 flex justify-between text-neutral-400">
                <span>(-) إجمالي المصروفات العامة والإدارية والتشغيلية</span>
                <span className="font-mono text-rose-400">-{totalOperatingExpenses.toFixed(2)} ج.م</span>
              </div>
              {taxRegistered && (
                <div className="py-2.5 flex justify-between text-neutral-400">
                  <span>{netVatDue >= 0 ? '(-) صافي ضريبة القيمة المضافة المستحقة' : '(+) رصيد ضريبة قيمة مضافة دائن'}</span>
                  <span className="font-mono text-rose-400">{netVatDue >= 0 ? '-' : '+'}{Math.abs(netVatDue).toFixed(2)} ج.م</span>
                </div>
              )}

              <div className="py-3 flex justify-between font-black text-sm bg-emerald-950/30 px-3 rounded-xl border border-emerald-500/30 text-emerald-400">
                <span>(=) صافي الدخل التشغيلي والأرباح القابلة للتوزيع بين الشركاء</span>
                <span className="font-mono text-base">{netDistributableProfit.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeFinanceTab === 'audit' && canManageTreasury && (
        <AuditLogPanel auditLog={auditLog} stockMovements={stockMovements} />
      )}

      {activeFinanceTab === 'treasury' && canManageTreasury && (
        <div className="space-y-6">
          <TreasuryAccountsReport transactions={treasuryTransactions} shifts={shifts} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {paymentBreakdown.map((pb) => {
              const color = PAYMENT_COLORS[pb.key] || '#94a3b8';
              return (
                <div key={pb.key} className="p-4 rounded-3xl bg-surface-2 border border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[10px] font-mono text-neutral-500">{pb.count} فواتير</span>
                  </div>
                  <h4 className="text-xs font-bold text-neutral-300 line-clamp-1">{pb.name}</h4>
                  <span className="text-lg font-black font-mono block text-white">
                    {pb.amount.toLocaleString()} ج.م
                  </span>
                  <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all" 
                      style={{ 
                        backgroundColor: color, 
                        width: `${totalSalesRevenue > 0 ? (pb.amount / totalSalesRevenue) * 100 : 0}%` 
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl bg-surface-2 border border-neutral-800 space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                <span>السيولة النقدية الشاملة (خزينة وبنوك ومحافظ)</span>
              </h4>
              <div className="p-4 rounded-2xl bg-surface-1 border border-neutral-800 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-neutral-400 text-xs block">صافي السيولة التراكمية بعد المصروفات:</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
                    {totalLiquidFunds.toLocaleString()} ج.م
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-0.5 block">
                    مجموع الأرصدة النقدية والبنكية مستثنى منها المبالغ الآجلة تحت التحصيل
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-950/40 to-surface-2 border border-emerald-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span>رصيد درج الخزينة الفعلي (الكاش الحاضر)</span>
                </h4>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  متصل ومربوط حياً
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-surface-1 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-neutral-400 text-xs block">الرصيد النقدي المتوفر بالخزينة الآن:</span>
                  <span className="text-2xl font-black text-amber-400 font-mono mt-1 block">
                    {(treasuryBalance !== undefined ? treasuryBalance : totalLiquidFunds).toLocaleString()} ج.م
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-0.5 block">
                    يتأثر فورياً بالمبيعات النقدية، المصروفات، سداد الموردين، وتخصيم مرتجعات المبيعات
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeFinanceTab === 'expenses' && canManageExpenses && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span>سجل سندات الصرف والمصروفات ({expenses.length} مصروف)</span>
            </h4>
            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مصروف</span>
            </button>
          </div>

          <div className="rounded-2xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-right text-neutral-300 text-xs">
              <thead className="bg-surface-1 text-neutral-400 text-[11px] border-b border-neutral-800">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">بيان المصروف</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">طريقة السداد</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-surface-2">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-surface-2">
                    <td className="p-3 font-mono text-[11px]">{exp.date}</td>
                    <td className="p-3 font-bold text-white">{exp.title}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300">
                        {exp.category}
                      </span>
                    </td>
                    <td className="p-3 text-[11px]">{exp.paymentMethod}</td>
                    <td className="p-3 font-mono font-black text-rose-400">{exp.amount.toLocaleString()} ج.م</td>
                    <td className="p-3 text-neutral-400 text-[11px]">{exp.recordedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddPartnerModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAddPartnerModal(false)}
        >
          <div 
            className="w-full max-w-lg bg-surface-2 rounded-3xl border border-neutral-800 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400" />
                <span>إضافة شريك جديد وتحديد حصة رأس المال</span>
              </h3>
              <button onClick={() => setShowAddPartnerModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddPartner} className="space-y-3.5 text-xs">
              <div>
                <label className="text-neutral-300 font-bold block mb-1">اسم الشريك الثلاثي *</label>
                <input
                  type="text"
                  required
                  value={newPartnerName}
                  onChange={(e) => setNewPartnerName(e.target.value)}
                  placeholder="مثال: أ. محمود الشناوي"
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">الصفة / الدور التعاقدي *</label>
                  <select
                    value={newPartnerRole}
                    onChange={(e) => setNewPartnerRole(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    <option value="شريك ممول ورأس المال">شريك ممول ورأس المال</option>
                    <option value="شريك مؤسس وتنفيذي">شريك مؤسس وتنفيذي</option>
                    <option value="شريك العمليات وسلاسل الإمداد">شريك العمليات وسلاسل الإمداد</option>
                    <option value="شريك استراتيجي ومورد">شريك استراتيجي ومورد</option>
                  </select>
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">رقم الجوال *</label>
                  <input
                    type="tel"
                    required
                    value={newPartnerPhone}
                    onChange={(e) => setNewPartnerPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">حصة رأس المال التأسيسي (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min="1000"
                    value={newPartnerInitialCapital || ''}
                    onChange={(e) => setNewPartnerInitialCapital(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
                  />
                </div>

                <div className="rounded-xl bg-surface-1 border border-neutral-800 p-3 flex flex-col justify-center">
                  <span className="text-neutral-400">نسبة الشريك المحسوبة تلقائيًا</span>
                  <strong className="text-amber-400 text-lg font-mono">%{newPartnerSharePercent.toFixed(2)}</strong>
                  <span className="text-[10px] text-neutral-500">بناءً على إجمالي رأس المال بعد الإضافة</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">طريقة إيداع رأس المال *</label>
                  <select
                    value={newPartnerPaymentMethod}
                    onChange={(e) => setNewPartnerPaymentMethod(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    <option value="نقدي">نقدي — الخزينة</option>
                    <option value="فيزا / بطاقة">فيزا / بطاقة بنكية</option>
                    <option value="InstaPay - حساب بنكي">InstaPay إلى حساب بنكي</option>
                    <option value="InstaPay - محفظة">InstaPay إلى محفظة</option>
                    <option value="انستاباي / InstaPay">InstaPay قديم / غير محدد</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="محفظة إلكترونية">محفظة إلكترونية</option>
                  </select>
                </div>
                {requiresSpecificBankAccount(newPartnerPaymentMethod) && (
                  <div className="sm:col-span-2">
                    <label className="text-amber-300 font-bold block mb-1">الحساب البنكي المستلم لرأس المال *</label>
                    <select required value={newPartnerBankAccountId} onChange={e => setNewPartnerBankAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-amber-500/50 text-white">
                      <option value="">اختر الحساب البنكي</option>
                      {bankAccounts.filter(account => account.active).map(account => <option key={account.id} value={account.id}>{account.bankName} — {account.name}</option>)}
                    </select>
                    {!bankAccounts.some(account => account.active) && <p className="text-[10px] text-rose-300 mt-1">أضف حساباً بنكياً نشطاً أولاً.</p>}
                  </div>
                )}
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">بيان / ملاحظات الإيداع</label>
                  <input
                    type="text"
                    value={newPartnerNotes}
                    onChange={(e) => setNewPartnerNotes(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                    placeholder="رقم الإيصال أو مرجع التحويل"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs shadow-lg mt-2 active:scale-98"
              >
                تأكيد انضمام الشريك وقيد رأس المال
              </button>
            </form>
          </div>
        </div>
      )}

      {showInjectCapitalModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowInjectCapitalModal(false)}
        >
          <div 
            className="w-full max-w-lg bg-surface-2 rounded-3xl border border-neutral-800 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
                <span>ضخ رأس مال إضافي وزيادة حصة الشريك</span>
              </h3>
              <button onClick={() => setShowInjectCapitalModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitInjectCapital} className="space-y-3.5 text-xs">
              <div>
                <label className="text-neutral-300 font-bold block mb-1">اختر الشريك المراد زيادة حصته *</label>
                <select
                  value={targetPartnerId}
                  onChange={(e) => setTargetPartnerId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-bold"
                >
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.role} (الحصة الحالية: %{p.sharePercentage})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">المبلغ المراد ضخه (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={injectAmount || ''}
                    onChange={(e) => setInjectAmount(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-amber-400 font-bold"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">طريقة التوريد والإيداع</label>
                  <select
                    value={injectPaymentMethod}
                    onChange={(e) => setInjectPaymentMethod(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    <option value="نقدي">نقدي (إيداع الخزينة)</option>
                    <option value="فيزا / بطاقة">فيزا / مدى (الحساب البنكي)</option>
                    <option value="InstaPay - حساب بنكي">InstaPay إلى حساب بنكي</option>
                    <option value="InstaPay - محفظة">InstaPay إلى محفظة</option>
                    <option value="انستاباي / InstaPay">InstaPay قديم / غير محدد</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                  </select>
                </div>
              </div>
              {requiresSpecificBankAccount(injectPaymentMethod) && (
                <div>
                  <label className="text-amber-300 font-bold block mb-1">الحساب البنكي المستلم لضخ رأس المال *</label>
                  <select required value={injectBankAccountId} onChange={e => setInjectBankAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-amber-500/50 text-white">
                    <option value="">اختر الحساب البنكي</option>
                    {bankAccounts.filter(account => account.active).map(account => <option key={account.id} value={account.id}>{account.bankName} — {account.name}</option>)}
                  </select>
                  {!bankAccounts.some(account => account.active) && <p className="text-[10px] text-rose-300 mt-1">أضف حساباً بنكياً نشطاً أولاً.</p>}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 text-[#ffffff] font-black text-xs shadow-lg mt-2 active:scale-98"
              >
                اعتماد ضخ رأس المال وإصدار سند الإيداع
              </button>
            </form>
          </div>
        </div>
      )}

      {showReinvestProfitModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowReinvestProfitModal(false)}
        >
          <div 
            className="w-full max-w-lg bg-surface-2 rounded-3xl border border-neutral-800 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-emerald-400" />
                <span>رسملة الأرباح - إدخال أرباح الشريك في رأس المال</span>
              </h3>
              <button onClick={() => setShowReinvestProfitModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReinvestProfit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-neutral-300 font-bold block mb-1">اختر الشريك الراغب برسملة أرباحه *</label>
                <select
                  value={targetPartnerId}
                  onChange={(e) => setTargetPartnerId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-bold"
                >
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (%{p.sharePercentage})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-neutral-300 font-bold block mb-1">المبلغ المراد رسملته وإدخاله برأس المال (ج.م) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={reinvestAmount || ''}
                  onChange={(e) => setReinvestAmount(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-emerald-400 font-bold"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-amber-500 text-[#ffffff] font-black text-xs shadow-lg mt-2 active:scale-98"
              >
                تأكيد رسملة الأرباح وإصدار شهادة القيد الرأسمالي
              </button>
            </form>
          </div>
        </div>
      )}

      {showAdjustSharesModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAdjustSharesModal(false)}
        >
          <div 
            className="w-full max-w-md bg-surface-2 rounded-3xl border border-neutral-800 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Percent className="w-4 h-4 text-amber-400" />
                <span>تعديل وتحديث نسب الحصص بين الشركاء</span>
              </h3>
              <button onClick={() => setShowAdjustSharesModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-2">
                {partners.map((p) => (
                  <div key={p.id} className="p-3 rounded-2xl bg-surface-1 border border-neutral-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">{p.name}</span>
                      <span className="text-[10px] text-neutral-400">{p.role}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editingShares[p.id] ?? p.sharePercentage}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setEditingShares((prev) => ({ ...prev, [p.id]: val }));
                        }}
                        className="w-16 h-8 text-center rounded-lg bg-surface-2 border border-neutral-700 text-amber-400 font-mono font-bold text-xs"
                      />
                      <span className="text-neutral-400 font-bold">%</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveAdjustedShares}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg mt-2 active:scale-98"
              >
                حفظ واعتماد نسب الشراكة
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddExpenseModal && canManageExpenses && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAddExpenseModal(false)}
        >
          <div 
            className="w-full max-w-md bg-surface-2 rounded-3xl border border-neutral-800 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>تسجيل سند صرف / مصروف جديد</span>
              </h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
              <div>
                <label className="text-neutral-300 font-bold block mb-1">بيان المصروف *</label>
                <input
                  type="text"
                  required
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="مثال: صيانة رافعة البضائع، سداد كهرباء..."
                  className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-bold block mb-1">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={expenseAmount || ''}
                    onChange={(e) => setExpenseAmount(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-rose-400 font-bold"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-bold block mb-1">طريقة السداد</label>
                  <select
                    value={expensePaymentMethod}
                    onChange={(e) => setExpensePaymentMethod(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
                  >
                    <option value="نقدي">كاش / نقدي</option>
                    <option value="فيزا / بطاقة">فيزا / مدى</option>
                    <option value="انستاباي / InstaPay">انستاباي InstaPay</option>
                  </select>
                </div>
              </div>
              {requiresSpecificBankAccount(expensePaymentMethod) && (
                <div>
                  <label className="text-amber-300 font-bold block mb-1">الحساب البنكي الذي خرج منه المصروف *</label>
                  <select required value={expenseBankAccountId} onChange={e => setExpenseBankAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-amber-500/50 text-white">
                    <option value="">اختر الحساب البنكي</option>
                    {bankAccounts.filter(account => account.active).map(account => <option key={account.id} value={account.id}>{account.bankName} — {account.name}{account.accountLast4 ? ` ••${account.accountLast4}` : ''}</option>)}
                  </select>
                  {!bankAccounts.some(account => account.active) && <p className="text-[10px] text-rose-300 mt-1">لا يوجد حساب بنكي نشط. أضف حساباً من دفتر الحسابات البنكية.</p>}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-lg mt-2"
              >
                تأكيد وقيد المصروف
              </button>
            </form>
          </div>
        </div>
      )}

      {showDistributeModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowDistributeModal(false)}
        >
          <div 
            className="w-full max-w-lg bg-surface-2 rounded-3xl border border-neutral-800 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>اعتماد وتوزيع أرباح الدورة الحالية</span>
              </h3>
              <button onClick={() => setShowDistributeModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-surface-1 border border-neutral-800 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-400">صافي الأرباح القابلة للتوزيع:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {netDistributableProfit.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-neutral-300 font-bold block mb-1 text-xs">طريقة صرف التوزيعات</label>
                <select value={distributionPaymentMethod} onChange={e => { setDistributionPaymentMethod(e.target.value); setDistributionBankAccountId(''); }} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white text-xs">
                  <option value="نقدي">نقدي — الخزينة</option>
                  <option value="تحويل بنكي">تحويل بنكي</option>
                  <option value="InstaPay - حساب بنكي">InstaPay إلى حساب بنكي</option>
                  <option value="InstaPay - محفظة">InstaPay إلى محفظة</option>
                </select>
              </div>
              {requiresSpecificBankAccount(distributionPaymentMethod) && (
                <div>
                  <label className="text-amber-300 font-bold block mb-1 text-xs">الحساب البنكي الذي ستُصرف منه التوزيعات *</label>
                  <select required value={distributionBankAccountId} onChange={e => setDistributionBankAccountId(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-amber-500/50 text-white text-xs">
                    <option value="">اختر الحساب البنكي</option>
                    {bankAccounts.filter(account => account.active).map(account => <option key={account.id} value={account.id}>{account.bankName} — {account.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-300 block">حصص الشركاء المحددة تعاقدياً:</span>
              <div className="divide-y divide-neutral-800 bg-surface-1 rounded-2xl p-3 border border-neutral-800">
                {activePartners.map((p) => {
                  const amt = ((netDistributableProfit * p.sharePercentage) / 100).toFixed(2);
                  return (
                    <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-white block">{p.name}</span>
                        <span className="text-[10px] text-neutral-400">{p.role} (%{p.sharePercentage})</span>
                      </div>
                      <span className="font-mono font-black text-emerald-400">
                        {Number(amt).toLocaleString()} ج.م
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleExecuteDistribution}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs shadow-lg active:scale-98"
            >
              تأكيد صرف وحفظ سند التوزيع
            </button>
          </div>
        </div>
      )}

      {partnerAction && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPartnerAction(null)}>
          <form onSubmit={submitPartnerAction} onClick={e => e.stopPropagation()} className="w-full max-w-xl bg-surface-2 border border-neutral-700 rounded-3xl p-5 md:p-6 space-y-4 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-700 pb-3"><h3 className="font-black text-base">{partnerAction === 'edit' ? 'تعديل بيانات الشريك' : partnerAction === 'withdrawal' ? 'تسجيل مسحوبات أو سلفة شريك' : partnerAction === 'exit' ? 'إعداد تسوية تخارج الشريك' : 'تسجيل دفعة فعلية من مستحقات التخارج'}</h3><button type="button" onClick={() => setPartnerAction(null)} className="text-neutral-400"><X className="w-5 h-5"/></button></div>
            {partnerAction === 'edit' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs text-neutral-300">اسم الشريك<input required value={profileName} onChange={e=>setProfileName(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3 text-white"/></label><label className="text-xs text-neutral-300">الصفة / الدور<input value={profileRole} onChange={e=>setProfileRole(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3 text-white"/></label><label className="text-xs text-neutral-300 sm:col-span-2">رقم الهاتف<input required value={profilePhone} onChange={e=>setProfilePhone(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3 text-white"/></label></div>}
            {partnerAction === 'withdrawal' && <div className="space-y-3"><div className="p-3 rounded-xl bg-amber-950/30 border border-amber-700/40 text-xs text-amber-200">المسحوبات الشخصية تخصم من حساب جاري/مسحوبات الشريك ولا تعتبر مصروفاً تشغيلياً. السلفة تسجل كمديونية على الشريك.</div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-neutral-300">نوع الحركة<select value={partnerActionKind} onChange={e=>setPartnerActionKind(e.target.value as any)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-2"><option value="withdrawal">مسحوبات شخصية</option><option value="advance">سلفة / عهدة على الشريك</option></select></label><label className="text-xs text-neutral-300">المبلغ ج.م<input type="number" min="0.01" step="0.01" required value={partnerActionAmount || ''} onChange={e=>setPartnerActionAmount(Number(e.target.value))} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label></div><label className="block text-xs text-neutral-300">طريقة الصرف<select value={partnerActionMethod} onChange={e=>{setPartnerActionMethod(e.target.value);setPartnerActionBankId('')}} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"><option value="نقدي">نقدي من الخزينة</option><option value="تحويل بنكي">تحويل بنكي</option></select></label>{requiresSpecificBankAccount(partnerActionMethod) && <label className="block text-xs text-neutral-300">الحساب البنكي<select required value={partnerActionBankId} onChange={e=>setPartnerActionBankId(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"><option value="">اختر الحساب</option>{bankAccounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}</select></label>}</div>}
            {partnerAction === 'exit' && <div className="space-y-3"><p className="text-xs text-neutral-400">أدخل الحقوق والخصومات المعتمدة حتى تاريخ التخارج. لن يتم خصم أي مبلغ من الخزينة أو البنك عند إنشاء التسوية.</p><label className="block text-xs text-neutral-300">تاريخ سريان التخارج<input type="date" required value={exitDate} onChange={e=>setExitDate(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label><div className="grid grid-cols-2 gap-3">{[['رأس المال المستحق',exitCapital,setExitCapital],['أرباح مستحقة حتى تاريخ التخارج',exitProfit,setExitProfit],['استحقاقات أخرى',exitOtherEntitlements,setExitOtherEntitlements],['مسحوبات واجبة الخصم',exitWithdrawals,setExitWithdrawals],['سلف / مديونيات على الشريك',exitAdvances,setExitAdvances],['خصومات أخرى',exitDeductions,setExitDeductions]].map(([label,value,setter]: any)=><label key={label} className="text-xs text-neutral-300">{label}<input type="number" min="0" step="0.01" value={value} onChange={e=>setter(Number(e.target.value))} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label>)}</div><div className="p-3 rounded-xl bg-surface-1 border border-neutral-700 flex justify-between text-sm"><b>صافي المستحق للشريك</b><strong className="text-emerald-300">{(exitCapital+exitProfit+exitOtherEntitlements-exitWithdrawals-exitAdvances-exitDeductions).toLocaleString()} ج.م</strong></div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-neutral-300">تاريخ الاستحقاق / القسط الأول<input type="date" value={exitDueDate} onChange={e=>setExitDueDate(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label><label className="text-xs text-neutral-300">ملاحظات<input value={exitNotes} onChange={e=>setExitNotes(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label></div></div>}
            {partnerAction === 'payment' && <div className="space-y-3"><p className="text-xs text-neutral-400">كل تسجيل هنا يمثل دفعة تم سدادها فعلياً، ويمكن تكرار العملية للأقساط. لا تسجل الدفعة قبل تنفيذ التحويل أو الدفع.</p><label className="block text-xs text-neutral-300">المبلغ المدفوع<input type="number" min="0.01" step="0.01" required value={partnerActionAmount || ''} onChange={e=>setPartnerActionAmount(Number(e.target.value))} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label><label className="block text-xs text-neutral-300">طريقة السداد<select value={partnerActionMethod} onChange={e=>{setPartnerActionMethod(e.target.value);setPartnerActionBankId('')}} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"><option value="نقدي">نقدي من الخزينة</option><option value="تحويل بنكي">تحويل بنكي</option></select></label>{requiresSpecificBankAccount(partnerActionMethod) && <label className="block text-xs text-neutral-300">الحساب البنكي<select required value={partnerActionBankId} onChange={e=>setPartnerActionBankId(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"><option value="">اختر الحساب</option>{bankAccounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.bankName} — {a.name}</option>)}</select></label>}<label className="block text-xs text-neutral-300">مرجع التحويل / رقم العملية<input value={paymentTransferReference} onChange={e=>setPaymentTransferReference(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-1 border border-neutral-700 px-3"/></label></div>}
            <div className="flex gap-2"><button type="button" onClick={()=>setPartnerAction(null)} className="flex-1 py-3 rounded-xl bg-surface-3 text-neutral-300 text-xs font-bold">إلغاء</button><button type="submit" className="flex-1 py-3 rounded-xl bg-amber-500 text-neutral-950 text-xs font-black">حفظ ومتابعة</button></div>
          </form>
        </div>
      )}

      {showReportModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowReportModal(false)}
        >
          <div 
            className="w-full max-w-4xl bg-surface-2 rounded-3xl border border-neutral-700 p-6 text-neutral-100 shadow-2xl space-y-6 print:p-0 print:border-none print:shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Coins className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">تقرير القوائم المالية وحقوق الملكية ورأس المال</h3>
                  <p className="text-xs text-neutral-400">
                    مركز MALVIA لقطع غيار السيارات | س.ت: 104928-القاهرة | الرقم الضريبي: 394-882-105
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>قائمة حقوق الملكية ورأس مال الشركاء</span>
              </h4>

              <div className="rounded-2xl border border-neutral-800 overflow-hidden text-xs">
                <table className="w-full text-right text-neutral-300">
                  <thead className="bg-surface-1 text-neutral-400 text-[11px] border-b border-neutral-800">
                    <tr>
                      <th className="p-3">اسم الشريك</th>
                      <th className="p-3">نسبة الحصة %</th>
                      <th className="p-3">رأس المال التأسيسي</th>
                      <th className="p-3">رأس المال المضاف</th>
                      <th className="p-3">الأرباح المرسملة</th>
                      <th className="p-3">إجمالي رأس المال الحالي</th>
                      <th className="p-3">أرباح الدورة المستحقة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 bg-surface-2">
                    {partners.map((p) => {
                      const shareAmt = ((netDistributableProfit * p.sharePercentage) / 100).toFixed(2);
                      const curCap = p.totalCurrentCapital || (p.initialCapital + (p.addedCapital || 0) + (p.reinvestedProfits || 0));
                      return (
                        <tr key={p.id}>
                          <td className="p-3 font-bold text-white">{p.name}</td>
                          <td className="p-3 font-mono font-bold text-amber-400">%{p.sharePercentage}</td>
                          <td className="p-3 font-mono">{p.initialCapital.toLocaleString()} ج.م</td>
                          <td className="p-3 font-mono text-amber-400">+{(p.addedCapital || 0).toLocaleString()} ج.م</td>
                          <td className="p-3 font-mono text-emerald-400">+{(p.reinvestedProfits || 0).toLocaleString()} ج.م</td>
                          <td className="p-3 font-mono font-black text-amber-400">{curCap.toLocaleString()} ج.م</td>
                          <td className="p-3 font-mono font-bold text-emerald-400">{Number(shareAmt).toLocaleString()} ج.م</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
