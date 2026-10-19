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
    setParts(data.parts);
    setInvoices(data.invoices);
    setCustomers(data.customers);
    setSuppliers(data.suppliers);
    setSupplierPayments(data.supplierPayments || []);
    setTreasury(data.treasuryTransactions);
    setEmployees(data.employees);
    setSettings(data.settings || INITIAL_SHOP_SETTINGS);
    setSalesReturns(data.salesReturns);
    setPurchaseInvoices(data.purchaseInvoices);
    setPurchaseReturns(data.purchaseReturns);
    setExpenses(data.expenses);
    setPartners(data.partners);
    setCarModels(data.carModels);
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
      const updated = [newPart, ...prev];
      persistChanges({ parts: updated });
      return updated;
    });
  };

  const handleUpdateStock = (partId: string, addedStock: number) => {
    setParts(prev => {
      const updated = prev.map(p => {
        if (p.id === partId) {
          return { ...p, stockQuantity: Math.max(0, p.stockQuantity + addedStock) };
        }
        return p;
      });
      persistChanges({ parts: updated });
      return updated;
    });
  };

  const handleUpdatePartPrices = (partId: string, costPrice: number, salePrice: number) => {
    setParts(prev => {
      const updated = prev.map(p => {
        if (p.id === partId) {
          return { ...p, costPrice, salePrice };
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
          return { ...part, stockQuantity: newStock };
        }
        return part;
      });
      persistChanges({ parts: updated });
      return updated;
    });

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

    // Restock parts if returned
    if (salesReturn.items && salesReturn.items.length > 0) {
      setParts(prevParts => {
        const updated = prevParts.map(part => {
          const item = salesReturn.items.find(i => i.partNumber === part.partNumber);
          if (item) {
            return { ...part, stockQuantity: part.stockQuantity + item.quantity };
          }
          return part;
        });
        persistChanges({ parts: updated });
        return updated;
      });
    }

    // Add refund treasury transaction if cash paid out
    if (salesReturn.totalRefundAmount > 0 && salesReturn.treasuryDeducted) {
      const newTx: TreasuryTransaction = {
        id: `TX-RET-${Date.now()}`,
        txNumber: `TX-R-${Math.floor(1000 + Math.random() * 9000)}`,
        date: salesReturn.date,
        time: salesReturn.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'صرف',
        category: 'مرتجع مبيعات نقدي (صرف من الخزنة)',
        amount: salesReturn.totalRefundAmount,
        paymentMethod: 'نقدي',
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
    setSuppliers(prev => {
      const updated = prev.map(s => {
        if (s.id !== invoice.supplierId) return s;
        const remaining = Math.max(0, invoice.grandTotal - invoice.amountPaid);
        return {
          ...s,
          totalSupplied: (s.totalSupplied || 0) + invoice.grandTotal,
          totalPaid: (s.totalPaid || 0) + invoice.amountPaid,
          deferredDebt: Math.max(0, (s.deferredDebt ?? s.balance ?? 0) + remaining),
          balance: Math.max(0, (s.deferredDebt ?? s.balance ?? 0) + remaining),
        };
      });
      persistChanges({ suppliers: updated });
      return updated;
    });

    // Increase stock for purchased parts
    setParts(prevParts => {
      const updated = prevParts.map(part => {
        const boughtItem = invoice.items.find(item => item.partNumber === part.partNumber);
        if (boughtItem) {
          return { 
            ...part, 
            stockQuantity: part.stockQuantity + boughtItem.quantity,
            costPrice: boughtItem.costPrice || part.costPrice 
          };
        }
        return part;
      });
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
    setPurchaseReturns(prev => {
      const updated = [purchaseReturn, ...prev];
      persistChanges({ purchaseReturns: updated });
      return updated;
    });

    // Reduce stock
    setParts(prevParts => {
      const updated = prevParts.map(part => {
        const item = purchaseReturn.items.find(i => i.partNumber === part.partNumber);
        if (item) {
          return { ...part, stockQuantity: Math.max(0, part.stockQuantity - item.quantity) };
        }
        return part;
      });
      persistChanges({ parts: updated });
      return updated;
    });

    // If cash refund received to treasury
    if (purchaseReturn.cashRefundToTreasury > 0) {
      const newTx: TreasuryTransaction = {
        id: `TX-PR-${Date.now()}`,
        txNumber: `TX-PR-${Math.floor(1000 + Math.random() * 9000)}`,
        date: purchaseReturn.date,
        time: purchaseReturn.time,
        type: 'قبض',
        category: 'مرتجع مشتريات نقدي (توريد للخزنة)',
        amount: purchaseReturn.cashRefundToTreasury,
        paymentMethod: 'نقدي',
        balanceAfter: treasuryBalance + purchaseReturn.cashRefundToTreasury,
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
        handleUpdatePart({ ...targetPart, stockQuantity: adjustedStock });
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
              setCustomers(prev => {
                const updated = prev.map(c => c.id === customerId ? { ...c, balance: Math.max(0, c.balance - amount) } : c);
                persistChanges({ customers: updated });
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
                const updated = prev.map(s => s.id === supplierId ? { ...s, balance: Math.max(0, (s.deferredDebt ?? s.balance) - amount), deferredDebt: Math.max(0, (s.deferredDebt ?? s.balance) - amount), totalPaid: (s.totalPaid || 0) + amount, lastPaymentDate: paymentDate } : s);
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
              setSettings(newSettings);
              persistChanges({ settings: newSettings });
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
          onImportParts={(newParts: AutoPart[]) => {
            setParts(prev => {
              const updated = [...prev, ...newParts];
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
