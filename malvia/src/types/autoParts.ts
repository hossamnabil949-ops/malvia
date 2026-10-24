// ماركات السيارات قابلة للإضافة والحذف من قبل المستخدم، لذلك هي نص حر وليست قائمة ثابتة
export type CarBrand = string;

export type PartCategory = 
  | 'فلاتر وزيوت' 
  | 'فرامل ومكابح' 
  | 'محرك وكهرباء' 
  | 'عضلات ومساعدات' 
  | 'تبريد وتكييف' 
  | 'كهرباء وإلكترونيات'
  | 'إنارة وبودي';

export interface CarModel {
  id: string;
  brand: CarBrand;
  modelName: string;
  yearFrom: number;
  yearTo: number;
  engineSpecs?: string;
  generation?: string;
  notes?: string;
}

export interface PartAlternative {
  id: string;
  partId: string;
  alternativePartNumber: string;
  alternativeName: string;
  brand: string;
  origin: string;
  salePrice: number;
  stockQuantity: number;
  compatibilityScore?: number; // e.g. 100%
  isScreenOrDisplay?: boolean;
}

export interface PartReservation {
  id: string;
  reservationNumber: string;
  partId: string;
  partNumber: string;
  partName: string;
  isAlternative?: boolean;
  isScreen?: boolean;
  quantity: number;
  customerName: string;
  customerPhone: string;
  carDetails: string;
  reservedAt: string;
  expiresAt: string;
  status: 'نشط' | 'تم التحويل لفاتورة' | 'ملغي' | 'منتهي';
  unitPrice: number;
  depositAmount: number; // عربون الحجز
  notes?: string;
}

export interface InventoryDiscrepancyError {
  id: string;
  errorNumber: string;
  partId: string;
  partNumber: string;
  partName: string;
  shelfLocation: string;
  systemStock: number;
  actualPhysicalStock: number;
  differenceQty: number; // positive = surplus, negative = deficit
  errorType: 'عجز / نقص مخزني' | 'فائض غير مسجل' | 'تلف / كسر في المخزن' | 'خطأ في التوريد' | 'صنف منتهي الصلاحية';
  estimatedFinancialImpact: number;
  recordedDate: string;
  correctedDate?: string;
  isCorrected: boolean;
  correctionAction?: 'تعديل رصيد المخزن' | 'خصم من أمين المخزن' | 'تسوية جردية أرباح وخسائر' | 'قيد انتظار';
  imageUrl?: string;
  notes: string;
  auditorName: string;
}

export interface AutoPart {
  id: string;
  partNumber: string; // OEM or SKU
  name: string;
  brand: CarBrand;
  compatibleModels: string; // e.g. "كامري 2018-2024 / أفلون"
  category: PartCategory;
  origin: 'أصلي وكالة OEM' | 'ياباني Denso' | 'كوري Mobis' | 'ألماني Bosch' | 'تجاري درجة 1' | 'ياباني KYB' | 'ألماني Brembo' | 'ألماني Gates' | 'كوري Valeo PHC' | string;
  shelfLocation: string; // e.g. "رف A-14"
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  reservedQuantity?: number; // محجوز
  minAlertStock: number;
  unit: string; // حبة، طقم، لتر
  barcode?: string; // باركود المنتج (اختياري) — يُسجَّل يدوياً أو بالكاميرا
  imageUrl?: string; // صورة القطعة للمعاينة والمشاركة
  isScreenOrDisplay?: boolean; // هل القطعة شاشة أو تابلوه
  alternatives?: PartAlternative[]; // البدائل المتطابقة
  createdAt?: string; // تاريخ إضافة الصنف للمخزن (YYYY-MM-DD)
  updatedAt?: string; // تاريخ آخر حركة على رصيد الصنف (YYYY-MM-DD)
}

export interface CartItem {
  part: AutoPart;
  quantity: number;
  customPrice?: number; // متاح تعديل سعر البيع من خلال الفاتورة
}

export type PaymentMethod = 
  | 'كاش (نقدي)' 
  | 'نقدي'
  | 'آجل (شكك / حساب ورشة)' 
  | 'آجل / حساب ورشة'
  | 'إنستاباي / InstaPay' 
  | 'انستاباي / InstaPay'
  | 'فودافون كاش ومحافظ إلكترونية' 
  | 'محفظة إلكترونية'
  | 'فيزا / بطاقة بنكية'
  | 'فيزا / بطاقة'
  | 'شبكة / مدى'
  | string;

export interface InvoiceItem {
  partId?: string; // معرّف الصنف (المطابقة به أدق من الاسم/الرقم)
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice: number; // سعر البيع (معدل أو افتراضي)
  originalPrice?: number;
  costPrice?: number; // تكلفة الوحدة وقت البيع (لحساب تكلفة البضاعة المباعة بدقة)
  total: number;
  returnedQuantity?: number;
}

export interface InvoicePayment {
  method: PaymentMethod | string;
  amount: number;
}

export type AuditAction =
  | 'invoice.create' | 'invoice.price_override' | 'invoice.discount' | 'invoice.void'
  | 'sales_return.create' | 'sales_return.delete'
  | 'purchase.create' | 'purchase_return.create' | 'purchase_return.delete' | 'purchase_return.settle'
  | 'stock.adjust' | 'customer.collect' | 'customer.credit_limit' | 'supplier.payment'
  | 'shift.open' | 'shift.close' | 'shift.variance';

export interface AuditEntry {
  id: string;
  at: string;          // ISO
  userId?: string;
  userName: string;
  userRole?: string;
  action: AuditAction;
  entityId?: string;   // رقم المستند
  summary: string;
  amount?: number;
}

export type StockMovementType =
  | 'sale' | 'sale_void' | 'sales_return' | 'purchase' | 'purchase_return' | 'adjustment' | 'import' | 'sales_return_delete' | 'purchase_return_delete';

export interface StockMovement {
  id: string;
  at: string;          // ISO
  partId: string;
  partNumber: string;
  partName: string;
  type: StockMovementType;
  qtyDelta: number;    // موجب وارد / سالب صادر
  balanceAfter: number;
  refId?: string;
  refNumber?: string;
  userName: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone?: string;
  customerType: 'تجزئة' | 'ورشة' | 'شركة نقليات';
  carDetails?: string;
  carBrand?: string; // ماركة السيارة المختارة وقت البيع
  carModel?: string; // موديل السيارة
  carYear?: string; // سنة الصنع (اختياري)
  items: InvoiceItem[];
  subtotal: number;
  tax: number; // ضريبة القيمة المضافة
  discount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod | string;
  payments?: InvoicePayment[]; // الدفع المقسّم (كاش + فيزا ...). غيابه = دفعة واحدة بـ paymentMethod
  customerId?: string; // ربط الفاتورة بالعميل (بدل المطابقة بالاسم)
  cashierId?: string;
  cashierName: string;
  status?: 'مسددة' | 'مرتجع جزئي' | 'مرتجع كلي' | 'ملغاة';
  returnedAmount?: number;
  voidedAt?: string;        // ISO — وقت الإلغاء
  voidedBy?: string;        // من نفّذ الإلغاء
  voidApprovedBy?: string;  // المدير الذي وافق
  voidReason?: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  type: 'ورشة فنية' | 'عميل تجزئة' | 'أسطول شركات';
  phone: string;
  balance: number; // الآجل المستحق
  totalPurchases: number;
  monthlyPurchases: number; // مشتريات الشهر الحالي
  invoicesCount?: number;
  lastVisit: string;
  creditLimit?: number; // حد الائتمان (ج.م) — 0 أو بدون قيمة = غير محدود
}

export type ExpenseCategory = 
  | 'إيجار المحل والمستودع' 
  | 'رواتب وأجور' 
  | 'فواتير ومرافق (كهرباء/إنترنت)' 
  | 'شحن وتوصيل بضائع' 
  | 'صيانة ونثريات وضيافة' 
  | 'تسويات وعجز جردي'
  | 'رسوم وتراخيص حكومية';

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes?: string;
  paymentMethod: PaymentMethod | string;
  recordedBy: string;
}

export type CapitalTransactionType = 
  | 'تأسيس رأس مال' 
  | 'ضخ رأس مال إضافي' 
  | 'رسملة أرباح (إدخال أرباح في رأس المال)' 
  | 'تخفيض رأس مال / سحب';

export interface CapitalTransaction {
  id: string;
  partnerId: string;
  partnerName: string;
  type: CapitalTransactionType;
  amount: number;
  date: string;
  paymentMethod?: PaymentMethod | string;
  notes: string;
  recordedBy: string;
  sharePercentageBefore: number;
  sharePercentageAfter: number;
  capitalBefore: number;
  capitalAfter: number;
}

export interface Partner {
  id: string;
  name: string;
  role: string;
  phone: string;
  sharePercentage: number;
  initialCapital: number;
  addedCapital: number;
  reinvestedProfits: number;
  totalCurrentCapital: number;
  totalWithdrawn: number;
  joinDate: string;
}

export interface ProfitDistributionRecord {
  id: string;
  period: string;
  date: string;
  totalSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  partnerShares: {
    partnerId: string;
    partnerName: string;
    percentage: number;
    shareAmount: number;
  }[];
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  address: string;
  taxNumber?: string;
  balance: number; // مستحقات المورد الإجمالية
  deferredDebt?: number; // فواتير مؤجلة مستحقة للمورد
  storeCredit?: number; // رصيد دائن لصالح المحل لدى المورد عند زيادة المرتجع
  totalSupplied: number;
  totalPaid: number;
  totalReturned?: number;
  lastPaymentDate?: string;
  notes?: string;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod | string;
  treasurySource: string;
  notes?: string;
  recordedBy: string;
}

export interface CustomerPayment {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod | string;
  treasuryTarget: string;
  notes?: string;
  recordedBy: string;
}

export interface PurchaseInvoiceItem {
  partId?: string;
  partNumber: string;
  partName: string;
  category: PartCategory;
  brand?: string; // ماركة السيارة (تُستخدم عند إضافة صنف جديد للمخزن تلقائياً)
  quantity: number;
  costPrice: number;
  salePrice: number;
  total: number;
  returnedQuantity?: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber?: string;
  date: string;
  time: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseInvoiceItem[];
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  originalGrandTotal?: number;
  paymentStatus: 'مدفوعة نقداً' | 'آجل' | 'مسددة جزئياً' | 'مرتجع جزئي' | 'مرتجع كلي';
  amountPaid: number;
  remainingBalance?: number;
  paymentMethod: PaymentMethod | string;
  notes?: string;
  receivedBy: string;
  returnedAmount?: number;
}

export interface SalesReturnItem {
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
}

export interface SalesReturn {
  id: string;
  returnNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  time: string;
  customerName: string;
  items: SalesReturnItem[];
  totalRefundAmount: number;
  refundMethod: 'نقدي (خصم من الخزنة)' | 'خصم من رصيد العميل الآجل' | 'إنستاباي / محفظة';
  treasuryDeducted: boolean;
  notes?: string;
  recordedBy: string;
  isCorrected?: boolean; // هل تم تصحيحه
}

export interface PurchaseReturnItem {
  partNumber: string;
  partName: string;
  quantity: number;
  unitCost: number;
  total: number;
  reason?: string;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  purchaseInvoiceId: string;
  purchaseInvoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  time: string;
  items: PurchaseReturnItem[];
  totalReturnAmount: number;
  unpaidDebtBeforeReturn?: number;
  unpaidDebtAfterReturn?: number;
  rescheduledDebtReduction?: number;
  deductedFromDeferredDebt?: number; // تخفيض الفواتير المؤجلة
  creditedToStoreBalance?: number; // رصيد دائن للمحل
  cashRefundToTreasury: number;
  notes?: string;
  recordedBy: string;
  isCorrected?: boolean;
  isSettled?: boolean; // تمت تسوية أثر المرتجع على رصيد المورد والفاتورة
}

export type TreasuryTransactionType = 'قبض' | 'صرف';

export interface TreasuryTransaction {
  id: string;
  txNumber: string;
  date: string;
  time: string;
  type: TreasuryTransactionType;
  category: 
    | 'مبيعات كاشير (فواتير بيع)'
    | 'تحصيل من عميل / ورشة'
    | 'سداد دفعة لمورد'
    | 'فاتورة مشتريات نقدية'
    | 'مرتجع مبيعات نقدي (صرف من الخزنة)'
    | 'مرتجع مشتريات نقدي (توريد للخزنة)'
    | 'إلغاء مرتجع مبيعات (رد للخزنة)'
    | 'إلغاء فاتورة بيع (رد للخزنة)'
    | 'إلغاء مرتجع مشتريات (عكس الاسترداد)'
    | 'استرداد إلغاء مرتجع مبيعات'
    | 'تسوية خطأ مخزني'
    | 'عربون حجز شاشة أو قطعة'
    | 'مصروفات تشغيلية'
    | 'ضخ رأس مال من شريك'
    | 'توزيع أرباح'
    | 'إيداع نقدي إضافي'
    | 'سحب نقدي'
    | 'عجز درج (تسوية وردية)'
    | 'زيادة درج (تسوية وردية)';
  amount: number;
  paymentMethod: PaymentMethod | string;
  balanceAfter: number;
  referenceId?: string;
  description: string;
  recordedBy: string;
  at?: string;       // وقت التسجيل الفعلي (ISO) — يُختم تلقائياً للحركات الجديدة
  shiftId?: string;  // الوردية المفتوحة وقت الحركة (إن وجدت)
}

// ---------- الورديات وجرد الدرج ----------
export interface ShiftCashLine { label: string; amount: number; }

export interface Shift {
  id: string;
  shiftNumber: string;            // مثال: SH-0007
  status: 'مفتوحة' | 'مغلقة';
  openedAt: string;               // ISO
  openedBy: string;
  openedById?: string;
  openingCash: number;            // الكاش الذي بدأت به الوردية (معدود)
  openingDenominations?: Record<string, number>;
  carryOverDiff?: number;         // فرق بين عدّ الافتتاح وكاش إقفال الوردية السابقة (+ زيادة / - عجز)
  openingNote?: string;
  // ---- تُملأ عند الإقفال ----
  closedAt?: string;
  closedBy?: string;
  closedById?: string;
  expectedCash?: number;          // الكاش المتوقع في الدرج وقت الإقفال
  countedCash?: number;           // الكاش الفعلي المعدود
  closingDenominations?: Record<string, number>;
  variance?: number;              // الفعلي - المتوقع: سالب = عجز، موجب = زيادة
  varianceNote?: string;
  variancePosted?: boolean;       // هل سُجلت التسوية في الخزنة
  cashIn?: number;                // إجمالي القبض النقدي خلال الوردية
  cashOut?: number;               // إجمالي الصرف النقدي خلال الوردية
  cashSales?: number;
  nonCash?: { instapay: number; visa: number; wallet: number };
  invoiceCount?: number;
  breakdown?: ShiftCashLine[];    // تفصيل الحركات النقدية حسب البند
}

export interface EmployeePermissions {
  canSellPos: boolean;
  canManageInventory: boolean;
  canManagePurchases: boolean;
  canManageTreasury: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  canManagePartners: boolean;
}

export interface Employee {
  id: string;
  name: string;
  role: 'مدير عام' | 'كاشير مبيعات' | 'أمين مستودع' | 'محاسب مالي' | 'مسؤول مشتريات' | 'مشرف ورشة';
  phone: string;
  username?: string;
  password?: string;      // قديم (نص): يُحوَّل تلقائياً إلى passwordHash عند أول دخول
  passwordHash?: string;  // PBKDF2 (انظر services/passwordService.ts)
  email?: string;
  shift: 'صباحي' | 'مسائي' | 'شامل';
  salary: number;
  joinDate: string;
  status: 'نشط' | 'في إجازة' | 'معلق';
  permissions: EmployeePermissions;
}

export interface UserSession {
  tenantId: string;
  licenseKey: string;
  companyName: string;
  employeeId: string;
  employeeName: string;
  role: Employee['role'];
  permissions: EmployeePermissions;
  loginTime: string;
}

export interface ShopSettings {
  systemName: string;
  shopName: string;
  shopSubtitle: string;
  logoUrl: string;
  phone: string;
  email?: string;
  address: string;
  commercialRegister: string;
  taxId: string;
  currency: string;
  vatRate: number;
  invoiceFooterNotes: string;
  activeEmployeeId: string;
  requireShiftForSales?: boolean; // إلزام فتح وردية قبل أي بيع في الكاشير
  carBrands?: string[]; // قائمة ماركات السيارات التي يتعامل معها المحل (بدون «شامل»)
}

export type TenantPlan = 
  | 'تجريبي مجاني (14 يوم)' 
  | 'اشتراك شهري' 
  | 'باقة سنوية PRO' 
  | 'باقة VIP شاملة الفروع' 
  | 'ترخيص دائم مدى الحياة';

export type TenantStatus = 'نشط' | 'معلق مؤقتاً' | 'منتهي الصلاحية' | 'في انتظار التفعيل';

export interface TenantLicense {
  id: string;
  licenseKey: string;
  tenantId: string;
  companyName: string;
  ownerName: string;
  phone: string;
  city: string;
  plan: TenantPlan;
  startDate: string;
  expiryDate: string;
  maxEmployees: number;
  status: TenantStatus;
  allowedFeatures: {
    canUsePos: boolean;
    canUseInventory: boolean;
    canUsePurchases: boolean;
    canUseSuppliers: boolean;
    canUseCustomers: boolean;
    canUseTreasury: boolean;
    canUseReports: boolean;
    canUseVoiceAI: boolean;
  };
  notes?: string;
  devicesCount?: number;
  lastActiveDate?: string;
}
