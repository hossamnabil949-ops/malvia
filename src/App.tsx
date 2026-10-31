import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  loadTenantLicenses, 
  saveTenantLicenses, 
  getActiveTenantId, 
  setActiveTenantId, 
  loadTenantStoreData, 
  saveTenantStoreData,
  loadUserSession, 
  clearUserSession,
  getDeviceSavedLicenseKey,
  saveDeviceLicenseKey,
  clearTenantDemoData,
  updateOwnerPassword
} from './services/tenantService';
import { startSync, stopSync, SYNC_EVENT, fetchRegistry, pushRegistry, getAdminToken, setAdminToken, clearAdminToken } from './services/syncService';
import * as syncSvc from './services/syncService';
import { INITIAL_TENANT_LICENSES } from './data/autoPartsData';
import { SyncBadge } from './components/SyncBadge';

import { 
  AutoPart, 
  CartItem,
  Invoice, 
  Customer, 
  Supplier, 
  TreasuryTransaction, 
  Employee, 
  ShopSettings, 
  SalesReturn, 
  PurchaseInvoice, 
  PurchaseReturn, 
  Expense, 
  Partner, 
  TenantLicense, 
  UserSession,
  CarModel,
  InventoryDiscrepancyError,
  PaymentMethod,
  ProfitDistributionRecord,
  Shift
} from './types/autoParts';

import { INITIAL_SHOP_SETTINGS } from './data/autoPartsData';
import { DEFAULT_CAR_BRANDS, GENERAL_BRAND, normalizeBrand } from './data/brands';
import { isCreditMethod } from './utils/treasuryAccounts';
import { findOpenShift, findOpenShifts, summarizeShift, stampNewTreasury, nextShiftNumber, countTotal, round2, varianceOf } from './utils/shiftLogic';
import { nextSalesInvoiceNumber } from './utils/invoiceNumber';
import { SaleError, computeVoidPlan, deductStock, isCreditPayment } from './utils/saleLogic';
import type { AuditEntry, StockMovement, InvoicePayment, Warehouse, StockLevel, StockTransfer } from './types/autoParts';
import { MAIN_WAREHOUSE_ID, normalizeWarehouseId, availableIn, adjustLevels, validateTransfer, applyTransfer, TransferError } from './utils/warehouseLogic';
import { WarehousesView } from './components/WarehousesView';
import { hasTabAccess, firstAllowedTab, isSimpleCashier, SIMPLE_MODE_TABS } from './utils/permissions';
import { resolveLoyalty, earnedPoints, loyaltyAfterReturn, addMonths, availableBalances, pendingExpiryEntries } from './utils/loyaltyLogic';
import type { LoyaltyEntry, LoyaltyEntryType } from './utils/loyaltyLogic';
import { ChequesView, NewChequeInput } from './components/ChequesView';
import {
  StockBatch, SerialUnit, TrackingMode, TRACKING_LABEL, allocateFefo, applyBatchOps, validateSerialSale, autoBatchNo, expiryBuckets, validateSerialIntake, unassignedStock, inStockUnits,
} from './utils/trackingLogic';
import { TrackingView } from './components/TrackingView';
import { ReportsHub } from './components/ReportsHub';
import { trackReturn } from './utils/returnTracking';
import {
  Cheque, ChequeAction, ChequeEffect, ChequeError, CHEQUE_PAYMENT_METHOD, ACTION_LABEL as CHEQUE_ACTION_LABEL, clearLabel as chequeClearLabel,
  registrationEffect, actionEffect, applyAction, validateCheque, initialStatus, pendingIncomingByCustomer, attentionCount, dueState,
} from './utils/chequeLogic';

const SALE_ERROR_MESSAGES: Record<string, string> = {
  OUT_OF_STOCK: 'الكمية المطلوبة أكبر من الرصيد المتاح في المخزن',
  INVALID_QTY: 'كمية غير صالحة',
  INVALID_PRICE: 'سعر غير صالح',
  PRICE_BELOW_COST: 'السعر أقل من التكلفة (يحتاج صلاحية المدير)',
  DISCOUNT_EXCEEDS_SUBTOTAL: 'الخصم أكبر من قيمة الفاتورة',
  PAYMENT_MISMATCH: 'مجموع المدفوعات لا يساوي إجمالي الفاتورة',
  CREDIT_REQUIRES_CUSTOMER: 'البيع الآجل يتطلب اختيار أو كتابة اسم العميل',
  EMPTY_CART: 'السلة فارغة',
};
const MAX_LOG_ENTRIES = 5000; // سقف السجلات حتى لا تكبر مساحة التخزين بلا حد

const todayISO = () => new Date().toISOString().split('T')[0];
const normKey = (v?: string) => (v || '').trim().toLowerCase();

// Components
import { Navigation, ActiveTab } from './components/Navigation';
import { HomeDashboard } from './components/HomeDashboard';
import { QuickPosView } from './components/QuickPosView';
import { InventoryView } from './components/InventoryView';
import { InvoicesView } from './components/InvoicesView';
import { PurchasesView } from './components/PurchasesView';
import { CustomersView } from './components/CustomersView';
import { SuppliersView } from './components/SuppliersView';
import { FinanceView } from './components/FinanceView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { ShiftsView } from './components/ShiftsView';

// Modals
import { InventoryErrorsModal } from './components/InventoryErrorsModal';
import { CarModelsModal } from './components/CarModelsModal';
import { PhotoSharingModal } from './components/PhotoSharingModal';
import { ExcelImportExportModal } from './components/ExcelImportExportModal';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import { TenantActivationGateway } from './components/TenantActivationGateway';
import { ShopLoginView } from './components/ShopLoginView';
import { SystemDeploymentGuideModal } from './components/SystemDeploymentGuideModal';
import { NotificationsModal } from './components/NotificationsModal';
import { LowStockView } from './components/LowStockView';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { InventoryAuditModal } from './components/InventoryAuditModal';
import { BarcodeStocktakeModal } from './components/BarcodeStocktakeModal';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';

export default function App() {
  // Tenant and License State
  const [licenses, setLicenses] = useState<TenantLicense[]>(() => loadTenantLicenses());
  const [activeTenantId, setActiveTenantIdState] = useState<string>(() => getActiveTenantId());
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => loadUserSession());
  const [showActivationGateway, setShowActivationGateway] = useState<boolean>(false);

  // Active Tenant
  const activeTenant = useMemo(() => {
    return licenses.find(l => l.tenantId === activeTenantId) || licenses[0];
  }, [licenses, activeTenantId]);

  // Store data state
  const [parts, setParts] = useState<AutoPart[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<import('./types/autoParts').SupplierPayment[]>([]);
  const [treasury, setTreasury] = useState<TreasuryTransaction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(INITIAL_SHOP_SETTINGS);
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [inventoryErrors, setInventoryErrors] = useState<InventoryDiscrepancyError[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [loyaltyLedger, setLoyaltyLedger] = useState<LoyaltyEntry[]>([]);
  const [loyaltyTick, setLoyaltyTick] = useState(0);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [stockBatches, setStockBatches] = useState<StockBatch[]>([]);
  const [serialUnits, setSerialUnits] = useState<SerialUnit[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  // معرّفات حركات الخزنة المعروفة (المحمّلة) — أي حركة جديدة خارجها تُختم بوقتها ووردية الدرج
  const knownTreasuryIds = useRef<Set<string>>(new Set());

  // Cart state for POS
  const [cart, setCart] = useState<CartItem[]>([]);

  // Navigation & View State
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');

  // الصلاحيات تُقرأ من سجل الموظف الحالي (تسري فوراً عند تعديلها) وليس من لقطة وقت الدخول
  const liveEmployee = currentUser ? employees.find(e => e.id === currentUser.employeeId) : undefined;
  const effectiveRole = liveEmployee?.role ?? currentUser?.role;
  const effectivePermissions = liveEmployee?.permissions ?? currentUser?.permissions;
  const simpleMode = Boolean(currentUser) && isSimpleCashier(effectiveRole, effectivePermissions);
  const canAccessTab = (tab: string): boolean =>
    !currentUser || (hasTabAccess(effectiveRole, effectivePermissions, tab) && (!simpleMode || SIMPLE_MODE_TABS.includes(tab)));
  const canManageInventoryNow = !currentUser || hasTabAccess(effectiveRole, effectivePermissions, 'inventory');
  const viewTab: ActiveTab | null = canAccessTab(currentTab) ? currentTab : null;
  useEffect(() => {
    // أي تحويل برمجي (بحث صوتي، أزرار سريعة...) لشاشة ممنوعة يرجع لأول شاشة مسموحة
    if (currentUser && !canAccessTab(currentTab)) {
      const next = simpleMode
        ? (SIMPLE_MODE_TABS.find(t => canAccessTab(t)) ?? 'pos')
        : firstAllowedTab(effectiveRole, effectivePermissions);
      setCurrentTab(next as ActiveTab);
    }
  }, [currentTab, currentUser, effectiveRole, effectivePermissions, simpleMode]);

  // Modals state
  const [showInventoryErrors, setShowInventoryErrors] = useState<boolean>(false);
  const [showCarModels, setShowCarModels] = useState<boolean>(false);
  const [showPhotoSharing, setShowPhotoSharing] = useState<boolean>(false);
  const [showExcelModal, setShowExcelModal] = useState<boolean>(false);
  const [showDeploymentGuide, setShowDeploymentGuide] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showVoiceAssistant, setShowVoiceAssistant] = useState<boolean>(false);
  const [showInventoryAudit, setShowInventoryAudit] = useState<boolean>(false);
  const [showBarcodeStocktake, setShowBarcodeStocktake] = useState<boolean>(false);
  const [selectedAuditPart, setSelectedAuditPart] = useState<AutoPart | null>(null);
  const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] = useState<Invoice | null>(null);

  // Load tenant data whenever activeTenant changes
  const reloadTenantData = useCallback((tenant: TenantLicense) => {
    const data = loadTenantStoreData(tenant);

    // توحيد أسماء الماركات القديمة (MG → إم جي ...) حتى تظهر القطع تحت زر الماركة الصحيح،
    // وإضافة أي ماركة موجودة في البيانات ولم تكن في القائمة.
    let partsData = data.parts;
    let modelsData = data.carModels;
    let changedParts = false;
    let changedModels = false;
    partsData = partsData.map(p => {
      const b = normalizeBrand(p.brand);
      if (b !== p.brand) { changedParts = true; return { ...p, brand: b }; }
      return p;
    });
    modelsData = modelsData.map(m => {
      const b = normalizeBrand(m.brand);
      if (b !== m.brand) { changedModels = true; return { ...m, brand: b }; }
      return m;
    });
    const baseSettings = data.settings || INITIAL_SHOP_SETTINGS;
    const baseBrands = (baseSettings.carBrands ?? DEFAULT_CAR_BRANDS).filter(b => b !== GENERAL_BRAND);
    const brandSet = new Set(baseBrands);
    const added: string[] = [];
    // أول مرة فقط (لم تُحفظ قائمة ماركات بعد): أضف كل ماركة موجودة في البيانات.
    // بعد ذلك لا نُرجع ماركة حذفها المستخدم عمداً.
    if (baseSettings.carBrands === undefined) {
      [...partsData.map(p => p.brand), ...modelsData.map(m => m.brand)].forEach(b => {
        if (b && b !== GENERAL_BRAND && b !== 'أخرى' && !brandSet.has(b)) { brandSet.add(b); added.push(b); }
      });
    }
    const nextSettings: ShopSettings = { ...baseSettings, carBrands: Array.from(brandSet) };
    const updates: Parameters<typeof saveTenantStoreData>[1] = {};
    if (changedParts) updates.parts = partsData;
    if (changedModels) updates.carModels = modelsData;
    if (baseSettings.carBrands === undefined) updates.settings = nextSettings;
    if (Object.keys(updates).length > 0) saveTenantStoreData(tenant.tenantId, updates);

    setParts(partsData);
    setInvoices(data.invoices);
    setCustomers(data.customers);
    setSuppliers(data.suppliers);
    setSupplierPayments(data.supplierPayments || []);
    data.treasuryTransactions.forEach(t => knownTreasuryIds.current.add(t.id));
    setTreasury(data.treasuryTransactions);
    setShifts(data.shifts || []);
    setEmployees(data.employees);
    setSettings(nextSettings);
    setSalesReturns(data.salesReturns);
    setPurchaseInvoices(data.purchaseInvoices);
    setPurchaseReturns(data.purchaseReturns);
    setExpenses(data.expenses);
    setPartners(data.partners);
    setCarModels(modelsData);
    setInventoryErrors(data.inventoryErrors);
    setAuditLog(data.auditLog || []);
    setStockMovements(data.stockMovements || []);
    setWarehouses(data.warehouses || []);
    setStockLevels(data.stockLevels || []);
    setStockTransfers(data.stockTransfers || []);
    setLoyaltyLedger(data.loyaltyLedger || []);
    setCheques(data.cheques || []);
    setStockBatches(data.stockBatches || []);
    setSerialUnits(data.serialUnits || []);
  }, []);

  useEffect(() => {
    if (activeTenant) {
      reloadTenantData(activeTenant);
    }
  }, [activeTenant, reloadTenantData]);

  // المزامنة السحابية: تعمل طالما المستخدم مسجل دخول، وتعيد تحميل الشاشة عند وصول تغييرات من جهاز آخر
  useEffect(() => {
    if (!currentUser || !activeTenant) return;
    startSync(activeTenant.tenantId, activeTenant.licenseKey);
    return () => stopSync();
  }, [currentUser?.tenantId, activeTenant?.tenantId, activeTenant?.licenseKey]);

  useEffect(() => {
    const onRemote = () => { if (activeTenant) reloadTenantData(activeTenant); };
    window.addEventListener(SYNC_EVENT, onRemote);
    return () => window.removeEventListener(SYNC_EVENT, onRemote);
  }, [activeTenant, reloadTenantData]);

  // لوحة المالك: اقرأ سجل المحلات من السحابة (يتطلب رمز الإدارة)
  useEffect(() => {
    if (window.location.pathname.replace(/\/$/, '') !== '/owner') return;
    (async () => {
      if (!getAdminToken()) {
        const t = window.prompt('أدخل رمز الإدارة السحابي (ADMIN_TOKEN) لربط لوحة المالك بالسحابة، أو اتركه فارغاً للعمل محلياً فقط');
        if (t && t.trim()) setAdminToken(t); else return;
      }
      const remote = await fetchRegistry();
      if (remote && remote.length > 0) {
        setLicenses(remote as TenantLicense[]); saveTenantLicenses(remote as TenantLicense[]);
      } else if (remote && remote.length === 0) {
        const demoKeys = new Set(INITIAL_TENANT_LICENSES.map(l => l.licenseKey.toUpperCase()));
        const mine = loadTenantLicenses().filter(l => !demoKeys.has(l.licenseKey.toUpperCase()));
        if (mine.length) pushRegistry(mine);
      } else {
        const why = syncSvc.lastRegistryError;
        if (why === 'bad-token') { clearAdminToken(); window.alert('رمز الإدارة غير صحيح أو غير مضبوط في Vercel (ADMIN_TOKEN). أعد فتح الصفحة لإدخاله من جديد.'); }
        else window.alert('تعذر الاتصال بسجل السحابة: ' + why);
      }
    })();
  }, []);

  // Handle URL Query Parameters (Direct links: admin, store, cashier, specific modules)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;
      const storeParam = urlParams.get('store');
      const tenantParam = urlParams.get('tenant') || urlParams.get('tenantId');
      const actionParam = urlParams.get('action');

      if (tenantParam) {
        const found = licenses.find(l => l.tenantId === tenantParam);
        if (found) {
          setActiveTenantId(tenantParam);
          setActiveTenantIdState(tenantParam);
        }
      }

      if (actionParam === 'errors') {
        setShowInventoryErrors(true);
      } else if (actionParam === 'carmodels') {
        setShowCarModels(true);
      } else if (actionParam === 'excel') {
        setShowExcelModal(true);
      } else if (storeParam === 'pos' || hash === '#pos') {
        setCurrentTab('pos');
      }
    } catch (e) {
      console.warn('URL param parse error:', e);
    }
  }, [licenses]);

  // Auto-persist changes to active tenant
  const persistChanges = useCallback((updates: Parameters<typeof saveTenantStoreData>[1]) => {
    if (!activeTenantId) return;
    saveTenantStoreData(activeTenantId, updates);
  }, [activeTenantId]);

  // سجل التدقيق: من فعل ماذا ومتى (يمنع التلاعب ويكشفه)
  const logAudit = (action: AuditEntry['action'], summary: string, entityId?: string, amount?: number) => {
    const entry: AuditEntry = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      at: new Date().toISOString(),
      userId: currentUser?.employeeId,
      userName: currentUser?.employeeName || 'غير معروف',
      userRole: currentUser?.role,
      action, summary, entityId, amount,
    };
    setAuditLog(prev => {
      const updated = [entry, ...prev].slice(0, MAX_LOG_ENTRIES);
      persistChanges({ auditLog: updated });
      return updated;
    });
  };

  // دفتر حركات المخزون: كل زيادة/نقص بسببه ورصيد بعده
  const logStockMovements = (
    list: { part: AutoPart; qtyDelta: number; type: StockMovement['type']; refId?: string; refNumber?: string }[]
  ) => {
    if (list.length === 0) return;
    const at = new Date().toISOString();
    const rows: StockMovement[] = list.map((m, i) => ({
      id: `MOV-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
      at,
      partId: m.part.id,
      partNumber: m.part.partNumber,
      partName: m.part.name,
      type: m.type,
      qtyDelta: m.qtyDelta,
      balanceAfter: m.part.stockQuantity + m.qtyDelta,
      refId: m.refId,
      refNumber: m.refNumber,
      userName: currentUser?.employeeName || 'غير معروف',
    }));
    setStockMovements(prev => {
      const updated = [...rows, ...prev].slice(0, MAX_LOG_ENTRIES);
      persistChanges({ stockMovements: updated });
      return updated;
    });
  };

  // Current calculated treasury balance
  const treasuryBalance = useMemo(() => {
    return treasury.reduce((sum, tx) => {
      return tx.type === 'قبض' ? sum + tx.amount : sum - tx.amount;
    }, 0);
  }, [treasury]);

  // ---------- الورديات وجرد الدرج ----------
  const openShift = useMemo(() => findOpenShift(shifts), [shifts]);
  const openShiftsCount = useMemo(() => findOpenShifts(shifts).length, [shifts]);

  // أي حركة خزنة جديدة تُختم بوقتها ورقم الوردية المفتوحة (الحركات القديمة لا تُمسّ)
  useEffect(() => {
    if (!activeTenantId) return;
    const { list, changed } = stampNewTreasury(treasury, knownTreasuryIds.current, openShift?.id, new Date().toISOString());
    if (changed) {
      setTreasury(list);
      persistChanges({ treasuryTransactions: list });
    }
  }, [treasury, openShift?.id, activeTenantId, persistChanges]);

  const handleOpenShift = (p: { openingCash: number; denominations?: Record<string, number>; note?: string; carryOverDiff?: number }): boolean => {
    if (findOpenShift(shifts)) { window.alert('فيه وردية مفتوحة بالفعل. اقفلها الأول قبل فتح وردية جديدة.'); return false; }
    if (!Number.isFinite(p.openingCash) || p.openingCash < 0) { window.alert('كاش الافتتاح غير صالح'); return false; }
    const shift: Shift = {
      id: `SHIFT-${Date.now()}`,
      shiftNumber: nextShiftNumber(shifts),
      status: 'مفتوحة',
      openedAt: new Date().toISOString(),
      openedBy: currentUser?.employeeName || 'غير معروف',
      openedById: currentUser?.employeeId,
      openingCash: round2(p.openingCash),
      ...(p.denominations ? { openingDenominations: p.denominations } : {}),
      ...(p.carryOverDiff ? { carryOverDiff: round2(p.carryOverDiff) } : {}),
      ...(p.note?.trim() ? { openingNote: p.note.trim() } : {}),
    };
    setShifts(prev => {
      const updated = [shift, ...prev];
      persistChanges({ shifts: updated });
      return updated;
    });
    logAudit('shift.open', `فتح وردية ${shift.shiftNumber} بكاش افتتاح ${shift.openingCash} ج.م`, shift.id, shift.openingCash);
    if (shift.carryOverDiff) {
      logAudit('shift.variance', `فرق افتتاح ${shift.shiftNumber} عن إقفال الوردية السابقة: ${shift.carryOverDiff > 0 ? 'زيادة' : 'عجز'} ${Math.abs(shift.carryOverDiff)} ج.م`, shift.id, shift.carryOverDiff);
    }
    return true;
  };

  const handleCloseShift = (
    shiftId: string,
    p: { countedCash: number; denominations?: Record<string, number>; note?: string; postVariance: boolean }
  ): boolean => {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift || shift.status !== 'مفتوحة') { window.alert('الوردية دي مقفولة بالفعل أو غير موجودة.'); return false; }
    if (!Number.isFinite(p.countedCash) || p.countedCash < 0) { window.alert('الكاش المعدود غير صالح'); return false; }

    const sum = summarizeShift(shift, treasury);
    const counted = round2(p.countedCash);
    const variance = varianceOf(counted, sum.expectedCash);
    if (variance !== 0 && !(p.note || '').trim()) { window.alert('فيه فرق في الدرج — اكتب سبب الفرق قبل الإقفال.'); return false; }

    const nowISO = new Date().toISOString();
    let posted = false;
    if (variance !== 0 && p.postVariance) {
      const isShort = variance < 0;
      const amt = Math.abs(variance);
      const tx: TreasuryTransaction = {
        id: `TX-SHV-${Date.now()}`,
        txNumber: `TX-SV-${Math.floor(1000 + Math.random() * 9000)}`,
        date: nowISO.split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: isShort ? 'صرف' : 'قبض',
        category: isShort ? 'عجز درج (تسوية وردية)' : 'زيادة درج (تسوية وردية)',
        amount: amt,
        paymentMethod: 'نقدي',
        balanceAfter: isShort ? treasuryBalance - amt : treasuryBalance + amt,
        referenceId: shift.id,
        description: `${isShort ? 'عجز' : 'زيادة'} درج وردية ${shift.shiftNumber} — ${(p.note || '').trim()}`,
        recordedBy: currentUser?.employeeName || 'غير معروف',
        at: nowISO,
        shiftId: shift.id,
      };
      knownTreasuryIds.current.add(tx.id);
      setTreasury(prev => {
        const updated = [tx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
      posted = true;
    }

    const closed: Shift = {
      ...shift,
      status: 'مغلقة',
      closedAt: nowISO,
      closedBy: currentUser?.employeeName || 'غير معروف',
      closedById: currentUser?.employeeId,
      expectedCash: sum.expectedCash,
      countedCash: counted,
      ...(p.denominations && countTotal(p.denominations) > 0 ? { closingDenominations: p.denominations } : {}),
      variance,
      ...(p.note?.trim() ? { varianceNote: p.note.trim() } : {}),
      variancePosted: posted,
      cashIn: sum.cashIn,
      cashOut: sum.cashOut,
      cashSales: sum.cashSales,
      nonCash: sum.nonCash,
      invoiceCount: sum.invoiceCount,
      breakdown: sum.breakdown,
    };
    setShifts(prev => {
      const updated = prev.map(s => (s.id === shiftId ? closed : s));
      persistChanges({ shifts: updated });
      return updated;
    });
    logAudit('shift.close', `إقفال وردية ${shift.shiftNumber}: متوقع ${sum.expectedCash} / فعلي ${counted}`, shift.id, counted);
    if (variance !== 0) {
      logAudit('shift.variance', `${variance < 0 ? 'عجز' : 'زيادة'} درج ${Math.abs(variance)} ج.م في ${shift.shiftNumber} — ${(p.note || '').trim()}`, shift.id, variance);
    }
    return true;
  };

  const handleToggleRequireShift = (value: boolean) => {
    setSettings(prev => {
      const next = { ...prev, requireShiftForSales: value };
      persistChanges({ settings: next });
      return next;
    });
  };

  // ماركات السيارات التي يتعامل بها المحل («شامل» دائماً أولاً)
  const carBrands = useMemo(
    () => [GENERAL_BRAND, ...(settings.carBrands ?? DEFAULT_CAR_BRANDS).filter(b => b !== GENERAL_BRAND)],
    [settings.carBrands]
  );

  const saveCarBrands = (list: string[]) => {
    setSettings(prev => {
      const next = { ...prev, carBrands: list };
      persistChanges({ settings: next });
      return next;
    });
  };

  const handleAddBrand = (brand: string) => {
    const clean = normalizeBrand(brand);
    if (!clean || clean === GENERAL_BRAND) return;
    setSettings(prev => {
      const cur = (prev.carBrands ?? DEFAULT_CAR_BRANDS).filter(b => b !== GENERAL_BRAND);
      if (cur.includes(clean)) return prev;
      const next = { ...prev, carBrands: [...cur, clean] };
      persistChanges({ settings: next });
      return next;
    });
  };

  const handleRemoveBrand = (brand: string) => {
    const cur = (settings.carBrands ?? DEFAULT_CAR_BRANDS).filter(b => b !== GENERAL_BRAND && b !== brand);
    saveCarBrands(cur);
  };

  // Handlers for Inventory
  const handleUpdatePart = (updatedPart: AutoPart) => {
    setParts(prev => {
      const updated = prev.map(p => p.id === updatedPart.id ? updatedPart : p);
      persistChanges({ parts: updated });
      return updated;
    });
  };

  const handleAddPart = (newPart: AutoPart) => {
    setParts(prev => {
      const updated = [{ ...newPart, createdAt: newPart.createdAt || todayISO(), updatedAt: todayISO() }, ...prev];
      persistChanges({ parts: updated });
      return updated;
    });
  };

  // حذف صنف (أُضيف بالخطأ): التحقق من باسورد المدير يتم في الواجهة قبل الاستدعاء.
  // الفواتير القديمة تحتفظ باسم ورقم الصنف داخل سطورها فلا تتأثر.
  const handleDeletePart = (partId: string, approvedBy: string) => {
    const target = parts.find(p => p.id === partId);
    if (!target) return;
    logAudit('part.delete', `حذف صنف ${target.name} (${target.partNumber}) - رصيد وقت الحذف ${target.stockQuantity} - باعتماد ${approvedBy}`, partId, target.stockQuantity);
    setParts(prev => { const u = prev.filter(p => p.id !== partId); persistChanges({ parts: u }); return u; });
    setStockLevels(prev => { const u = prev.filter(l => l.partId !== partId); persistChanges({ stockLevels: u }); return u; });
    setStockBatches(prev => { const u = prev.filter(b => b.partId !== partId); persistChanges({ stockBatches: u }); return u; });
    setSerialUnits(prev => { const u = prev.filter(s => s.partId !== partId); persistChanges({ serialUnits: u }); return u; });
    setCart(prev => prev.filter(item => item.part.id !== partId));
  };

  const handleUpdateStock = (partId: string, addedStock: number) => {
    const target = parts.find(p => p.id === partId);
    if (target) {
      logStockMovements([{ part: target, qtyDelta: Math.max(-target.stockQuantity, addedStock), type: 'adjustment' }]);
      logAudit('stock.adjust', `${addedStock >= 0 ? 'توريد/زيادة' : 'خصم'} ${Math.abs(addedStock)} من ${target.name}`, partId, addedStock);
    }
    setParts(prev => {
      const updated = prev.map(p => {
        if (p.id === partId) {
          return { ...p, stockQuantity: Math.max(0, p.stockQuantity + addedStock), updatedAt: todayISO() };
        }
        return p;
      });
      persistChanges({ parts: updated });
      return updated;
    });
  };

  const handleUpdatePartPrices = (partId: string, costPrice: number, salePrice: number, barcode?: string) => {
    setParts(prev => {
      const updated = prev.map(p => {
        if (p.id === partId) {
          return barcode === undefined
            ? { ...p, costPrice, salePrice }
            : { ...p, costPrice, salePrice, barcode: barcode || undefined };
        }
        return p;
      });
      persistChanges({ parts: updated });
      return updated;
    });
  };

  // Cart Handlers for POS
  const handleAddToCart = (part: AutoPart) => {
    const live = parts.find(p => p.id === part.id) ?? part;   // الرصيد الحالي وليس نسخة قديمة
    const inCart = cart.find(item => item.part.id === part.id)?.quantity ?? 0;
    if (inCart + 1 > live.stockQuantity) {
      window.alert(`الرصيد المتاح من «${live.name}» هو ${live.stockQuantity} فقط`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.part.id === part.id);
      if (existing) {
        return prev.map(item => 
          item.part.id === part.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { part: live, quantity: 1, customPrice: live.salePrice }];
    });
  };

  const handleUpdateCartQuantity = (partId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(partId);
      return;
    }
    const live = parts.find(p => p.id === partId);
    if (live && quantity > live.stockQuantity) {
      window.alert(`الرصيد المتاح من «${live.name}» هو ${live.stockQuantity} فقط`);
      quantity = live.stockQuantity;
      if (quantity <= 0) { handleRemoveFromCart(partId); return; }
    }
    setCart(prev => prev.map(item => 
      item.part.id === partId ? { ...item, quantity } : item
    ));
  };

  const handleUpdateCartPrice = (partId: string, price: number) => {
    setCart(prev => prev.map(item => 
      item.part.id === partId ? { ...item, customPrice: Number.isFinite(price) && price >= 0 ? price : item.customPrice } : item
    ));
  };

  const handleRemoveFromCart = (partId: string) => {
    setCart(prev => prev.filter(item => item.part.id !== partId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Handlers for Invoices
  // ترجع true عند النجاح، و false لو رُفضت الفاتورة (رصيد غير كافٍ ...). لا يُخصم شيء عند الرفض.
  const handleAddCustomer = (newCust: Customer) => {
    setCustomers(prev => {
      const updated = [newCust, ...prev];
      persistChanges({ customers: updated });
      return updated;
    });
  };

  // ---------- نقاط الولاء (دفتر حركات هو مصدر الرصيد) ----------
  const appendLoyalty = (
    customerId: string | undefined,
    specs: { type: LoyaltyEntryType; points: number; refId?: string; refNumber?: string; note?: string; expires?: boolean }[]
  ) => {
    const cust = customerId ? customers.find(c => c.id === customerId) : undefined;
    if (!customerId || !cust) return;
    const cfg = resolveLoyalty(settings.loyalty);
    const base = Date.now();
    // فارق مللي ثانية بين حركات نفس العملية يضمن ترتيباً ثابتاً (الاستبدال قبل الاكتساب)
    const entries: LoyaltyEntry[] = specs
      .filter(s => s.points !== 0)
      .map((s, i) => {
        const at = new Date(base + i).toISOString();
        return {
          id: `LY-${base}-${i}-${Math.floor(Math.random() * 1000)}`,
          at,
          customerId,
          customerName: cust.name,
          type: s.type,
          points: s.points,
          refId: s.refId,
          refNumber: s.refNumber,
          note: s.note,
          userName: currentUser?.employeeName || 'غير معروف',
          expiresAt: s.expires && s.points > 0 && cfg.expiryMonths > 0 ? addMonths(at, cfg.expiryMonths) : undefined,
        };
      });
    if (entries.length === 0) return;
    setLoyaltyLedger(prev => {
      const updated = [...entries, ...prev];
      persistChanges({ loyaltyLedger: updated });
      return updated;
    });
  };

  const handleAdjustLoyalty = (customerId: string, delta: number, reason: string) => {
    if (effectiveRole !== 'مدير عام') {
      window.alert('تعديل نقاط الولاء يدوياً متاح للمدير العام فقط.');
      return;
    }
    const cust = customers.find(c => c.id === customerId);
    if (!cust || !delta) return;
    appendLoyalty(customerId, [{ type: 'adjust', points: delta, note: reason, expires: true }]);
    logAudit('loyalty.adjust', `نقاط ${cust.name}: ${delta > 0 ? '+' : ''}${delta} (${reason})`, customerId, delta);
  };

  // رصيد النقاط القابل للاستبدال لكل عميل (يستبعد المنتهي) — يُمرَّر للشاشات بدل الحقل القديم
  const loyaltyAvailable = useMemo(
    () => availableBalances(loyaltyLedger, new Date().toISOString()),
    [loyaltyLedger, loyaltyTick]
  );
  const chequesExposure = useMemo(() => pendingIncomingByCustomer(cheques), [cheques]);
  const customersWithPoints = useMemo(
    () => customers.map(c => ({ ...c, loyaltyPoints: loyaltyAvailable.get(c.id) ?? 0, chequesPending: chequesExposure.get(c.id) ?? 0 })),
    [customers, loyaltyAvailable, chequesExposure]
  );

  useEffect(() => {
    const t = setInterval(() => setLoyaltyTick(x => x + 1), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // (1) ترحيل أرصدة النسخة القديمة إلى السجل مرة واحدة (رقم ثابت => لا يتكرر)
  // (2) تسجيل انتهاء صلاحية الدفعات المستحقة (رقم وتاريخ ثابتان => آمن لو اشتغل جهازان معاً)
  useEffect(() => {
    if (!activeTenantId) return;
    const nowISO = new Date().toISOString();
    const have = new Set(loyaltyLedger.map(e => e.customerId));
    const openings: LoyaltyEntry[] = customers
      .filter(c => (c.loyaltyPoints || 0) > 0 && !have.has(c.id))
      .map(c => ({
        id: `LYO-${c.id}`, at: '2000-01-01T00:00:00.000Z', customerId: c.id, customerName: c.name, type: 'opening' as const,
        points: Math.floor(c.loyaltyPoints || 0), note: 'رصيد قبل تفعيل سجل النقاط', userName: 'النظام',
      }));
    const expiries = pendingExpiryEntries([...openings, ...loyaltyLedger], nowISO);
    const known = new Set(loyaltyLedger.map(e => e.id));
    const adds = [...openings, ...expiries].filter(e => !known.has(e.id));
    if (adds.length === 0) return;
    setLoyaltyLedger(prev => {
      const ids = new Set(prev.map(e => e.id));
      const fresh = adds.filter(e => !ids.has(e.id));
      if (fresh.length === 0) return prev;
      const updated = [...fresh, ...prev];
      persistChanges({ loyaltyLedger: updated });
      return updated;
    });
  }, [customers, loyaltyLedger, loyaltyTick, activeTenantId]);

  // ---------- الدفعات والسيريال ----------
  const commitBatches = (updater: (prev: StockBatch[]) => StockBatch[]) =>
    setStockBatches(prev => { const u = updater(prev); persistChanges({ stockBatches: u }); return u; });
  const commitSerials = (updater: (prev: SerialUnit[]) => SerialUnit[]) =>
    setSerialUnits(prev => { const u = updater(prev); persistChanges({ serialUnits: u }); return u; });

  /** عند توريد فاتورة مشتريات: تُنشأ دفعة/وحدات سيريال لكل سطر على صنف مُفعَّل له التتبع. */
  const registerPurchaseTracking = (invoice: PurchaseInvoice, allParts: AutoPart[]) => {
    const newBatches: StockBatch[] = [];
    const newUnits: SerialUnit[] = [];
    const stamp = Date.now();
    invoice.items.forEach((it, idx) => {
      const part = allParts.find(p => (it.partId && p.id === it.partId) || normKey(p.partNumber) === normKey(it.partNumber) || normKey(p.name) === normKey(it.partName));
      if (!part || !part.tracking || part.tracking === 'none') return;
      if (part.tracking === 'batch') {
        const seq = stockBatches.filter(b => b.partId === part.id && b.receivedDate === invoice.date).length + newBatches.filter(b => b.partId === part.id).length + 1;
        newBatches.push({
          id: `B-${stamp}-${idx}`,
          partId: part.id,
          batchNo: it.batchNo?.trim() || autoBatchNo(invoice.date, seq),
          expiryDate: it.expiryDate || undefined,
          receivedDate: invoice.date,
          quantity: it.quantity,
          initialQuantity: it.quantity,
          costPrice: it.costPrice,
          supplierName: invoice.supplierName,
          purchaseInvoiceId: invoice.id,
          purchaseInvoiceNumber: invoice.invoiceNumber,
        });
      } else if (part.tracking === 'serial') {
        const known = new Set(serialUnits.filter(u => u.partId === part.id).map(u => u.serial.trim().toLowerCase()));
        (it.serials || []).forEach((sn, i) => {
          const k = sn.trim().toLowerCase();
          if (!k || known.has(k)) return;     // دفاعي: لا يتكرر السيريال لنفس الصنف
          known.add(k);
          newUnits.push({
            id: `SN-${stamp}-${idx}-${i}`,
            partId: part.id,
            serial: sn.trim(),
            status: 'in_stock',
            receivedDate: invoice.date,
            purchaseInvoiceId: invoice.id,
            purchaseInvoiceNumber: invoice.invoiceNumber,
          });
        });
      }
    });
    if (newBatches.length) commitBatches(prev => [...newBatches, ...prev]);
    if (newUnits.length) commitSerials(prev => [...newUnits, ...prev]);
  };

  /** تطبيق أثر مرتجع (أو حذفه) على الدفعات والسيريال. يرجع الأسطر المحدّثة للفاتورة. */
  const applyReturnTracking = (inv: Invoice, retItems: { partNumber: string; partName: string; quantity: number; serials?: string[] }[], direction: 1 | -1) => {
    const batchOps: { batchId: string; qty: number }[] = [];
    const toStock = new Set<string>();
    const toSold = new Set<string>();
    const touchedPartIds = new Map<string, string>(); // serial -> partId
    retItems.forEach(r => {
      const it = inv.items.find(x => x.partNumber === r.partNumber && x.partName === r.partName);
      if (!it) return;
      const res = trackReturn(it, r.quantity, r.serials, direction);
      batchOps.push(...res.batchOps);
      res.unitsToStock.forEach(s => { toStock.add(`${it.partId}|${s.trim().toLowerCase()}`); touchedPartIds.set(s, it.partId || ''); });
      res.unitsToSold.forEach(s => { toSold.add(`${it.partId}|${s.trim().toLowerCase()}`); touchedPartIds.set(s, it.partId || ''); });
    });
    if (batchOps.length) commitBatches(prev => applyBatchOps(prev, batchOps, 1));   // الكميات موقّعة: موجب يضيف وسالب يخصم
    if (toStock.size || toSold.size) {
      commitSerials(prev => prev.map(u => {
        const key = `${u.partId}|${u.serial.trim().toLowerCase()}`;
        if (toStock.has(key)) return { ...u, status: 'in_stock' as const, soldInvoiceId: undefined, soldInvoiceNumber: undefined, soldAt: undefined, customerName: undefined, customerPhone: undefined };
        if (toSold.has(key)) return { ...u, status: 'sold' as const, soldInvoiceId: inv.id, soldInvoiceNumber: inv.invoiceNumber, soldAt: inv.date, customerName: inv.customerName, customerPhone: inv.customerPhone };
        return u;
      }));
    }
  };

  /** نفس منطق الإرجاع لكن على مستوى سطر الفاتورة الذي يُحفظ (يستدعى داخل تحديث الحالة النقي). */
  const trackedInvoiceItem = (it: Invoice['items'][number], r: { quantity: number; serials?: string[] } | undefined, direction: 1 | -1) =>
    r && (it.batchAllocations?.length || it.serials?.length) ? trackReturn(it, r.quantity, r.serials, direction).item : it;

  // ---------- إدارة الدفعات والسيريال (يدوي) ----------
  const handleSetTracking = (partId: string, mode: TrackingMode) => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;
    setParts(prev => {
      const updated = prev.map(p => (p.id === partId ? { ...p, tracking: mode === 'none' ? undefined : mode } : p));
      persistChanges({ parts: updated });
      return updated;
    });
    logAudit('stock.adjust', `نمط التتبع لـ ${part.name}: ${TRACKING_LABEL[mode]}`, partId);
  };

  const handleAddBatch = (input: { partId: string; batchNo: string; expiryDate?: string; quantity: number; note?: string }): { ok: boolean; message?: string } => {
    const part = parts.find(p => p.id === input.partId);
    if (!part) return { ok: false, message: 'اختر الصنف' };
    if (!(input.quantity > 0)) return { ok: false, message: 'الكمية يجب أن تكون أكبر من صفر' };
    const mine = stockBatches.filter(b => b.partId === part.id);
    const free = unassignedStock(part.stockQuantity, mine);
    if (input.quantity > free) return { ok: false, message: `المتاح بدون دفعة ${free} فقط (الرصيد الكلي ${part.stockQuantity} موزّع على دفعات)` };
    const today = todayISO();
    const batch: StockBatch = {
      id: `B-${Date.now()}`,
      partId: part.id,
      batchNo: input.batchNo.trim() || autoBatchNo(today, mine.filter(b => b.receivedDate === today).length + 1),
      expiryDate: input.expiryDate || undefined,
      receivedDate: today,
      quantity: input.quantity,
      initialQuantity: input.quantity,
      note: input.note?.trim() || undefined,
    };
    commitBatches(prev => [batch, ...prev]);
    logAudit('batch.create', `دفعة ${batch.batchNo} للصنف ${part.name} بكمية ${batch.quantity}${batch.expiryDate ? ` تنتهي ${batch.expiryDate}` : ''}`, batch.id, batch.quantity);
    return { ok: true };
  };

  const handleWriteOffBatch = (batchId: string, qty: number, reason: string): { ok: boolean; message?: string } => {
    const batch = stockBatches.find(b => b.id === batchId);
    const part = batch ? parts.find(p => p.id === batch.partId) : undefined;
    if (!batch || !part) return { ok: false, message: 'الدفعة غير موجودة' };
    if (!(qty > 0) || qty > batch.quantity) return { ok: false, message: `الكمية يجب أن تكون بين 1 و ${batch.quantity}` };
    if (reason.trim().length < 3) return { ok: false, message: 'اكتب سبب الإعدام / الاستبعاد' };
    commitBatches(prev => applyBatchOps(prev, [{ batchId, qty }], -1));
    const delta = -Math.min(qty, part.stockQuantity);
    setParts(prev => {
      const updated = prev.map(p => (p.id === part.id ? { ...p, stockQuantity: Math.max(0, p.stockQuantity - qty), updatedAt: todayISO() } : p));
      persistChanges({ parts: updated });
      return updated;
    });
    logStockMovements([{ part, qtyDelta: delta, type: 'adjustment', refId: batch.id, refNumber: batch.batchNo }]);
    logAudit('batch.writeoff', `إعدام ${qty} من دفعة ${batch.batchNo} (${part.name}): ${reason.trim()}`, batch.id, qty);
    return { ok: true };
  };

  const handleRegisterSerials = (partId: string, serials: string[]): { ok: boolean; message?: string } => {
    const part = parts.find(p => p.id === partId);
    if (!part) return { ok: false, message: 'اختر الصنف' };
    if (serials.length === 0) return { ok: false, message: 'اكتب رقماً تسلسلياً واحداً على الأقل' };
    const v = validateSerialIntake(serials, serials.length, partId, serialUnits);
    if (v.error === 'DUPLICATE_IN_LIST') return { ok: false, message: `الرقم ${v.detail} مكرر في القائمة` };
    if (v.error === 'ALREADY_EXISTS') return { ok: false, message: `الرقم ${v.detail} مسجّل بالفعل لهذا الصنف` };
    const free = Math.max(0, part.stockQuantity - inStockUnits(serialUnits, partId).length);
    if (serials.length > free) return { ok: false, message: `المتاح تسجيله ${free} فقط (رصيد الصنف ${part.stockQuantity} منها ${inStockUnits(serialUnits, partId).length} مسجّلة)` };
    const today = todayISO();
    const stamp = Date.now();
    const units: SerialUnit[] = serials.map((s, i) => ({ id: `SN-${stamp}-${i}`, partId, serial: s.trim(), status: 'in_stock', receivedDate: today }));
    commitSerials(prev => [...units, ...prev]);
    logAudit('serial.register', `تسجيل ${units.length} رقم تسلسلي للصنف ${part.name}`, partId, units.length);
    return { ok: true };
  };

  const handleScrapSerial = (unitId: string, reason: string): { ok: boolean; message?: string } => {
    const unit = serialUnits.find(u => u.id === unitId);
    const part = unit ? parts.find(p => p.id === unit.partId) : undefined;
    if (!unit || !part) return { ok: false, message: 'الوحدة غير موجودة' };
    if (unit.status !== 'in_stock') return { ok: false, message: 'لا يمكن استبعاد إلا وحدة موجودة بالمخزن' };
    if (reason.trim().length < 3) return { ok: false, message: 'اكتب سبب الاستبعاد' };
    commitSerials(prev => prev.map(u => (u.id === unitId ? { ...u, status: 'scrapped' as const, note: reason.trim() } : u)));
    setParts(prev => {
      const updated = prev.map(p => (p.id === part.id ? { ...p, stockQuantity: Math.max(0, p.stockQuantity - 1), updatedAt: todayISO() } : p));
      persistChanges({ parts: updated });
      return updated;
    });
    logStockMovements([{ part, qtyDelta: -Math.min(1, part.stockQuantity), type: 'adjustment', refId: unit.id, refNumber: unit.serial }]);
    logAudit('serial.scrap', `استبعاد السيريال ${unit.serial} (${part.name}): ${reason.trim()}`, unit.id, 1);
    return { ok: true };
  };

  // ---------- الشيكات ----------
  // يطبّق أثر الشيك على حساب العميل/المورد. التسجيل يخصم من الحساب، والارتداد/الإلغاء يعيده كما كان.
  const applyChequeEffectToParty = (cheque: Cheque, effect: ChequeEffect, isRegistration: boolean) => {
    if (cheque.partyType === 'customer' && effect.customerBalanceDelta) {
      setCustomers(prev => {
        const updated = prev.map(c => (c.id === cheque.partyId ? { ...c, balance: Math.max(0, c.balance + effect.customerBalanceDelta) } : c));
        persistChanges({ customers: updated });
        return updated;
      });
    }
    if (effect.supplier) {
      const sp = effect.supplier;
      setSuppliers(prev => {
        const updated = prev.map(s => {
          if (s.id !== cheque.partyId) return s;
          const debt = s.deferredDebt ?? s.balance ?? 0;
          const newDebt = Math.max(0, debt + sp.debtDelta);
          return {
            ...s,
            balance: newDebt,
            deferredDebt: newDebt,
            storeCredit: Math.max(0, (s.storeCredit || 0) + sp.creditDelta),
            totalPaid: Math.max(0, (s.totalPaid || 0) + sp.paidDelta),
            ...(isRegistration ? { lastPaymentDate: todayISO() } : {}),
          };
        });
        persistChanges({ suppliers: updated });
        return updated;
      });
    }
  };

  const handleAddCheque = (input: NewChequeInput): { ok: boolean; error?: ChequeError } => {
    const err = validateCheque(
      { number: input.number, amount: input.amount, dueDate: input.dueDate, partyId: input.partyId, bankName: input.bankName, direction: input.direction },
      cheques
    );
    if (err) return { ok: false, error: err };
    const isIncoming = input.direction === 'incoming';
    const party = isIncoming ? customers.find(c => c.id === input.partyId) : suppliers.find(s => s.id === input.partyId);
    if (!party) return { ok: false, error: 'PARTY_REQUIRED' };
    const { effect, applied } = registrationEffect(input.direction, input.amount, party as { balance: number; deferredDebt?: number });
    const nowISO = new Date().toISOString();
    const by = currentUser?.employeeName || 'غير معروف';
    const cheque: Cheque = {
      id: `CHQ-${Date.now()}`,
      number: input.number,
      direction: input.direction,
      status: initialStatus(input.direction),
      amount: input.amount,
      bankName: input.bankName,
      dueDate: input.dueDate,
      receivedDate: input.receivedDate || todayISO(),
      partyType: isIncoming ? 'customer' : 'supplier',
      partyId: input.partyId,
      partyName: party.name,
      drawerName: input.drawerName,
      notes: input.notes,
      createdBy: by,
      createdAt: nowISO,
      ...applied,
      history: [{ at: nowISO, status: initialStatus(input.direction), by, note: 'تسجيل الشيك' }],
    };
    applyChequeEffectToParty(cheque, effect, true);
    setCheques(prev => {
      const updated = [cheque, ...prev];
      persistChanges({ cheques: updated });
      return updated;
    });
    logAudit('cheque.create', `تسجيل شيك ${isIncoming ? 'وارد' : 'صادر'} رقم ${cheque.number} بمبلغ ${cheque.amount} (${party.name})`, cheque.id, cheque.amount);
    return { ok: true };
  };

  const handleChequeAction = (id: string, action: ChequeAction, note?: string): { ok: boolean; message?: string } => {
    const cur = cheques.find(c => c.id === id);
    if (!cur) return { ok: false, message: 'الشيك غير موجود' };
    const by = currentUser?.employeeName || 'غير معروف';
    const updated = applyAction(cur, action, by, new Date().toISOString(), note);
    if (!updated) return { ok: false, message: 'هذا الإجراء غير مسموح في حالة الشيك الحالية (ربما تغيّرت من جهاز آخر)' };
    const effect = actionEffect(cur, action);
    applyChequeEffectToParty(cur, effect, false);
    if (effect.treasury) {
      const t = effect.treasury;
      const tx: TreasuryTransaction = {
        id: `TX-CHQ-${Date.now()}`,
        txNumber: `TX-Q-${Math.floor(1000 + Math.random() * 9000)}`,
        date: todayISO(),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: t.type,
        category: t.category,
        amount: t.amount,
        paymentMethod: CHEQUE_PAYMENT_METHOD,
        balanceAfter: treasuryBalance + (t.type === 'قبض' ? t.amount : -t.amount),
        referenceId: cur.id,
        description: `${cur.direction === 'incoming' ? 'تحصيل شيك' : 'صرف شيك'} رقم ${cur.number} (${cur.partyName})`,
        recordedBy: by,
      };
      setTreasury(prev => {
        const list = [tx, ...prev];
        persistChanges({ treasuryTransactions: list });
        return list;
      });
    }
    setCheques(prev => {
      const list = prev.map(c => (c.id === id ? updated : c));
      persistChanges({ cheques: list });
      return list;
    });
    const label = action === 'clear' ? chequeClearLabel(cur.direction) : CHEQUE_ACTION_LABEL[action];
    logAudit('cheque.action', `${label}: شيك ${cur.number} (${cur.partyName}) ${cur.amount} ج.م`, cur.id, cur.amount);
    return { ok: true, message: `${label} — شيك ${cur.number}` };
  };

  // ---------- المخازن والفروع ----------
  // المخزن الرئيسي مشتق (الإجمالي - باقي المخازن)، فنحرّك فقط أرصدة المخازن غير الرئيسية.
  const shiftWarehouseStock = (
    warehouseId: string | undefined,
    rows: { partId?: string; partNumber?: string; qty: number }[],
    sign: 1 | -1
  ) => {
    if (normalizeWarehouseId(warehouseId) === MAIN_WAREHOUSE_ID) return;
    const lines = rows
      .map(r => ({ partId: r.partId || parts.find(p => p.partNumber === r.partNumber)?.id || '', qty: r.qty }))
      .filter(l => l.partId && l.qty > 0);
    if (lines.length === 0) return;
    setStockLevels(prev => {
      const updated = adjustLevels(prev, warehouseId, lines, sign);
      persistChanges({ stockLevels: updated });
      return updated;
    });
  };

  const handleSaveWarehouse = (w: Warehouse) => {
    setWarehouses(prev => {
      const updated = prev.some(x => x.id === w.id) ? prev.map(x => (x.id === w.id ? w : x)) : [...prev, w];
      persistChanges({ warehouses: updated });
      return updated;
    });
  };

  const handleCreateTransfer = (input: {
    fromWarehouseId: string; toWarehouseId: string; items: { partId: string; quantity: number }[]; note?: string;
  }): { ok: boolean; message?: string } => {
    const lines = input.items.map(i => ({ partId: i.partId, qty: i.quantity }));
    try {
      validateTransfer(input.fromWarehouseId, input.toWarehouseId, lines, parts, stockLevels);
    } catch (e) {
      const code = e instanceof TransferError ? e.code : 'UNKNOWN';
      const messages: Record<string, string> = {
        EMPTY: 'أضف صنفاً واحداً على الأقل',
        SAME_WAREHOUSE: 'المخزن المحوَّل منه والمحوَّل إليه متطابقان',
        INVALID_QTY: 'الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر',
        INSUFFICIENT_STOCK: 'الكمية المطلوبة أكبر من رصيد المخزن المحوَّل منه لأحد الأصناف',
      };
      return { ok: false, message: messages[code] || 'تعذّر تنفيذ التحويل' };
    }
    const nextLevels = applyTransfer(stockLevels, input.fromWarehouseId, input.toWarehouseId, lines);
    setStockLevels(nextLevels);
    persistChanges({ stockLevels: nextLevels });

    const now = new Date();
    const transfer: StockTransfer = {
      id: `TRF-${Date.now()}`,
      transferNumber: `TRF-${String(stockTransfers.length + 1).padStart(4, '0')}`,
      date: todayISO(),
      time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      fromWarehouseId: normalizeWarehouseId(input.fromWarehouseId),
      toWarehouseId: normalizeWarehouseId(input.toWarehouseId),
      items: input.items.map(i => {
        const part = parts.find(p => p.id === i.partId);
        return { partId: i.partId, partNumber: part?.partNumber || '', partName: part?.name || '', quantity: i.quantity };
      }),
      note: input.note?.trim() || undefined,
      createdBy: currentUser?.employeeName || 'غير معروف',
    };
    setStockTransfers(prev => {
      const updated = [transfer, ...prev];
      persistChanges({ stockTransfers: updated });
      return updated;
    });
    logAudit('stock.transfer', `تحويل مخزني ${transfer.transferNumber} (${input.items.length} صنف)`, transfer.id);
    return { ok: true, message: transfer.transferNumber };
  };

  const handleCreateInvoice = (invoice: Invoice): boolean => {
    // إلزام الوردية: لا بيع بدون وردية مفتوحة (لو الإعداد مفعّل) حتى يكون الدرج محسوباً
    if (settings.requireShiftForSales && !findOpenShift(shifts)) {
      window.alert('لازم تفتح وردية الأول (وتعدّ كاش الدرج) قبل ما تبيع.');
      setCurrentTab('shifts');
      return false;
    }
    // نقاط الولاء: إعادة التحقق من الرصيد على أحدث بيانات (قد يكون جهاز آخر استبدلها)
    const loyaltyCfg = resolveLoyalty(settings.loyalty);
    const loyaltyCustomer = invoice.customerId ? customers.find(c => c.id === invoice.customerId) : undefined;
    const redeemedPts = invoice.loyaltyRedeemedPoints || 0;
    const liveAvailable = invoice.customerId ? (availableBalances(loyaltyLedger, new Date().toISOString()).get(invoice.customerId) ?? 0) : 0;
    if (redeemedPts > 0 && (!loyaltyCfg.enabled || !loyaltyCustomer || liveAvailable < redeemedPts)) {
      window.alert('تعذّر إتمام البيع: رصيد نقاط الولاء للعميل لا يكفي لهذا الاستبدال (ربما استُخدمت النقاط من جهاز آخر).');
      return false;
    }
    const earnedPts = loyaltyCfg.enabled && loyaltyCustomer ? earnedPoints(invoice.grandTotal, loyaltyCfg.egpPerPoint) : 0;

    // 1) تجهيز السطور بمعرّف الصنف (المطابقة بالمعرّف أولاً، ثم رقم القطعة للفواتير القديمة)
    const lines = invoice.items.map(item => {
      const part = (item.partId && parts.find(p => p.id === item.partId))
        || parts.find(p => p.partNumber === item.partNumber);
      return { item, part, partId: part?.id ?? '' };
    });

    // 2) إعادة التحقق من الرصيد على أحدث بيانات (قد يكون جهاز آخر باع في الأثناء)
    let nextParts: AutoPart[];
    try {
      if (lines.some(l => !l.part)) throw new SaleError('INVALID_QTY');
      // الرصيد المتاح في مخزن البيع (قد يكون أقل من إجمالي الرصيد لو جزء منه في فرع آخر)
      const needByPart = new Map<string, number>();
      lines.forEach(l => needByPart.set(l.partId, (needByPart.get(l.partId) ?? 0) + l.item.quantity));
      for (const [pid, qty] of needByPart) {
        const total = parts.find(p => p.id === pid)?.stockQuantity ?? 0;
        const available = availableIn(total, stockLevels, pid, invoice.warehouseId);
        if (qty > available) throw new SaleError('OUT_OF_STOCK', { partId: pid, requested: qty, available });
      }
      nextParts = deductStock<AutoPart>(
        parts,
        lines.map(l => ({ partId: l.partId, qty: l.item.quantity, unitPrice: l.item.unitPrice, unitCost: l.item.costPrice ?? 0 }))
      ).map(p => (lines.some(l => l.partId === p.id) ? { ...p, updatedAt: todayISO() } : p));
    } catch (e) {
      const code = e instanceof SaleError ? e.code : 'INVALID_QTY';
      window.alert(`تعذّر إتمام البيع: ${SALE_ERROR_MESSAGES[code] || code}`);
      return false;
    }

    // 2ب) تتبع الدفعات والسيريال: يرفض البيع لو الصالح غير كافٍ أو السيريال غير متاح
    const trackedExtras: Record<number, { batchAllocations?: import('./utils/trackingLogic').BatchAllocation[]; serials?: string[] }> = {};
    const batchOpsAll: { batchId: string; qty: number }[] = [];
    const soldSerialKeys = new Set<string>();
    {
      let workingBatches = stockBatches;
      let workingUnits = serialUnits;
      for (let i = 0; i < lines.length; i++) {
        const { item, part } = lines[i];
        if (!part || !part.tracking || part.tracking === 'none') continue;
        if (part.tracking === 'batch') {
          const res = allocateFefo(workingBatches.filter(b => b.partId === part.id), item.quantity, part.stockQuantity, todayISO());
          if (!res.ok) {
            window.alert(`تعذّر إتمام البيع: «${part.name}» — الكمية الصالحة غير كافية${res.expiredQty > 0 ? ` (يوجد ${res.expiredQty} منتهية الصلاحية ولا تُباع، استبعدها من شاشة الدفعات)` : ''}.`);
            return false;
          }
          const ops = res.allocations.map(a => ({ batchId: a.batchId, qty: a.qty }));
          workingBatches = applyBatchOps(workingBatches, ops, -1);
          batchOpsAll.push(...ops);
          trackedExtras[i] = { batchAllocations: res.allocations };
        } else {
          const v = validateSerialSale(item.serials, item.quantity, part.id, workingUnits);
          if (v.error) {
            const why = v.error === 'COUNT_MISMATCH' ? `اختر ${item.quantity} رقم تسلسلي (المختار ${item.serials?.length ?? 0})`
              : v.error === 'DUPLICATE_IN_LIST' ? `الرقم ${v.detail} مكرر في الاختيار`
              : `الرقم التسلسلي ${v.detail} غير متاح بالمخزن لهذا الصنف`;
            window.alert(`تعذّر إتمام البيع: «${part.name}» — ${why}.`);
            return false;
          }
          v.units.forEach(u => soldSerialKeys.add(u.id));
          workingUnits = workingUnits.map(u => (soldSerialKeys.has(u.id) ? { ...u, status: 'sold' as const } : u));
          trackedExtras[i] = { serials: (item.serials || []).map(s => s.trim()) };
        }
      }
    }

    // 3) حفظ الفاتورة (بعد إضافة partId لكل سطر)
    const finalInvoice: Invoice = {
      ...invoice,
      items: invoice.items.map((it, i) => ({ ...it, partId: lines[i].partId, ...(trackedExtras[i] || {}) })),
      loyaltyEarned: earnedPts > 0 ? earnedPts : undefined,
    };
    appendLoyalty(finalInvoice.customerId, [
      { type: 'redeem', points: -redeemedPts, refId: finalInvoice.id, refNumber: finalInvoice.invoiceNumber },
      { type: 'earn', points: earnedPts, refId: finalInvoice.id, refNumber: finalInvoice.invoiceNumber, expires: true },
    ]);
    setInvoices(prev => {
      const updated = [finalInvoice, ...prev];
      persistChanges({ invoices: updated });
      return updated;
    });

    if (batchOpsAll.length) commitBatches(prev => applyBatchOps(prev, batchOpsAll, -1));
    if (soldSerialKeys.size) {
      commitSerials(prev => prev.map(u => (soldSerialKeys.has(u.id)
        ? { ...u, status: 'sold' as const, soldInvoiceId: finalInvoice.id, soldInvoiceNumber: finalInvoice.invoiceNumber, soldAt: finalInvoice.date, customerName: finalInvoice.customerName, customerPhone: finalInvoice.customerPhone }
        : u)));
    }

    // 4) المخزن + دفتر الحركات
    setParts(nextParts);
    persistChanges({ parts: nextParts });
    shiftWarehouseStock(finalInvoice.warehouseId, lines.map(l => ({ partId: l.partId, qty: l.item.quantity })), -1);
    logStockMovements(lines.map(l => ({
      part: l.part!, qtyDelta: -l.item.quantity, type: 'sale' as const, refId: finalInvoice.id, refNumber: finalInvoice.invoiceNumber,
    })));

    // 5) المدفوعات: كل طريقة دفع في حسابها بالخزنة، والآجل على حساب العميل
    const payments: InvoicePayment[] = finalInvoice.payments && finalInvoice.payments.length > 0
      ? finalInvoice.payments
      : [{ method: finalInvoice.paymentMethod, amount: finalInvoice.grandTotal }];
    const creditAmount = payments.filter(p => isCreditPayment(String(p.method))).reduce((s, p) => s + p.amount, 0);

    if (creditAmount > 0) {
      setCustomers(prev => {
        const nameKey = normKey(finalInvoice.customerName);
        const phoneKey = normKey(finalInvoice.customerPhone);
        const idx = prev.findIndex(c =>
          (finalInvoice.customerId && c.id === finalInvoice.customerId) ||
          (phoneKey && normKey(c.phone) === phoneKey) || normKey(c.name) === nameKey
        );
        let updated: Customer[];
        if (idx >= 0) {
          updated = prev.map((c, i) => i === idx ? {
            ...c,
            balance: c.balance + creditAmount,
            totalPurchases: (c.totalPurchases || 0) + finalInvoice.grandTotal,
            monthlyPurchases: (c.monthlyPurchases || 0) + finalInvoice.grandTotal,
            invoicesCount: (c.invoicesCount || 0) + 1,
            lastVisit: finalInvoice.date,
            phone: c.phone || finalInvoice.customerPhone || '',
          } : c);
        } else {
          const created: Customer = {
            id: `cust-${Date.now()}`,
            name: finalInvoice.customerName || 'عميل آجل',
            type: finalInvoice.customerType === 'ورشة' ? 'ورشة فنية' : 'عميل تجزئة',
            phone: finalInvoice.customerPhone || '',
            balance: creditAmount,
            totalPurchases: finalInvoice.grandTotal,
            monthlyPurchases: finalInvoice.grandTotal,
            invoicesCount: 1,
            lastVisit: finalInvoice.date,
          };
          updated = [created, ...prev];
        }
        persistChanges({ customers: updated });
        return updated;
      });
    }

    const cashPayments = payments.filter(p => !isCreditPayment(String(p.method)) && p.amount > 0);
    if (cashPayments.length > 0) {
      let running = treasuryBalance;
      const txs: TreasuryTransaction[] = cashPayments.map((p, i) => {
        running += p.amount;
        return {
          id: `TX-SALE-${Date.now()}-${i}`,
          txNumber: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
          date: finalInvoice.date,
          time: finalInvoice.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          type: 'قبض' as const,
          category: 'مبيعات كاشير (فواتير بيع)' as const,
          amount: p.amount,
          paymentMethod: String(p.method),
          balanceAfter: running,
          referenceId: finalInvoice.id,
          description: `مبيعات فاتورة #${finalInvoice.invoiceNumber} - عميل: ${finalInvoice.customerName}`,
          recordedBy: currentUser?.employeeName || 'الكاشير',
        };
      });
      setTreasury(prev => {
        const updated = [...txs.reverse(), ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }

    // 6) تدقيق: من باع، وهل في سعر معدّل أو خصم
    logAudit('invoice.create', `فاتورة ${finalInvoice.invoiceNumber} - ${finalInvoice.customerName}`, finalInvoice.id, finalInvoice.grandTotal);
    if ((finalInvoice.discount || 0) > 0) {
      logAudit('invoice.discount', `خصم ${finalInvoice.discount} ج.م على فاتورة ${finalInvoice.invoiceNumber}`, finalInvoice.id, finalInvoice.discount);
    }
    finalInvoice.items.forEach(it => {
      const original = parts.find(p => p.id === it.partId)?.salePrice;
      if (original !== undefined && it.unitPrice !== original) {
        logAudit('invoice.price_override', `سعر ${it.partName}: ${original} ← ${it.unitPrice} (فاتورة ${finalInvoice.invoiceNumber})`, finalInvoice.id, it.unitPrice - original);
      }
    });

    // Clear cart on completion
    setCart([]);
    return true;
  };

  // إلغاء فاتورة بيع (Void): لا تُحذف الفاتورة (يبقى الترقيم متصلاً)، وتُعكس آثارها:
  // المخزون (المتبقي بعد أي مرتجع سابق) + الخزنة + حساب العميل الآجل. يتطلب سبباً وموافقة مدير.
  const handleVoidInvoice = (invoiceId: string, reason: string, approvedBy: string): boolean => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv || inv.status === 'ملغاة') return false;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return false;

    const payments: InvoicePayment[] = inv.payments && inv.payments.length > 0
      ? inv.payments
      : [{ method: inv.paymentMethod, amount: inv.grandTotal }];
    // خطة العكس (دالة نقية مُختبرة): المرتجع السابق رُدّت قيمته وقته، فنعكس المتبقي فقط
    const plan = computeVoidPlan({
      grandTotal: inv.grandTotal,
      returnedAmount: inv.returnedAmount,
      items: inv.items,
      payments: payments.map(p => ({ method: String(p.method), amount: p.amount })),
    });
    const fraction = plan.fraction;
    // عكس الولاء: تُسحب النقاط المتبقية من الفاتورة وتُرد النقاط المستبدلة
    appendLoyalty(inv.customerId, [
      { type: 'reverse_earn', points: -loyaltyAfterReturn(inv.loyaltyEarned || 0, inv.grandTotal, inv.returnedAmount || 0), refId: inv.id, refNumber: inv.invoiceNumber, note: cleanReason },
      { type: 'reverse_redeem', points: inv.loyaltyRedeemedPoints || 0, refId: inv.id, refNumber: inv.invoiceNumber, note: cleanReason, expires: true },
    ]);

    // استرجاع الدفعات والسيريال لكل ما لم يرجع بمرتجع سابق
    applyReturnTracking(
      inv,
      inv.items
        .filter(it => it.batchAllocations?.length || it.serials?.length)
        .map(it => ({ partNumber: it.partNumber, partName: it.partName, quantity: it.quantity - (it.returnedQuantity || 0) }))
        .filter(r => r.quantity > 0),
      1
    );

    // 1) المخزون: إعادة الكميات المتبقية
    const moves: Parameters<typeof logStockMovements>[0] = [];
    const nextParts = parts.map(part => {
      const qty = plan.restock
        .filter(r => (r.partId ? r.partId === part.id : r.partNumber === part.partNumber))
        .reduce((sum, r) => sum + r.qty, 0);
      if (qty <= 0) return part;
      moves.push({ part, qtyDelta: qty, type: 'sale_void', refId: inv.id, refNumber: inv.invoiceNumber });
      return { ...part, stockQuantity: part.stockQuantity + qty, updatedAt: todayISO() };
    });
    setParts(nextParts);
    persistChanges({ parts: nextParts });
    shiftWarehouseStock(inv.warehouseId, plan.restock.map(r => ({ partId: r.partId, partNumber: r.partNumber, qty: r.qty })), 1);
    logStockMovements(moves);

    // 2) الفاتورة
    setInvoices(prev => {
      const updated = prev.map(i => i.id === invoiceId ? {
        ...i,
        status: 'ملغاة' as const,
        voidedAt: new Date().toISOString(),
        voidedBy: currentUser?.employeeName || 'غير معروف',
        voidApprovedBy: approvedBy,
        voidReason: cleanReason,
      } : i);
      persistChanges({ invoices: updated });
      return updated;
    });

    // 3) المدفوعات: رد كل طريقة دفع من حسابها، وتخفيض مديونية العميل الآجل
    const creditAmount = plan.creditAmount;

    if (creditAmount > 0) {
      setCustomers(prev => {
        const nameKey = normKey(inv.customerName);
        const phoneKey = normKey(inv.customerPhone);
        const updated = prev.map(c =>
          ((inv.customerId && c.id === inv.customerId) || (phoneKey && normKey(c.phone) === phoneKey) || normKey(c.name) === nameKey)
            ? {
                ...c,
                balance: c.balance - creditAmount,
                totalPurchases: Math.max(0, (c.totalPurchases || 0) - inv.grandTotal * fraction),
                monthlyPurchases: Math.max(0, (c.monthlyPurchases || 0) - inv.grandTotal * fraction),
                invoicesCount: Math.max(0, (c.invoicesCount || 0) - 1),
              }
            : c
        );
        persistChanges({ customers: updated });
        return updated;
      });
    }

    const refunds = plan.refunds;
    if (refunds.length > 0) {
      let running = treasuryBalance;
      const txs: TreasuryTransaction[] = refunds.map((r, i) => {
        running -= r.amount;
        return {
          id: `TX-VOID-${Date.now()}-${i}`,
          txNumber: `TX-V-${Math.floor(1000 + Math.random() * 9000)}`,
          date: todayISO(),
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          type: 'صرف' as const,
          category: 'إلغاء فاتورة بيع (رد للخزنة)' as const,
          amount: r.amount,
          paymentMethod: r.method,
          balanceAfter: running,
          referenceId: inv.id,
          description: `إلغاء فاتورة #${inv.invoiceNumber} - ${cleanReason}`,
          recordedBy: currentUser?.employeeName || 'الكاشير',
        };
      });
      setTreasury(prev => {
        const updated = [...txs.reverse(), ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }

    logAudit('invoice.void', `إلغاء فاتورة ${inv.invoiceNumber} — السبب: ${cleanReason} — بموافقة: ${approvedBy}`, inv.id, inv.grandTotal * fraction);
    return true;
  };

  // Handlers for Sales Returns
  const handleAddSalesReturn = (rawReturn: SalesReturn) => {
    // تثبيت السيريالات المرتجعة فعلياً داخل سجل المرتجع (المختارة من الشاشة أو تلقائياً)
    const origInv = invoices.find(i => i.id === rawReturn.invoiceId);
    const salesReturn: SalesReturn = origInv
      ? {
          ...rawReturn,
          items: rawReturn.items.map(r => {
            const it = origInv.items.find(x => x.partNumber === r.partNumber && x.partName === r.partName);
            if (!it?.serials?.length) return r;
            return { ...r, serials: trackReturn(it, r.quantity, r.serials, 1).unitsToStock };
          }),
        }
      : rawReturn;
    if (origInv) applyReturnTracking(origInv, salesReturn.items, 1);
    setSalesReturns(prev => {
      const updated = [salesReturn, ...prev];
      persistChanges({ salesReturns: updated });
      return updated;
    });

    // خصم قيمة المرتجع من الفاتورة الأصلية وتحديث حالتها
    setInvoices(prev => {
      const updated = prev.map(inv => {
        if (inv.id !== salesReturn.invoiceId) return inv;
        const items = inv.items.map(it => {
          const r = salesReturn.items.find(i => i.partNumber === it.partNumber && i.partName === it.partName);
          return r ? { ...trackedInvoiceItem(it, r, 1), returnedQuantity: (it.returnedQuantity || 0) + r.quantity } : it;
        });
        const allReturned = items.every(it => (it.returnedQuantity || 0) >= it.quantity);
        return {
          ...inv,
          items,
          returnedAmount: (inv.returnedAmount || 0) + salesReturn.totalRefundAmount,
          status: allReturned ? 'مرتجع كلي' as const : 'مرتجع جزئي' as const,
        };
      });
      persistChanges({ invoices: updated });
      return updated;
    });

    // Restock parts if returned
    if (salesReturn.items && salesReturn.items.length > 0) {
      const moves: Parameters<typeof logStockMovements>[0] = [];
      const updated = parts.map(part => {
        const item = salesReturn.items.find(i => i.partNumber === part.partNumber);
        if (item) {
          moves.push({ part, qtyDelta: item.quantity, type: 'sales_return', refId: salesReturn.id, refNumber: salesReturn.returnNumber });
          return { ...part, stockQuantity: part.stockQuantity + item.quantity, updatedAt: todayISO() };
        }
        return part;
      });
      setParts(updated);
      persistChanges({ parts: updated });
      logStockMovements(moves);
    }
    shiftWarehouseStock(invoices.find(i => i.id === salesReturn.invoiceId)?.warehouseId,
      (salesReturn.items || []).map(i => ({ partNumber: i.partNumber, qty: i.quantity })), 1);
    {
      const inv = invoices.find(i => i.id === salesReturn.invoiceId);
      if (inv) {
        const before = loyaltyAfterReturn(inv.loyaltyEarned || 0, inv.grandTotal, inv.returnedAmount || 0);
        const after = loyaltyAfterReturn(inv.loyaltyEarned || 0, inv.grandTotal, (inv.returnedAmount || 0) + salesReturn.totalRefundAmount);
        appendLoyalty(inv.customerId, [{ type: 'return', points: -(before - after), refId: salesReturn.id, refNumber: salesReturn.returnNumber }]);
      }
    }
    logAudit('sales_return.create', `مرتجع مبيعات ${salesReturn.returnNumber || salesReturn.id} - ${salesReturn.customerName}`, salesReturn.id, -salesReturn.totalRefundAmount);

    // المرتجع على حساب العميل الآجل: يُخصم من مديونيته (وإن زاد عنها يصبح له رصيد دائن ظاهر بالسالب)
    if (salesReturn.refundMethod === 'خصم من رصيد العميل الآجل') {
      const original = invoices.find(i => i.id === salesReturn.invoiceId);
      setCustomers(prev => {
        const nameKey = normKey(salesReturn.customerName);
        const phoneKey = normKey(original?.customerPhone);
        const updated = prev.map(c =>
          ((phoneKey && normKey(c.phone) === phoneKey) || normKey(c.name) === nameKey)
            ? { ...c, balance: c.balance - salesReturn.totalRefundAmount }
            : c
        );
        persistChanges({ customers: updated });
        return updated;
      });
    }

    // Add refund treasury transaction if cash paid out
    if (salesReturn.totalRefundAmount > 0 && salesReturn.treasuryDeducted) {
      const original = invoices.find(i => i.id === salesReturn.invoiceId);
      const refundViaWallet = salesReturn.refundMethod === 'إنستاباي / محفظة';
      const newTx: TreasuryTransaction = {
        id: `TX-RET-${Date.now()}`,
        txNumber: `TX-R-${Math.floor(1000 + Math.random() * 9000)}`,
        date: salesReturn.date,
        time: salesReturn.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'صرف',
        category: 'مرتجع مبيعات نقدي (صرف من الخزنة)',
        amount: salesReturn.totalRefundAmount,
        // يُخصم من نفس الحساب الذي دخلت منه الفاتورة (كاش/إنستاباي/فيزا...)
        paymentMethod: refundViaWallet ? (original && !isCreditMethod(original.paymentMethod) ? original.paymentMethod : 'انستاباي / InstaPay') : 'نقدي',
        balanceAfter: treasuryBalance - salesReturn.totalRefundAmount,
        referenceId: salesReturn.id,
        description: `مرتجع مبيعات #${salesReturn.returnNumber || salesReturn.id} - عميل: ${salesReturn.customerName}`,
        recordedBy: currentUser?.employeeName || 'الكاشير'
      };
      setTreasury(prev => {
        const updated = [newTx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }
  };

  const handleDeleteSalesReturn = (returnId: string) => {
    const ret = salesReturns.find(r => r.id === returnId);
    setSalesReturns(prev => {
      const updated = prev.filter(r => r.id !== returnId);
      persistChanges({ salesReturns: updated });
      return updated;
    });
    if (!ret) return;

    const origInvForDelete = invoices.find(i => i.id === ret.invoiceId);
    if (origInvForDelete) applyReturnTracking(origInvForDelete, ret.items, -1);

    // عكس أثر المرتجع على الفاتورة
    setInvoices(prev => {
      const updated = prev.map(inv => {
        if (inv.id !== ret.invoiceId) return inv;
        const items = inv.items.map(it => {
          const r = ret.items.find(i => i.partNumber === it.partNumber && i.partName === it.partName);
          return r ? { ...trackedInvoiceItem(it, r, -1), returnedQuantity: Math.max(0, (it.returnedQuantity || 0) - r.quantity) } : it;
        });
        const returnedAmount = Math.max(0, (inv.returnedAmount || 0) - ret.totalRefundAmount);
        const anyReturned = items.some(it => (it.returnedQuantity || 0) > 0);
        const allReturned = items.every(it => (it.returnedQuantity || 0) >= it.quantity);
        return {
          ...inv,
          items,
          returnedAmount,
          status: !anyReturned ? 'مسددة' as const : allReturned ? 'مرتجع كلي' as const : 'مرتجع جزئي' as const,
        };
      });
      persistChanges({ invoices: updated });
      return updated;
    });

    // عكس المخزن: الكمية التي رجعت بالمرتجع تُسحب مرة أخرى
    {
      const moves: Parameters<typeof logStockMovements>[0] = [];
      const updated = parts.map(part => {
        const item = ret.items.find(i => i.partNumber === part.partNumber);
        if (!item) return part;
        moves.push({ part, qtyDelta: -item.quantity, type: 'sales_return_delete', refId: ret.id, refNumber: ret.returnNumber });
        return { ...part, stockQuantity: Math.max(0, part.stockQuantity - item.quantity), updatedAt: todayISO() };
      });
      setParts(updated);
      persistChanges({ parts: updated });
      logStockMovements(moves);
    }
    shiftWarehouseStock(invoices.find(i => i.id === ret.invoiceId)?.warehouseId,
      ret.items.map(i => ({ partNumber: i.partNumber, qty: i.quantity })), -1);
    {
      const inv = invoices.find(i => i.id === ret.invoiceId);
      if (inv) {
        const cur = inv.returnedAmount || 0;
        const before = loyaltyAfterReturn(inv.loyaltyEarned || 0, inv.grandTotal, cur);
        const after = loyaltyAfterReturn(inv.loyaltyEarned || 0, inv.grandTotal, Math.max(0, cur - ret.totalRefundAmount));
        appendLoyalty(inv.customerId, [{ type: 'return_undo', points: after - before, refId: ret.id, refNumber: ret.returnNumber, expires: true }]);
      }
    }
    logAudit('sales_return.delete', `حذف مرتجع مبيعات ${ret.returnNumber || ret.id}`, ret.id, ret.totalRefundAmount);

    // عكس رصيد العميل الآجل
    if (ret.refundMethod === 'خصم من رصيد العميل الآجل') {
      const original = invoices.find(i => i.id === ret.invoiceId);
      setCustomers(prev => {
        const nameKey = normKey(ret.customerName);
        const phoneKey = normKey(original?.customerPhone);
        const updated = prev.map(c =>
          ((phoneKey && normKey(c.phone) === phoneKey) || normKey(c.name) === nameKey)
            ? { ...c, balance: c.balance + ret.totalRefundAmount }
            : c
        );
        persistChanges({ customers: updated });
        return updated;
      });
    }

    // رد المبلغ للخزنة إن كان قد صُرف
    if (ret.totalRefundAmount > 0 && ret.treasuryDeducted) {
      const refundTx = treasury.find(t => t.referenceId === ret.id);
      const tx: TreasuryTransaction = {
        id: `TX-RETDEL-${Date.now()}`,
        txNumber: `TX-RD-${Math.floor(1000 + Math.random() * 9000)}`,
        date: todayISO(),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'قبض',
        category: 'إلغاء مرتجع مبيعات (رد للخزنة)',
        amount: ret.totalRefundAmount,
        paymentMethod: refundTx?.paymentMethod || 'نقدي',
        balanceAfter: treasuryBalance + ret.totalRefundAmount,
        referenceId: ret.id,
        description: `حذف مرتجع مبيعات #${ret.returnNumber || ret.id} - عميل: ${ret.customerName}`,
        recordedBy: currentUser?.employeeName || 'الكاشير'
      };
      setTreasury(prev => {
        const updated = [tx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }
  };

  // Handlers for Purchases
  const handleAddPurchaseInvoice = (invoice: PurchaseInvoice) => {
    setPurchaseInvoices(prev => {
      const updated = [invoice, ...prev];
      persistChanges({ purchaseInvoices: updated });
      return updated;
    });

    // Keep supplier ledger synchronized with the purchase invoice.
    // لو للمحل رصيد دائن عند المورد (من مرتجع سابق) يُخصم أولاً من المتبقي على هذه الفاتورة.
    setSuppliers(prev => {
      const updated = prev.map(s => {
        if (s.id !== invoice.supplierId) return s;
        const remaining = Math.max(0, invoice.grandTotal - invoice.amountPaid);
        const credit = s.storeCredit || 0;
        const usedCredit = Math.min(credit, remaining);
        const debtNow = Math.max(0, (s.deferredDebt ?? s.balance ?? 0) + remaining - usedCredit);
        return {
          ...s,
          totalSupplied: (s.totalSupplied || 0) + invoice.grandTotal,
          totalPaid: (s.totalPaid || 0) + invoice.amountPaid,
          deferredDebt: debtNow,
          balance: debtNow,
          storeCredit: credit - usedCredit,
        };
      });
      persistChanges({ suppliers: updated });
      return updated;
    });

    // Increase stock for purchased parts — والأصناف الجديدة تُضاف للمخزن تلقائياً بالرصيد
    {
      const today = todayISO();
      // تجميع كميات كل صنف في الفاتورة (قد يتكرر الصنف في أكثر من سطر)
      const byKey = new Map<string, { item: typeof invoice.items[number]; qty: number }>();
      invoice.items.forEach(item => {
        const key = normKey(item.partNumber) || normKey(item.partName);
        const cur = byKey.get(key);
        if (cur) byKey.set(key, { item, qty: cur.qty + item.quantity });
        else byKey.set(key, { item, qty: item.quantity });
      });

      const matched = new Set<string>();
      const movements: Parameters<typeof logStockMovements>[0] = [];
      const updatedExisting = parts.map(part => {
        const k1 = normKey(part.partNumber);
        const hit = byKey.get(k1) ?? byKey.get(normKey(part.name));
        if (!hit) return part;
        matched.add(byKey.get(k1) ? k1 : normKey(part.name));
        movements.push({ part, qtyDelta: hit.qty, type: 'purchase', refId: invoice.id, refNumber: invoice.invoiceNumber });
        return {
          ...part,
          stockQuantity: part.stockQuantity + hit.qty,
          costPrice: hit.item.costPrice || part.costPrice,
          updatedAt: today,
        };
      });

      const newParts: AutoPart[] = [];
      byKey.forEach(({ item, qty }, key) => {
        if (matched.has(key)) return;
        const created: AutoPart = {
          id: `p-${Date.now()}-${newParts.length}`,
          partNumber: item.partNumber || `NEW-${Date.now().toString().slice(-6)}-${newParts.length + 1}`,
          name: item.partName,
          brand: item.brand || GENERAL_BRAND,
          compatibleModels: 'عام',
          category: item.category,
          origin: 'تجاري درجة 1',
          shelfLocation: 'مستودع رئيسي',
          costPrice: item.costPrice,
          salePrice: item.salePrice || item.costPrice,
          stockQuantity: qty,
          minAlertStock: 2,
          unit: 'حبة',
          createdAt: today,
          updatedAt: today,
          ...(item.tracking && item.tracking !== 'none' ? { tracking: item.tracking } : {}),
        };
        newParts.push(created);
        // الصنف الجديد: رصيده بعد الحركة = الكمية الموردة (الرصيد قبلها صفر)
        movements.push({ part: { ...created, stockQuantity: 0 }, qtyDelta: qty, type: 'purchase', refId: invoice.id, refNumber: invoice.invoiceNumber });
      });

      const nextParts = [...newParts, ...updatedExisting];
      setParts(nextParts);
      persistChanges({ parts: nextParts });
      logStockMovements(movements);
      // الاستلام في مخزن/فرع غير رئيسي: نحرّك رصيده بمعرّفات الأصناف (تشمل الأصناف الجديدة)
      shiftWarehouseStock(invoice.warehouseId, movements.map(m => ({ partId: m.part.id, qty: m.qtyDelta })), 1);
      registerPurchaseTracking(invoice, nextParts);
    }
    logAudit('purchase.create', `فاتورة مشتريات ${invoice.invoiceNumber} - ${invoice.supplierName}`, invoice.id, invoice.grandTotal);

    // Treasury transaction if paid cash
    if (invoice.amountPaid > 0) {
      const newTx: TreasuryTransaction = {
        id: `TX-PUR-${Date.now()}`,
        txNumber: `TX-P-${Math.floor(1000 + Math.random() * 9000)}`,
        date: invoice.date,
        time: invoice.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'صرف',
        category: 'فاتورة مشتريات نقدية',
        amount: invoice.amountPaid,
        paymentMethod: invoice.paymentMethod,
        balanceAfter: treasuryBalance - invoice.amountPaid,
        referenceId: invoice.id,
        description: `مشتريات بضاعة فاتورة #${invoice.invoiceNumber} - مورد: ${invoice.supplierName}`,
        recordedBy: currentUser?.employeeName || 'إدارة المشتريات'
      };
      setTreasury(prev => {
        const updated = [newTx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }
  };

  const handleAddPurchaseReturn = (purchaseReturn: PurchaseReturn) => {
    const supplier = suppliers.find(s => s.id === purchaseReturn.supplierId);
    const originalInvoice = purchaseInvoices.find(i => i.id === purchaseReturn.purchaseInvoiceId);

    // توزيع قيمة المرتجع: (1) استرداد نقدي إن اختير، (2) تخفيض مديونية المورد، (3) الباقي رصيد دائن للمحل عند المورد
    const cashRefund = Math.min(Math.max(0, purchaseReturn.cashRefundToTreasury || 0), purchaseReturn.totalReturnAmount);
    const nonCash = Math.max(0, purchaseReturn.totalReturnAmount - cashRefund);
    const debtBefore = supplier ? (supplier.deferredDebt ?? supplier.balance ?? 0) : 0;
    const deducted = Math.min(nonCash, debtBefore);
    const credited = nonCash - deducted;

    const finalReturn: PurchaseReturn = {
      ...purchaseReturn,
      cashRefundToTreasury: cashRefund,
      deductedFromDeferredDebt: deducted,
      creditedToStoreBalance: credited,
      unpaidDebtBeforeReturn: debtBefore,
      unpaidDebtAfterReturn: debtBefore - deducted,
      isSettled: true,
    };

    setPurchaseReturns(prev => {
      const updated = [finalReturn, ...prev];
      persistChanges({ purchaseReturns: updated });
      return updated;
    });

    // حساب المورد: تخفيض المديونية + رصيد دائن للمحل (لا يضيع الفائض ويظهر بدل الصفر)
    if (supplier) {
      setSuppliers(prev => {
        const updated = prev.map(s => {
          if (s.id !== purchaseReturn.supplierId) return s;
          const newDebt = Math.max(0, (s.deferredDebt ?? s.balance ?? 0) - deducted);
          return {
            ...s,
            deferredDebt: newDebt,
            balance: newDebt,
            storeCredit: (s.storeCredit || 0) + credited,
            totalReturned: (s.totalReturned || 0) + purchaseReturn.totalReturnAmount,
          };
        });
        persistChanges({ suppliers: updated });
        return updated;
      });
    }

    // خصم قيمة المرتجع من فاتورة المشتريات الأصلية وتحديث حالتها
    if (originalInvoice) {
      setPurchaseInvoices(prev => {
        const updated = prev.map(inv => {
          if (inv.id !== purchaseReturn.purchaseInvoiceId) return inv;
          const original = inv.originalGrandTotal ?? (inv.grandTotal + (inv.returnedAmount || 0));
          const returnedAmount = (inv.returnedAmount || 0) + purchaseReturn.totalReturnAmount;
          const newGrandTotal = Math.max(0, original - returnedAmount);
          const newPaid = Math.max(0, inv.amountPaid - cashRefund);
          const items = inv.items.map(it => {
            const r = purchaseReturn.items.find(i => i.partNumber === it.partNumber && i.partName === it.partName);
            return r ? { ...it, returnedQuantity: (it.returnedQuantity || 0) + r.quantity } : it;
          });
          return {
            ...inv,
            items,
            originalGrandTotal: original,
            returnedAmount,
            grandTotal: newGrandTotal,
            amountPaid: newPaid,
            remainingBalance: Math.max(0, newGrandTotal - newPaid),
            paymentStatus: newGrandTotal === 0 ? 'مرتجع كلي' as const : 'مرتجع جزئي' as const,
          };
        });
        persistChanges({ purchaseInvoices: updated });
        return updated;
      });
    }

    // Reduce stock
    {
      const moves: Parameters<typeof logStockMovements>[0] = [];
      const updated = parts.map(part => {
        const item = purchaseReturn.items.find(i => i.partNumber === part.partNumber);
        if (!item) return part;
        moves.push({ part, qtyDelta: -item.quantity, type: 'purchase_return', refId: purchaseReturn.id, refNumber: purchaseReturn.returnNumber });
        return { ...part, stockQuantity: Math.max(0, part.stockQuantity - item.quantity), updatedAt: todayISO() };
      });
      setParts(updated);
      persistChanges({ parts: updated });
      logStockMovements(moves);
    }
    shiftWarehouseStock(originalInvoice?.warehouseId,
      purchaseReturn.items.map(i => ({ partNumber: i.partNumber, qty: i.quantity })), -1);
    logAudit('purchase_return.create', `مرتجع مشتريات ${purchaseReturn.returnNumber || purchaseReturn.id} - ${purchaseReturn.supplierName}`, purchaseReturn.id, -purchaseReturn.totalReturnAmount);

    // If cash refund received to treasury
    if (cashRefund > 0) {
      const newTx: TreasuryTransaction = {
        id: `TX-PR-${Date.now()}`,
        txNumber: `TX-PR-${Math.floor(1000 + Math.random() * 9000)}`,
        date: purchaseReturn.date,
        time: purchaseReturn.time,
        type: 'قبض',
        category: 'مرتجع مشتريات نقدي (توريد للخزنة)',
        amount: cashRefund,
        paymentMethod: originalInvoice?.paymentMethod || 'نقدي',
        balanceAfter: treasuryBalance + cashRefund,
        referenceId: purchaseReturn.id,
        description: `استرداد نقدي لمرتجع مشتريات من مورد: ${purchaseReturn.supplierName}`,
        recordedBy: currentUser?.employeeName || 'مسؤول المشتريات'
      };
      setTreasury(prev => {
        const updated = [newTx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }
  };

  // تسوية مرتجع مشتريات قديم سُجّل قبل إصلاح الأرصدة: يطبّق أثره على رصيد المورد والفاتورة (بدون لمس المخزن أو الخزنة)
  const handleSettlePurchaseReturn = (returnId: string) => {
    const ret = purchaseReturns.find(r => r.id === returnId);
    if (!ret || ret.isSettled) return;

    const supplier = suppliers.find(s => s.id === ret.supplierId);
    logAudit('purchase_return.settle', `تسوية مرتجع مشتريات ${ret.returnNumber || ret.id}`, ret.id, ret.totalReturnAmount);
    const cashRefund = Math.min(Math.max(0, ret.cashRefundToTreasury || 0), ret.totalReturnAmount);
    const nonCash = Math.max(0, ret.totalReturnAmount - cashRefund);
    const debtBefore = supplier ? (supplier.deferredDebt ?? supplier.balance ?? 0) : 0;
    const deducted = Math.min(nonCash, debtBefore);
    const credited = nonCash - deducted;

    setPurchaseReturns(prev => {
      const updated = prev.map(r => r.id === returnId ? {
        ...r,
        deductedFromDeferredDebt: deducted,
        creditedToStoreBalance: credited,
        unpaidDebtBeforeReturn: debtBefore,
        unpaidDebtAfterReturn: debtBefore - deducted,
        isSettled: true,
      } : r);
      persistChanges({ purchaseReturns: updated });
      return updated;
    });

    if (supplier) {
      setSuppliers(prev => {
        const updated = prev.map(s => {
          if (s.id !== ret.supplierId) return s;
          const newDebt = Math.max(0, (s.deferredDebt ?? s.balance ?? 0) - deducted);
          return {
            ...s,
            deferredDebt: newDebt,
            balance: newDebt,
            storeCredit: (s.storeCredit || 0) + credited,
            totalReturned: (s.totalReturned || 0) + ret.totalReturnAmount,
          };
        });
        persistChanges({ suppliers: updated });
        return updated;
      });
    }

    setPurchaseInvoices(prev => {
      const updated = prev.map(inv => {
        if (inv.id !== ret.purchaseInvoiceId) return inv;
        if ((inv.returnedAmount || 0) >= ret.totalReturnAmount) return inv; // أثره مسجل على الفاتورة بالفعل
        const original = inv.originalGrandTotal ?? (inv.grandTotal + (inv.returnedAmount || 0));
        const returnedAmount = (inv.returnedAmount || 0) + ret.totalReturnAmount;
        const newGrandTotal = Math.max(0, original - returnedAmount);
        const newPaid = Math.max(0, inv.amountPaid - cashRefund);
        const items = inv.items.map(it => {
          const r = ret.items.find(i => i.partNumber === it.partNumber && i.partName === it.partName);
          return r ? { ...it, returnedQuantity: (it.returnedQuantity || 0) + r.quantity } : it;
        });
        return {
          ...inv,
          items,
          originalGrandTotal: original,
          returnedAmount,
          grandTotal: newGrandTotal,
          amountPaid: newPaid,
          remainingBalance: Math.max(0, newGrandTotal - newPaid),
          paymentStatus: newGrandTotal === 0 ? 'مرتجع كلي' as const : 'مرتجع جزئي' as const,
        };
      });
      persistChanges({ purchaseInvoices: updated });
      return updated;
    });
  };

  const handleDeletePurchaseReturn = (returnId: string) => {
    const ret = purchaseReturns.find(r => r.id === returnId);
    setPurchaseReturns(prev => {
      const updated = prev.filter(r => r.id !== returnId);
      persistChanges({ purchaseReturns: updated });
      return updated;
    });
    if (!ret) return;

    const cashRefund = Math.max(0, ret.cashRefundToTreasury || 0);
    const deducted = ret.deductedFromDeferredDebt || 0;
    const credited = ret.creditedToStoreBalance || 0;
    const wasApplied = Boolean(ret.isSettled) || deducted > 0 || credited > 0;

    // عكس رصيد المورد (فقط إن كان أثر المرتجع قد طُبّق عليه)
    if (wasApplied) {
      setSuppliers(prev => {
        const updated = prev.map(s => {
          if (s.id !== ret.supplierId) return s;
          const newDebt = (s.deferredDebt ?? s.balance ?? 0) + deducted;
          return {
            ...s,
            deferredDebt: newDebt,
            balance: newDebt,
            storeCredit: Math.max(0, (s.storeCredit || 0) - credited),
            totalReturned: Math.max(0, (s.totalReturned || 0) - ret.totalReturnAmount),
          };
        });
        persistChanges({ suppliers: updated });
        return updated;
      });
    }

    // عكس أثره على فاتورة المشتريات
    setPurchaseInvoices(prev => {
      const updated = prev.map(inv => {
        if (inv.id !== ret.purchaseInvoiceId) return inv;
        if ((inv.returnedAmount || 0) < ret.totalReturnAmount) return inv; // لم يُطبَّق على الفاتورة أصلاً
        const returnedAmount = (inv.returnedAmount || 0) - ret.totalReturnAmount;
        const original = inv.originalGrandTotal ?? (inv.grandTotal + (inv.returnedAmount || 0));
        const newGrandTotal = Math.max(0, original - returnedAmount);
        const newPaid = inv.amountPaid + cashRefund;
        const items = inv.items.map(it => {
          const r = ret.items.find(i => i.partNumber === it.partNumber && i.partName === it.partName);
          return r ? { ...it, returnedQuantity: Math.max(0, (it.returnedQuantity || 0) - r.quantity) } : it;
        });
        const remaining = Math.max(0, newGrandTotal - newPaid);
        return {
          ...inv,
          items,
          originalGrandTotal: original,
          returnedAmount,
          grandTotal: newGrandTotal,
          amountPaid: newPaid,
          remainingBalance: remaining,
          paymentStatus: returnedAmount > 0
            ? (newGrandTotal === 0 ? 'مرتجع كلي' as const : 'مرتجع جزئي' as const)
            : (remaining === 0 ? 'مدفوعة نقداً' as const : newPaid > 0 ? 'مسددة جزئياً' as const : 'آجل' as const),
        };
      });
      persistChanges({ purchaseInvoices: updated });
      return updated;
    });

    // عكس المخزن: الكمية المرتجعة للمورد تعود للمخزن
    {
      const moves: Parameters<typeof logStockMovements>[0] = [];
      const updated = parts.map(part => {
        const item = ret.items.find(i => i.partNumber === part.partNumber);
        if (!item) return part;
        moves.push({ part, qtyDelta: item.quantity, type: 'purchase_return_delete', refId: ret.id, refNumber: ret.returnNumber });
        return { ...part, stockQuantity: part.stockQuantity + item.quantity, updatedAt: todayISO() };
      });
      setParts(updated);
      persistChanges({ parts: updated });
      logStockMovements(moves);
    }
    shiftWarehouseStock(purchaseInvoices.find(i => i.id === ret.purchaseInvoiceId)?.warehouseId,
      ret.items.map(i => ({ partNumber: i.partNumber, qty: i.quantity })), 1);
    logAudit('purchase_return.delete', `حذف مرتجع مشتريات ${ret.returnNumber || ret.id}`, ret.id, ret.totalReturnAmount);

    // عكس الاسترداد النقدي
    if (cashRefund > 0) {
      const refundTx = treasury.find(t => t.referenceId === ret.id);
      const tx: TreasuryTransaction = {
        id: `TX-PRDEL-${Date.now()}`,
        txNumber: `TX-PD-${Math.floor(1000 + Math.random() * 9000)}`,
        date: todayISO(),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'صرف',
        category: 'إلغاء مرتجع مشتريات (عكس الاسترداد)',
        amount: cashRefund,
        paymentMethod: refundTx?.paymentMethod || 'نقدي',
        balanceAfter: treasuryBalance - cashRefund,
        referenceId: ret.id,
        description: `حذف مرتجع مشتريات من مورد: ${ret.supplierName}`,
        recordedBy: currentUser?.employeeName || 'مسؤول المشتريات'
      };
      setTreasury(prev => {
        const updated = [tx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }
  };

  // Handlers for Car Models
  const handleAddCarModel = (model: CarModel) => {
    setCarModels(prev => {
      const updated = [model, ...prev];
      persistChanges({ carModels: updated });
      return updated;
    });
  };

  const handleUpdateCarModel = (model: CarModel) => {
    setCarModels(prev => {
      const updated = prev.map(m => m.id === model.id ? model : m);
      persistChanges({ carModels: updated });
      return updated;
    });
  };

  const handleDeleteCarModel = (modelId: string) => {
    setCarModels(prev => {
      const updated = prev.filter(m => m.id !== modelId);
      persistChanges({ carModels: updated });
      return updated;
    });
  };

  // Handlers for Inventory Discrepancy Errors
  const handleAddInventoryError = (error: InventoryDiscrepancyError) => {
    setInventoryErrors(prev => {
      const updated = [error, ...prev];
      persistChanges({ inventoryErrors: updated });
      return updated;
    });
  };

  const handleDeleteInventoryError = (errorId: string) => {
    setInventoryErrors(prev => {
      const updated = prev.filter(e => e.id !== errorId);
      persistChanges({ inventoryErrors: updated });
      return updated;
    });
  };

  const handleCorrectInventoryError = (
    errorId: string, 
    action: InventoryDiscrepancyError['correctionAction']
  ) => {
    const errorRecord = inventoryErrors.find(e => e.id === errorId);
    if (!errorRecord) return;

    // 1. Update the error record
    const updatedRecord: InventoryDiscrepancyError = {
      ...errorRecord,
      isCorrected: true,
      correctionAction: action,
      correctedDate: new Date().toISOString().split('T')[0]
    };

    setInventoryErrors(prev => {
      const updated = prev.map(e => e.id === errorId ? updatedRecord : e);
      persistChanges({ inventoryErrors: updated });
      return updated;
    });

    // 2. Adjust stock if required
    if (action === 'تعديل رصيد المخزن' || action === 'تسوية جردية أرباح وخسائر') {
      const targetPart = parts.find(p => p.id === errorRecord.partId);
      if (targetPart) {
        const adjustedStock = Math.max(0, targetPart.stockQuantity + errorRecord.differenceQty);
        logStockMovements([{ part: targetPart, qtyDelta: adjustedStock - targetPart.stockQuantity, type: 'adjustment' }]);
        logAudit('stock.adjust', `تسوية جرد ${targetPart.name}: ${targetPart.stockQuantity} ← ${adjustedStock}`, targetPart.id, adjustedStock - targetPart.stockQuantity);
        handleUpdatePart({ ...targetPart, stockQuantity: adjustedStock, updatedAt: todayISO() });
      }
    }

    // 3. Financial adjustment if applicable
    if (action === 'خصم من أمين المخزن') {
      const tx: TreasuryTransaction = {
        id: `TX-ERR-${Date.now()}`,
        txNumber: `TX-E-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'قبض',
        category: 'تسوية خطأ مخزني',
        amount: Math.abs(errorRecord.estimatedFinancialImpact),
        paymentMethod: 'نقدي',
        balanceAfter: treasuryBalance + Math.abs(errorRecord.estimatedFinancialImpact),
        description: `تسوية خطأ مخزني [خصم من أمين المخزن]: صنف ${errorRecord.partName}`,
        recordedBy: currentUser?.employeeName || 'مدير النظام'
      };
      setTreasury(prev => {
        const updated = [tx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }
  };

  // Add Expense
  const handleAddExpense = (newExp: Expense) => {
    setExpenses(prev => {
      const updated = [newExp, ...prev];
      persistChanges({ expenses: updated });
      return updated;
    });
    // Add to treasury
    const tx: TreasuryTransaction = {
      id: `TX-EXP-${Date.now()}`,
      txNumber: `TX-EX-${Math.floor(1000 + Math.random() * 9000)}`,
      date: newExp.date,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      type: 'صرف',
      category: 'مصروفات تشغيلية',
      amount: newExp.amount,
      paymentMethod: newExp.paymentMethod,
      balanceAfter: treasuryBalance - newExp.amount,
      description: `مصروف: ${newExp.title} (${newExp.category})`,
      recordedBy: newExp.recordedBy || currentUser?.employeeName || 'المحاسب'
    };
    setTreasury(prev => {
      const updated = [tx, ...prev];
      persistChanges({ treasuryTransactions: updated });
      return updated;
    });
  };

  // Active Notifications Count
  const activeNotificationsCount = useMemo(() => {
    const exhaustedStockCount = parts.filter(p => p.stockQuantity <= 0).length;
    const unresolvedErrors = inventoryErrors.filter(e => !e.isCorrected).length;
    const chequeAlerts = canAccessTab('cheques') ? attentionCount(cheques, todayISO(), 3) : 0; // يظهر فقط لمن يملك صلاحية الشيكات
    const bk = expiryBuckets(stockBatches, todayISO());
    const expiryAlerts = canAccessTab('tracking') ? bk.expired.length + bk.within30.length : 0;   // دفعات منتهية أو تنتهي خلال 30 يوماً
    return exhaustedStockCount + unresolvedErrors + chequeAlerts + expiryAlerts;
  }, [parts, inventoryErrors, cheques, stockBatches, effectiveRole, effectivePermissions]);

  // Auth / Login Handler
  const handleLoginSuccess = (session: UserSession, tenant: TenantLicense, emps: Employee[]) => {
    setCurrentUser(session);
    setActiveTenantId(tenant.tenantId);
    setActiveTenantIdState(tenant.tenantId);
    setEmployees(emps);
    setLicenses(loadTenantLicenses());
    reloadTenantData(tenant);
  };

  const handleLogout = () => {
    clearUserSession();
    setCurrentUser(null);
  };

  // Owner administration is isolated from the shop UI and is only rendered at /owner.
  // Production security still requires server-side authentication and API authorization.
  // ---- Back gesture / back button: never close the installed app by accident ----
  // Swiping from the screen edge (or pressing back) used to leave the app because it
  // has no browser history. Now back closes open dialogs, then returns to the home
  // page, and only a second back within 2 seconds actually leaves.
  const backStateRef = useRef({ tab: currentTab, anyModal: false });
  backStateRef.current = {
    tab: currentTab,
    anyModal:
      showInventoryErrors || showCarModels || showPhotoSharing || showExcelModal || showDeploymentGuide ||
      showNotifications || showVoiceAssistant || showInventoryAudit,
  };
  const lastBackRef = useRef(0);
  const [exitHint, setExitHint] = useState(false);

  useEffect(() => {
    try {
      window.history.pushState({ malvia: 'guard' }, '');
    } catch {
      return;
    }
    const onPop = () => {
      const { tab, anyModal } = backStateRef.current;
      if (!anyModal && tab === 'dashboard' && Date.now() - lastBackRef.current < 2000) {
        // second back in a row: really leave
        window.removeEventListener('popstate', onPop);
        window.history.back();
        return;
      }
      window.history.pushState({ malvia: 'guard' }, '');
      if (anyModal) {
        setShowInventoryErrors(false);
        setShowCarModels(false);
        setShowPhotoSharing(false);
        setShowExcelModal(false);
        setShowDeploymentGuide(false);
        setShowNotifications(false);
        setShowVoiceAssistant(false);
        setShowInventoryAudit(false);
      } else if (tab !== 'dashboard') {
        setCurrentTab('dashboard');
      } else {
        lastBackRef.current = Date.now();
        setExitHint(true);
        window.setTimeout(() => setExitHint(false), 2000);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (window.location.pathname.replace(/\/$/, '') === '/owner') {
    return (
      <SuperAdminPortal
        isOpen={true}
        onClose={() => { window.location.replace('/'); }}
        licenses={licenses}
        activeTenantId={activeTenantId}
        onUpdateLicenses={(newLicenses) => {
          setLicenses(newLicenses); saveTenantLicenses(newLicenses);
          if (getAdminToken()) pushRegistry(newLicenses).then(r => { if (!r.ok) window.alert('تعذر حفظ التراخيص في السحابة: ' + (r.error || '')); });
        }}
        onSelectTenant={(tenantId) => { setActiveTenantId(tenantId); setActiveTenantIdState(tenantId); window.location.replace('/'); }}
      />
    );
  }

  // Check if license is locked or device needs activation
  const deviceSavedLicenseKey = getDeviceSavedLicenseKey();
  if (!activeTenant || (!currentUser && !deviceSavedLicenseKey && showActivationGateway)) {
    return (
      <TenantActivationGateway
        isOpen={true}
        licenses={licenses}
        currentLicense={activeTenant}
        onActivateKey={(key: string) => {
          const found = licenses.find(l => l.licenseKey.toUpperCase() === key.trim().toUpperCase());
          if (found) {
            saveDeviceLicenseKey(found.licenseKey);
            setActiveTenantId(found.tenantId);
            setActiveTenantIdState(found.tenantId);
            reloadTenantData(found);
            setShowActivationGateway(false);
            return { success: true, message: 'تم تفعيل المحل بنجاح', license: found };
          }
          return { success: false, message: 'مفتاح الترخيص غير صحيح' };
        }}
      />
    );
  }

  // If no user is logged in for this shop, display shop login view
  if (!currentUser) {
    return (
      <ShopLoginView
        licenses={licenses}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950 pb-20 lg:pb-0" dir="rtl">
      <SyncBadge />
      {exitHint && (
        <div className="fixed bottom-24 lg:bottom-8 inset-x-0 z-[70] flex justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-full bg-neutral-800 border border-neutral-700 text-xs font-bold text-white shadow-2xl">
            اضغط رجوع مرة أخرى للخروج من التطبيق
          </div>
        </div>
      )}
      
      {/* Sidebar + Top Bar + Mobile Bottom Bar (wraps the page content) */}
      <Navigation
        simpleMode={simpleMode}
        canAccessTab={canAccessTab}
        canManageInventory={canManageInventoryNow}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        activeNotificationsCount={activeNotificationsCount}
        onOpenNotifications={() => setShowNotifications(true)}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        onOpenDeploymentGuide={() => setShowDeploymentGuide(true)}
        onOpenInventoryAudit={() => setShowInventoryAudit(true)}
        onOpenInventoryErrors={() => setShowInventoryErrors(true)}
        onOpenCarModels={() => setShowCarModels(true)}
        onOpenPhotoSharing={() => setShowPhotoSharing(true)}
        onOpenExcelModal={() => setShowExcelModal(true)}
        onLogout={handleLogout}
        currentUser={currentUser}
        shopName={activeTenant.companyName}
      >
        {/* Main View Router */}
        {!viewTab && (
          <div className="p-6 rounded-2xl bg-surface-1 border border-rose-500/30 text-sm text-rose-300 font-bold">
            ليس لديك صلاحية فتح هذه الشاشة. تواصل مع المدير لتعديل صلاحياتك.
          </div>
        )}

        {viewTab === 'dashboard' && (
          <HomeDashboard
            parts={parts}
            invoices={invoices}
            treasuryTransactions={treasury}
            onOpenTreasuryReports={() => setCurrentTab('finance')}
            currentSession={currentUser && effectiveRole && effectivePermissions ? { ...currentUser, role: effectiveRole, permissions: effectivePermissions } : currentUser}
            onChangeTab={setCurrentTab}
            onOpenInvoiceModal={(inv) => setSelectedInvoiceForDetail(inv)}
            onAddNewPart={() => setCurrentTab('inventory')}
            onQuickSalePart={(part) => {
              handleAddToCart(part);
              setCurrentTab('pos');
            }}
            onOpenNotifications={() => setShowNotifications(true)}
            onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                onOpenInventoryErrors={() => setShowInventoryErrors(true)}
            onOpenPhotoSharing={() => setShowPhotoSharing(true)}
            onOpenExcelModal={() => setShowExcelModal(true)}
          />
        )}

        {viewTab === 'pos' && (
          <QuickPosView
            parts={parts}
            carModels={carModels}
            invoices={invoices}
            carBrands={carBrands}
            onAddBrand={handleAddBrand}
            onRemoveBrand={handleRemoveBrand}
            customers={customersWithPoints}
            cart={cart}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onUpdateCartPrice={handleUpdateCartPrice}
            onRemoveFromCart={handleRemoveFromCart}
            onClearCart={handleClearCart}
            onCheckoutComplete={handleCreateInvoice}
            vatRate={settings.vatRate}
            canSellBelowCost={currentUser?.role === 'مدير عام'}
            employees={employees}
            maxDiscountPercent={10}
            warehouses={warehouses}
            stockLevels={stockLevels}
            loyalty={resolveLoyalty(settings.loyalty)}
            onAddCustomer={handleAddCustomer}
            serialUnits={serialUnits}
            stockBatches={stockBatches}
            cashierName={currentUser?.employeeName}
            cashierId={currentUser?.employeeId}
            onOpenVoiceAssistant={simpleMode ? undefined : () => setShowVoiceAssistant(true)}
            onOpenReturns={() => setCurrentTab('invoices')}
            shiftOpen={Boolean(openShift)}
            shiftRequired={Boolean(settings.requireShiftForSales)}
            onOpenShifts={() => setCurrentTab('shifts')}
          />
        )}

        {viewTab === 'lowstock' && (
          <LowStockView
            parts={parts}
            canManage={canManageInventoryNow}
            onUpdateStock={handleUpdateStock}
            onNavigateToInventory={() => setCurrentTab('inventory')}
          />
        )}

        {viewTab === 'warehouses' && (
          <WarehousesView
            warehouses={warehouses}
            parts={parts}
            stockLevels={stockLevels}
            transfers={stockTransfers}
            canManage={currentUser?.role === 'مدير عام' || Boolean(currentUser?.permissions?.canManageInventory)}
            onSaveWarehouse={handleSaveWarehouse}
            onTransfer={handleCreateTransfer}
          />
        )}

        {viewTab === 'tracking' && (
          <TrackingView
            parts={parts}
            batches={stockBatches}
            units={serialUnits}
            onSetTracking={handleSetTracking}
            onAddBatch={handleAddBatch}
            onWriteOff={handleWriteOffBatch}
            onRegisterSerials={handleRegisterSerials}
            onScrapSerial={handleScrapSerial}
          />
        )}

        {viewTab === 'cheques' && (
          <ChequesView
            cheques={cheques}
            customers={customers}
            suppliers={suppliers}
            onAdd={handleAddCheque}
            onAction={handleChequeAction}
          />
        )}

        {viewTab === 'shifts' && (
          <ShiftsView
            shifts={shifts}
            treasury={treasury}
            isManager={currentUser?.role === 'مدير عام' || Boolean(currentUser?.permissions?.canManageTreasury)}
            currentUserName={currentUser?.employeeName || ''}
            requireShiftForSales={Boolean(settings.requireShiftForSales)}
            openShiftsCount={openShiftsCount}
            onOpenShift={handleOpenShift}
            onCloseShift={handleCloseShift}
            onToggleRequireShift={handleToggleRequireShift}
          />
        )}

        {viewTab === 'inventory' && (
          <InventoryView
            parts={parts}
            invoices={invoices}
            purchaseInvoices={purchaseInvoices}
            salesReturns={salesReturns}
            purchaseReturns={purchaseReturns}
            carBrands={carBrands}
            onAddBrand={handleAddBrand}
            onRemoveBrand={handleRemoveBrand}
            onAddNewPart={handleAddPart}
            onUpdateStock={handleUpdateStock}
            employees={employees}
            onDeletePart={handleDeletePart}
            onUpdatePartPrices={handleUpdatePartPrices}
            onQuickSalePart={(part) => {
              handleAddToCart(part);
              setCurrentTab('pos');
            }}
            onOpenPhotoSharing={() => setShowPhotoSharing(true)}
            onOpenExcelModal={() => setShowExcelModal(true)}
            onOpenInventoryErrors={() => setShowInventoryErrors(true)}
            onOpenBarcodeStocktake={() => setShowBarcodeStocktake(true)}
          />
        )}

        {viewTab === 'invoices' && (
          <InvoicesView
            employees={employees}
            currentUserRole={currentUser?.role}
            currentUserName={currentUser?.employeeName}
            onVoidInvoice={handleVoidInvoice}
            invoices={invoices}
            salesReturns={salesReturns}
            onOpenInvoiceModal={(inv: Invoice) => setSelectedInvoiceForDetail(inv)}
            onSalesReturn={handleAddSalesReturn}
            onDeleteSalesReturn={handleDeleteSalesReturn}
          />
        )}

        {viewTab === 'purchases' && (
          <PurchasesView
            carBrands={carBrands.filter(b => b !== GENERAL_BRAND)}
            purchaseInvoices={purchaseInvoices}
            purchaseReturns={purchaseReturns}
            suppliers={suppliers}
            warehouses={warehouses}
            serialUnits={serialUnits}
            parts={parts}
            treasuryBalance={treasuryBalance}
            onAddPurchaseInvoice={handleAddPurchaseInvoice}
            onPurchaseReturn={handleAddPurchaseReturn}
            onDeletePurchaseReturn={handleDeletePurchaseReturn}
            onAddSupplier={(newSup: Supplier) => {
              setSuppliers(prev => {
                const updated = [newSup, ...prev];
                persistChanges({ suppliers: updated });
                return updated;
              });
            }}
          />
        )}

        {viewTab === 'customers' && (
          <CustomersView
            customers={customersWithPoints}
            onAddCustomer={handleAddCustomer}
            loyaltyEnabled={resolveLoyalty(settings.loyalty).enabled}
            canAdjustLoyalty={effectiveRole === 'مدير عام'}
            loyaltyEntries={loyaltyLedger}
            onAdjustLoyalty={handleAdjustLoyalty}
            onUpdateCreditLimit={(customerId: string, limit: number) => {
              const cust = customers.find(c => c.id === customerId);
              logAudit('customer.credit_limit', `حد ائتمان ${cust?.name || customerId}: ${limit > 0 ? limit + ' ج.م' : 'غير محدود'}`, customerId, limit);
              setCustomers(prev => {
                const updated = prev.map(c => c.id === customerId ? { ...c, creditLimit: limit } : c);
                persistChanges({ customers: updated });
                return updated;
              });
            }}
            onSettleBalance={(customerId: string, amount: number) => {
              const cust = customers.find(c => c.id === customerId);
              logAudit('customer.collect', `تحصيل ${amount} ج.م من ${cust?.name || customerId}`, customerId, amount);
              setCustomers(prev => {
                const updated = prev.map(c => c.id === customerId ? { ...c, balance: Math.max(0, c.balance - amount) } : c);
                persistChanges({ customers: updated });
                return updated;
              });
              // التحصيل من العميل يدخل الخزنة (كان لا يُسجَّل في الخزنة)
              const tx: TreasuryTransaction = {
                id: `TX-CUST-${Date.now()}`,
                txNumber: `TX-C-${Math.floor(1000 + Math.random() * 9000)}`,
                date: todayISO(),
                time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                type: 'قبض',
                category: 'تحصيل من عميل / ورشة',
                amount,
                paymentMethod: 'نقدي',
                balanceAfter: treasuryBalance + amount,
                referenceId: customerId,
                description: `تحصيل من عميل: ${cust?.name || customerId}`,
                recordedBy: currentUser?.employeeName || 'الكاشير'
              };
              setTreasury(prev => {
                const updated = [tx, ...prev];
                persistChanges({ treasuryTransactions: updated });
                return updated;
              });
            }}
          />
        )}

        {viewTab === 'suppliers' && (
          <SuppliersView
            suppliers={suppliers}
            supplierPayments={supplierPayments}
            purchaseInvoices={purchaseInvoices}
            purchaseReturns={purchaseReturns}
            treasuryBalance={treasuryBalance}
            onUpdateSupplier={(updatedSupplier) => {
              setSuppliers(prev => { const updated = prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s); persistChanges({ suppliers: updated }); return updated; });
            }}
            onAddPurchaseReturn={handleAddPurchaseReturn}
            onSettlePurchaseReturn={handleSettlePurchaseReturn}
            onAddSupplier={(newSup: Supplier) => {
              setSuppliers(prev => {
                const updated = [newSup, ...prev];
                persistChanges({ suppliers: updated });
                return updated;
              });
            }}
            onSettleSupplierPayment={(supplierId, amount, paymentDate, paymentMethod, _treasurySource, notes) => {
              const supplier = suppliers.find(s => s.id === supplierId);
              setSuppliers(prev => {
                const updated = prev.map(s => {
                  if (s.id !== supplierId) return s;
                  const debt = s.deferredDebt ?? s.balance ?? 0;
                  const newDebt = Math.max(0, debt - amount);
                  const overpaid = Math.max(0, amount - debt); // الزيادة عن المديونية = رصيد دائن للمحل عند المورد
                  return { ...s, balance: newDebt, deferredDebt: newDebt, storeCredit: (s.storeCredit || 0) + overpaid, totalPaid: (s.totalPaid || 0) + amount, lastPaymentDate: paymentDate };
                });
                persistChanges({ suppliers: updated });
                return updated;
              });
              const paymentRecord: import('./types/autoParts').SupplierPayment = { id: `SP-${Date.now()}`, paymentNumber: `SP-${Date.now().toString().slice(-6)}`, supplierId, supplierName: supplier?.name || supplierId, amount, paymentDate, paymentMethod, treasurySource: _treasurySource, notes, recordedBy: currentUser?.employeeName || 'مسؤول المشتريات' };
              setSupplierPayments(prev => { const updated = [paymentRecord, ...prev]; persistChanges({ supplierPayments: updated }); return updated; });
              const tx: TreasuryTransaction = {
                id: `TX-SUPP-${Date.now()}`,
                txNumber: `TX-S-${Math.floor(1000 + Math.random() * 9000)}`,
                date: paymentDate,
                time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                type: 'صرف',
                category: 'سداد دفعة لمورد',
                amount,
                paymentMethod: paymentMethod as PaymentMethod,
                balanceAfter: treasuryBalance - amount,
                referenceId: supplierId,
                description: `سداد مورد #${supplierId}: ${notes}`,
                recordedBy: currentUser?.employeeName || 'مسؤول المشتريات'
              };
              setTreasury(prev => {
                const updated = [tx, ...prev];
                persistChanges({ treasuryTransactions: updated });
                return updated;
              });
            }}
          />
        )}

        {viewTab === 'finance' && (
          <FinanceView
            auditLog={auditLog}
            stockMovements={stockMovements}
            invoices={invoices}
            parts={parts}
            salesReturns={salesReturns}
            expenses={expenses}
            partners={partners}
            distributions={[]}
            treasuryTransactions={treasury}
            treasuryBalance={treasuryBalance}
            onAddExpense={handleAddExpense}
            onAddDistribution={(record: ProfitDistributionRecord) => {
              const tx: TreasuryTransaction = {
                id: `TX-DIST-${Date.now()}`,
                txNumber: `TX-D-${Math.floor(1000 + Math.random() * 9000)}`,
                date: record.date,
                time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                type: 'صرف',
                amount: record.netProfit,
                description: `توزيع أرباح: ${record.period}`,
                category: 'توزيع أرباح',
                paymentMethod: 'نقدي',
                balanceAfter: treasuryBalance - record.netProfit,
                recordedBy: currentUser?.employeeName || 'المدير المالي'
              };
              setTreasury(prev => {
                const updated = [tx, ...prev];
                persistChanges({ treasuryTransactions: updated });
                return updated;
              });
            }}
          />
        )}

        {viewTab === 'reports' && (
          <ReportsHub
            data={{
              invoices,
              salesReturns,
              purchaseInvoices,
              parts,
              customers,
              suppliers,
              expenses,
              treasury,
              cheques,
              batches: stockBatches,
              loyaltyLedger,
              loyaltyPointValue: resolveLoyalty(settings.loyalty).pointValueEgp,
            }}
            exportTab={
              <ReportsView
                invoices={invoices}
                purchaseInvoices={purchaseInvoices}
                salesReturns={salesReturns}
                purchaseReturns={purchaseReturns}
                parts={parts}
                suppliers={suppliers}
                customers={customers}
                treasuryTransactions={treasury}
                expenses={expenses}
                partners={partners}
                treasuryBalance={treasuryBalance}
              />
            }
          />
        )}

        {viewTab === 'settings' && (
          <SettingsView
            settings={settings}
            employees={employees}
            activeLicense={activeTenant}
            onUpdateSettings={(newSettings: ShopSettings) => {
              const merged = { ...newSettings, carBrands: settings.carBrands ?? newSettings.carBrands };
              setSettings(merged);
              persistChanges({ settings: merged });
            }}
            onAddEmployee={(newEmp: Employee) => {
              setEmployees(prev => {
                const updated = [...prev, newEmp];
                persistChanges({ employees: updated });
                return updated;
              });
            }}
            onUpdateEmployee={(updatedEmp: Employee) => {
              setEmployees(prev => {
                const updated = prev.map(e => e.id === updatedEmp.id ? updatedEmp : e);
                persistChanges({ employees: updated });
                return updated;
              });
            }}
            onDeleteEmployee={(employeeId: string) => {
              setEmployees(prev => {
                const updated = prev.filter(e => e.id !== employeeId);
                persistChanges({ employees: updated });
                return updated;
              });
            }}
            onSetActiveEmployee={(_employeeId: string) => {}}
            onClearDemoData={() => {
              const staff = clearTenantDemoData(activeTenant.tenantId);
              setEmployees(staff);
              reloadTenantData(activeTenant);
            }}
            onOpenDeploymentGuide={() => setShowDeploymentGuide(true)}
                onOpenExcelModal={() => setShowExcelModal(true)}
            onChangeOwnerPassword={(newPassword, ownerName) => {
              return updateOwnerPassword(activeTenant.tenantId, newPassword, ownerName);
            }}
          />
        )}
      </Navigation>

      {/* ===================== MODALS ===================== */}

      {/* 1. Inventory Errors & Discrepancies Modal */}
      {showInventoryErrors && (
        <InventoryErrorsModal
          isOpen={showInventoryErrors}
          onClose={() => setShowInventoryErrors(false)}
          parts={parts}
          errors={inventoryErrors}
          onAddError={handleAddInventoryError}
          onCorrectError={handleCorrectInventoryError}
          onDeleteError={handleDeleteInventoryError}
        />
      )}

      {/* 1b. جرد بالباركود */}
      {showBarcodeStocktake && (
        <BarcodeStocktakeModal
          isOpen={showBarcodeStocktake}
          onClose={() => setShowBarcodeStocktake(false)}
          parts={parts}
          onAddError={handleAddInventoryError}
        />
      )}

      {/* 2. Car Models Modal (Add, Edit, Delete Car Models) */}
      {showCarModels && (
        <CarModelsModal
          isOpen={showCarModels}
          onClose={() => setShowCarModels(false)}
          carModels={carModels}
          carBrands={carBrands}
          onAddCarModel={handleAddCarModel}
          onDeleteCarModel={handleDeleteCarModel}
          onUpdateCarModel={handleUpdateCarModel}
        />
      )}

      {/* 4. Photo Sharing & Camera Capture Modal */}
      {showPhotoSharing && (
        <PhotoSharingModal
          isOpen={showPhotoSharing}
          onClose={() => setShowPhotoSharing(false)}
          parts={parts}
          onUpdatePartImage={(partId: string, imageUrl: string) => {
            const part = parts.find(p => p.id === partId);
            if (part) {
              handleUpdatePart({ ...part, imageUrl });
            }
          }}
        />
      )}

      {/* 5. Excel Import & Export Modal */}
      {showExcelModal && (
        <ExcelImportExportModal
          isOpen={showExcelModal}
          onClose={() => setShowExcelModal(false)}
          parts={parts}
          carModels={carModels}
          invoices={invoices}
          customers={customers}
          suppliers={suppliers}
          onBrandsDetected={(names: string[]) => names.forEach(handleAddBrand)}
          onImportParts={(newParts: AutoPart[]) => {
            setParts(prev => {
              const today = todayISO();
              const updated = [...prev, ...newParts.map(p => ({ ...p, createdAt: p.createdAt || today, updatedAt: p.updatedAt || today }))];
              persistChanges({ parts: updated });
              return updated;
            });
          }}
          onImportCarModels={(newModels: CarModel[]) => {
            setCarModels(prev => {
              const updated = [...prev, ...newModels];
              persistChanges({ carModels: updated });
              return updated;
            });
          }}
        />
      )}

      {/* 8. Notifications Modal */}
      {showNotifications && (
        <NotificationsModal
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
          parts={parts}
          onUpdateStock={handleUpdateStock}
          onQuickSalePart={(part: AutoPart) => {
            handleAddToCart(part);
            setCurrentTab('pos');
            setShowNotifications(false);
          }}
          onNavigateToInventory={() => {
            setCurrentTab('inventory');
            setShowNotifications(false);
          }}
          chequesAttention={canAccessTab('cheques') ? {
            count: attentionCount(cheques, todayISO(), 3),
            overdue: cheques.filter(c => dueState(c, todayISO(), 3) === 'overdue').length,
          } : undefined}
          onNavigateToCheques={() => {
            setCurrentTab('cheques');
            setShowNotifications(false);
          }}
          expiryAttention={canAccessTab('tracking') ? (() => { const bk = expiryBuckets(stockBatches, todayISO()); return { expired: bk.expired.length, soon: bk.within30.length }; })() : undefined}
          onNavigateToTracking={() => {
            setCurrentTab('tracking');
            setShowNotifications(false);
          }}
        />
      )}

      {/* 9. Voice Assistant Modal */}
      {showVoiceAssistant && (
        <VoiceAssistantModal
          isOpen={showVoiceAssistant}
          onClose={() => setShowVoiceAssistant(false)}
          parts={parts}
          customers={customers}
          allowedActions={{
            sale: effectiveRole === 'مدير عام' || Boolean(effectivePermissions?.canSellPos),
            inventory: effectiveRole === 'مدير عام' || Boolean(effectivePermissions?.canManageInventory),
            treasury: effectiveRole === 'مدير عام' || Boolean(effectivePermissions?.canManageTreasury),
            purchases: effectiveRole === 'مدير عام' || Boolean(effectivePermissions?.canManagePurchases),
          }}
          onDirectSale={(part: AutoPart, quantity: number, custName: string, payMethod: string) => {
            const total = part.salePrice * quantity;
            const newInv: Invoice = {
              id: `INV-V-${Date.now()}`,
              invoiceNumber: nextSalesInvoiceNumber(invoices),
              date: new Date().toISOString().split('T')[0],
              time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
              customerName: custName,
              customerType: 'تجزئة',
              items: [{
                partId: part.id,
                partNumber: part.partNumber,
                partName: part.name,
                quantity,
                unitPrice: part.salePrice,
                costPrice: part.costPrice,
                total
              }],
              subtotal: total,
              tax: 0,
              discount: 0,
              grandTotal: total,
              paymentMethod: payMethod as PaymentMethod,
              status: 'مسددة',
              cashierName: currentUser?.employeeName || 'الكاشير'
            };
            return handleCreateInvoice(newInv);
          }}
          onOpenAudit={(part: AutoPart) => {
            setSelectedAuditPart(part);
            setShowInventoryAudit(true);
          }}
          onRestock={(partId: string, quantity: number) => {
            if (!parts.some(p => p.id === partId) || quantity <= 0) return false;
            handleUpdateStock(partId, quantity);
            return true;
          }}
          onAddExpense={(title: string, amount: number) => {
            const newExp: Expense = {
              id: `EXP-${Date.now()}`,
              title,
              amount,
              category: 'صيانة ونثريات وضيافة',
              date: new Date().toISOString().split('T')[0],
              paymentMethod: 'نقدي',
              notes: 'أمر صوتي ذكي',
              recordedBy: currentUser?.employeeName || 'الكاشير'
            };
            if (!Number.isFinite(amount) || amount <= 0) return false;
            handleAddExpense(newExp);
            return true;
          }}
          onOpenNotifications={() => {
            setShowVoiceAssistant(false);
            setShowNotifications(true);
          }}
          onNavigateTab={(tab: ActiveTab) => {
            setShowVoiceAssistant(false);
            setCurrentTab(tab);
          }}
          currentSession={currentUser!}
          invoices={invoices}
          suppliers={suppliers}
          shopName={activeTenant.companyName}
        />
      )}

      {/* 10. Inventory Audit Modal */}
      {showInventoryAudit && (
        <InventoryAuditModal
          part={selectedAuditPart}
          isOpen={showInventoryAudit}
          onClose={() => setShowInventoryAudit(false)}
          onQuickRestock={(partId: string, amount: number) => {
            handleUpdateStock(partId, amount);
          }}
          onQuickSale={(part: AutoPart) => {
            handleAddToCart(part);
            setCurrentTab('pos');
            setShowInventoryAudit(false);
          }}
        />
      )}

      {/* 11. System Deployment Guide Modal */}
      {showDeploymentGuide && (
        <SystemDeploymentGuideModal
          isOpen={showDeploymentGuide}
          onClose={() => setShowDeploymentGuide(false)}
          onOpenActivation={() => {
            setShowDeploymentGuide(false);
            setShowActivationGateway(true);
          }}
        />
      )}

      {/* 12. Invoice Detail & Print Modal */}
      {selectedInvoiceForDetail && (
        <InvoiceDetailModal
          isOpen={Boolean(selectedInvoiceForDetail)}
          onClose={() => setSelectedInvoiceForDetail(null)}
          invoice={invoices.find(i => i.id === selectedInvoiceForDetail.id) ?? selectedInvoiceForDetail}
          settings={settings}
        />
      )}

    </div>
  );
}
