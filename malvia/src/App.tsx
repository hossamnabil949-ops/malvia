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
  ProfitDistributionRecord
} from './types/autoParts';

import { INITIAL_SHOP_SETTINGS } from './data/autoPartsData';
import { DEFAULT_CAR_BRANDS, GENERAL_BRAND, normalizeBrand } from './data/brands';
import { isCreditMethod } from './utils/treasuryAccounts';

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
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { InventoryAuditModal } from './components/InventoryAuditModal';
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

  // Cart state for POS
  const [cart, setCart] = useState<CartItem[]>([]);

  // Navigation & View State
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');

  // Modals state
  const [showInventoryErrors, setShowInventoryErrors] = useState<boolean>(false);
  const [showCarModels, setShowCarModels] = useState<boolean>(false);
  const [showPhotoSharing, setShowPhotoSharing] = useState<boolean>(false);
  const [showExcelModal, setShowExcelModal] = useState<boolean>(false);
  const [showDeploymentGuide, setShowDeploymentGuide] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showVoiceAssistant, setShowVoiceAssistant] = useState<boolean>(false);
  const [showInventoryAudit, setShowInventoryAudit] = useState<boolean>(false);
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
    setTreasury(data.treasuryTransactions);
    setEmployees(data.employees);
    setSettings(nextSettings);
    setSalesReturns(data.salesReturns);
    setPurchaseInvoices(data.purchaseInvoices);
    setPurchaseReturns(data.purchaseReturns);
    setExpenses(data.expenses);
    setPartners(data.partners);
    setCarModels(modelsData);
    setInventoryErrors(data.inventoryErrors);
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

  // Current calculated treasury balance
  const treasuryBalance = useMemo(() => {
    return treasury.reduce((sum, tx) => {
      return tx.type === 'قبض' ? sum + tx.amount : sum - tx.amount;
    }, 0);
  }, [treasury]);

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

  const handleUpdateStock = (partId: string, addedStock: number) => {
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
    setCart(prev => {
      const existing = prev.find(item => item.part.id === part.id);
      if (existing) {
        return prev.map(item => 
          item.part.id === part.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { part, quantity: 1, customPrice: part.salePrice }];
    });
  };

  const handleUpdateCartQuantity = (partId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(partId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.part.id === partId ? { ...item, quantity } : item
    ));
  };

  const handleUpdateCartPrice = (partId: string, price: number) => {
    setCart(prev => prev.map(item => 
      item.part.id === partId ? { ...item, customPrice: price } : item
    ));
  };

  const handleRemoveFromCart = (partId: string) => {
    setCart(prev => prev.filter(item => item.part.id !== partId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Handlers for Invoices
  const handleCreateInvoice = (invoice: Invoice) => {
    setInvoices(prev => {
      const updated = [invoice, ...prev];
      persistChanges({ invoices: updated });
      return updated;
    });

    // Deduct stock for sold items
    setParts(prevParts => {
      const updated = prevParts.map(part => {
        const soldItem = invoice.items.find(item => item.partNumber === part.partNumber || item.partName === part.name);
        if (soldItem) {
          const newStock = Math.max(0, part.stockQuantity - soldItem.quantity);
          return { ...part, stockQuantity: newStock, updatedAt: todayISO() };
        }
        return part;
      });
      persistChanges({ parts: updated });
      return updated;
    });

    if (isCreditMethod(invoice.paymentMethod)) {
      // البيع الآجل لا يدخل نقدية للخزنة؛ يُسجَّل كمديونية على العميل حتى يسدد.
      setCustomers(prev => {
        const nameKey = normKey(invoice.customerName);
        const phoneKey = normKey(invoice.customerPhone);
        const idx = prev.findIndex(c =>
          (phoneKey && normKey(c.phone) === phoneKey) || normKey(c.name) === nameKey
        );
        let updated: Customer[];
        if (idx >= 0) {
          updated = prev.map((c, i) => i === idx ? {
            ...c,
            balance: c.balance + invoice.grandTotal,
            totalPurchases: (c.totalPurchases || 0) + invoice.grandTotal,
            monthlyPurchases: (c.monthlyPurchases || 0) + invoice.grandTotal,
            invoicesCount: (c.invoicesCount || 0) + 1,
            lastVisit: invoice.date,
            phone: c.phone || invoice.customerPhone || '',
          } : c);
        } else {
          const created: Customer = {
            id: `cust-${Date.now()}`,
            name: invoice.customerName || 'عميل آجل',
            type: invoice.customerType === 'ورشة' ? 'ورشة فنية' : 'عميل تجزئة',
            phone: invoice.customerPhone || '',
            balance: invoice.grandTotal,
            totalPurchases: invoice.grandTotal,
            monthlyPurchases: invoice.grandTotal,
            invoicesCount: 1,
            lastVisit: invoice.date,
          };
          updated = [created, ...prev];
        }
        persistChanges({ customers: updated });
        return updated;
      });
    } else {
      // Add treasury transaction
      const newTx: TreasuryTransaction = {
        id: `TX-SALE-${Date.now()}`,
        txNumber: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
        date: invoice.date,
        time: invoice.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'قبض',
        category: 'مبيعات كاشير (فواتير بيع)',
        amount: invoice.grandTotal,
        paymentMethod: invoice.paymentMethod,
        balanceAfter: treasuryBalance + invoice.grandTotal,
        referenceId: invoice.id,
        description: `مبيعات فاتورة #${invoice.invoiceNumber} - عميل: ${invoice.customerName}`,
        recordedBy: currentUser?.employeeName || 'الكاشير'
      };

      setTreasury(prev => {
        const updated = [newTx, ...prev];
        persistChanges({ treasuryTransactions: updated });
        return updated;
      });
    }

    // Clear cart on completion
    setCart([]);
  };

  // Handlers for Sales Returns
  const handleAddSalesReturn = (salesReturn: SalesReturn) => {
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
          return r ? { ...it, returnedQuantity: (it.returnedQuantity || 0) + r.quantity } : it;
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
      setParts(prevParts => {
        const updated = prevParts.map(part => {
          const item = salesReturn.items.find(i => i.partNumber === part.partNumber);
          if (item) {
            return { ...part, stockQuantity: part.stockQuantity + item.quantity, updatedAt: todayISO() };
          }
          return part;
        });
        persistChanges({ parts: updated });
        return updated;
      });
    }

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
    setSalesReturns(prev => {
      const updated = prev.filter(r => r.id !== returnId);
      persistChanges({ salesReturns: updated });
      return updated;
    });
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
    setParts(prevParts => {
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
      const updatedExisting = prevParts.map(part => {
        const k1 = normKey(part.partNumber);
        const hit = byKey.get(k1) ?? byKey.get(normKey(part.name));
        if (!hit) return part;
        matched.add(byKey.get(k1) ? k1 : normKey(part.name));
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
        newParts.push({
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
        });
      });

      const updated = [...newParts, ...updatedExisting];
      persistChanges({ parts: updated });
      return updated;
    });

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
    setParts(prevParts => {
      const updated = prevParts.map(part => {
        const item = purchaseReturn.items.find(i => i.partNumber === part.partNumber);
        if (item) {
          return { ...part, stockQuantity: Math.max(0, part.stockQuantity - item.quantity), updatedAt: todayISO() };
        }
        return part;
      });
      persistChanges({ parts: updated });
      return updated;
    });

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
    setPurchaseReturns(prev => {
      const updated = prev.filter(r => r.id !== returnId);
      persistChanges({ purchaseReturns: updated });
      return updated;
    });
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
    const lowStockCount = parts.filter(p => p.stockQuantity <= p.minAlertStock).length;
    const unresolvedErrors = inventoryErrors.filter(e => !e.isCorrected).length;
    return lowStockCount + unresolvedErrors;
  }, [parts, inventoryErrors]);

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
        {currentTab === 'dashboard' && (
          <HomeDashboard
            parts={parts}
            invoices={invoices}
            treasuryTransactions={treasury}
            onOpenTreasuryReports={() => setCurrentTab('finance')}
            currentSession={currentUser}
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

        {currentTab === 'pos' && (
          <QuickPosView
            parts={parts}
            carModels={carModels}
            carBrands={carBrands}
            onAddBrand={handleAddBrand}
            onRemoveBrand={handleRemoveBrand}
            customers={customers}
            cart={cart}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onUpdateCartPrice={handleUpdateCartPrice}
            onRemoveFromCart={handleRemoveFromCart}
            onClearCart={handleClearCart}
            onCheckoutComplete={handleCreateInvoice}
            onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
            onOpenReturns={() => setCurrentTab('invoices')}
          />
        )}

        {currentTab === 'inventory' && (
          <InventoryView
            parts={parts}
            carBrands={carBrands}
            onAddBrand={handleAddBrand}
            onRemoveBrand={handleRemoveBrand}
            onAddNewPart={handleAddPart}
            onUpdateStock={handleUpdateStock}
            onUpdatePartPrices={handleUpdatePartPrices}
            onQuickSalePart={(part) => {
              handleAddToCart(part);
              setCurrentTab('pos');
            }}
            onOpenPhotoSharing={() => setShowPhotoSharing(true)}
            onOpenExcelModal={() => setShowExcelModal(true)}
            onOpenInventoryErrors={() => setShowInventoryErrors(true)}
          />
        )}

        {currentTab === 'invoices' && (
          <InvoicesView
            invoices={invoices}
            salesReturns={salesReturns}
            onOpenInvoiceModal={(inv: Invoice) => setSelectedInvoiceForDetail(inv)}
            onSalesReturn={handleAddSalesReturn}
            onDeleteSalesReturn={handleDeleteSalesReturn}
          />
        )}

        {currentTab === 'purchases' && (
          <PurchasesView
            carBrands={carBrands.filter(b => b !== GENERAL_BRAND)}
            purchaseInvoices={purchaseInvoices}
            purchaseReturns={purchaseReturns}
            suppliers={suppliers}
            parts={parts}
            treasuryBalance={treasuryBalance}
            onAddPurchaseInvoice={handleAddPurchaseInvoice}
            onPurchaseReturn={handleAddPurchaseReturn}
            onDeletePurchaseReturn={handleDeletePurchaseReturn}
          />
        )}

        {currentTab === 'customers' && (
          <CustomersView
            customers={customers}
            onAddCustomer={(newCust: Customer) => {
              setCustomers(prev => {
                const updated = [newCust, ...prev];
                persistChanges({ customers: updated });
                return updated;
              });
            }}
            onSettleBalance={(customerId: string, amount: number) => {
              const cust = customers.find(c => c.id === customerId);
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

        {currentTab === 'suppliers' && (
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

        {currentTab === 'finance' && (
          <FinanceView
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

        {currentTab === 'reports' && (
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
        )}

        {currentTab === 'settings' && (
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
        />
      )}

      {/* 9. Voice Assistant Modal */}
      {showVoiceAssistant && (
        <VoiceAssistantModal
          isOpen={showVoiceAssistant}
          onClose={() => setShowVoiceAssistant(false)}
          parts={parts}
          customers={customers}
          onDirectSale={(part: AutoPart, quantity: number, custName: string, payMethod: string) => {
            const total = part.salePrice * quantity;
            const newInv: Invoice = {
              id: `INV-V-${Date.now()}`,
              invoiceNumber: `V-${Math.floor(1000 + Math.random() * 9000)}`,
              date: new Date().toISOString().split('T')[0],
              time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
              customerName: custName,
              customerType: 'تجزئة',
              items: [{
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
            handleCreateInvoice(newInv);
          }}
          onOpenAudit={(part: AutoPart) => {
            setSelectedAuditPart(part);
            setShowInventoryAudit(true);
          }}
          onRestock={(partId: string, quantity: number) => {
            handleUpdateStock(partId, quantity);
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
            handleAddExpense(newExp);
          }}
          onOpenNotifications={() => {
            setShowVoiceAssistant(false);
            setShowNotifications(true);
          }}
          onNavigateTab={(tab: ActiveTab) => {
            setShowVoiceAssistant(false);
            setCurrentTab(tab);
          }}
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
          invoice={selectedInvoiceForDetail}
          settings={settings}
        />
      )}

    </div>
  );
}
