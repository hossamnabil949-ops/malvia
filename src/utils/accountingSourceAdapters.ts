import type {
  AccountingContext, CreateJournalInput, JournalLine,
} from './accountingCore';
import type {
  CustomerPayment, Expense, Invoice, InvoicePayment, PartnerCurrentAccountTransaction,
  PurchaseInvoice, PurchaseReturn, SalesReturn, SupplierPayment,
} from '../types/autoParts';
import { paymentAccountOf } from './paymentMethods';
import type { Cheque } from './chequeLogic';
import type { VoidPlan } from './saleLogic';

export type SourceAdapterError =
  | 'SOURCE_ID_REQUIRED' | 'SOURCE_DATE_INVALID' | 'SOURCE_AMOUNT_INVALID'
  | 'INVOICE_CANCELLED' | 'INVOICE_TOTAL_MISMATCH' | 'PAYMENT_TOTAL_MISMATCH'
  | 'PAYMENT_METHOD_UNSUPPORTED' | 'ACCOUNT_MAPPING_MISSING' | 'CHEQUE_LIFECYCLE_INVALID' | 'INVOICE_VOID_INVALID' | 'PURCHASE_INVOICE_VOID_INVALID'
  | 'COST_BASIS_MISSING' | 'INVOICE_LINES_INVALID' | 'TAX_DETAIL_MISSING';

export interface SourceAdapterResult {
  input: CreateJournalInput | null;
  error: SourceAdapterError | null;
}

export interface SourceAccountMap {
  sales: string;
  outputVat: string;
  receivables: string;
  costOfGoodsSold: string;
  inventory: string;
  operatingExpenses: string;
  inputVat: string;
  visaClearing: string;
  bankFees: string;
  payables: string;
  supplierAdvances: string;
  salesReturns?: string;
  /** Separate balance-sheet accounts for registered but not yet cleared cheques. */
  chequesReceivable?: string;
  chequesPayable?: string;
  partnerCurrentAccount: string;
  /** Resolve cash, bank, wallet, InstaPay, card-clearing, or other approved rails. */
  settlementAccount: (method: string, bankAccountId?: string) => string | undefined;
}

const fail = (error: SourceAdapterError): SourceAdapterResult => ({ input: null, error });
const ok = (input: CreateJournalInput): SourceAdapterResult => ({ input, error: null });
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const validAmount = (value: number): boolean => Number.isFinite(value) && value >= 0;
const r2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const addLine = (lines: JournalLine[], accountId: string | undefined, debit: number, credit: number, description: string): boolean => {
  if (!accountId) return false;
  const amount = r2(debit || credit);
  if (amount <= 0) return true;
  lines.push({ accountId, debit: r2(debit), credit: r2(credit), description });
  return true;
};
const baseInput = (
  context: AccountingContext, sourceType: string, sourceId: string, date: string,
  periodId: string, memo: string, lines: JournalLine[], createdAt: string, createdBy: string,
): CreateJournalInput => ({
  ...context, postingId: sourceType + ':' + sourceId,
  source: { type: sourceType, id: sourceId }, date, periodId, memo, lines, createdAt, createdBy,
});

/**
 * Creates the sale journal from the frozen invoice snapshot.
 * COGS deliberately requires each line's historical costPrice; current stock cost is never substituted.
 */
export function buildSalesInvoiceJournal(
  invoice: Invoice, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!invoice.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(invoice.date)) return fail('SOURCE_DATE_INVALID');
  if (invoice.status === 'ملغاة') return fail('INVOICE_CANCELLED');
  if (!invoice.items?.length) return fail('INVOICE_LINES_INVALID');
  if (![invoice.subtotal, invoice.discount, invoice.tax, invoice.grandTotal].every(validAmount)) return fail('SOURCE_AMOUNT_INVALID');
  const netSales = r2(Math.max(0, invoice.subtotal - invoice.discount));
  if (Math.abs(r2(netSales + invoice.tax) - r2(invoice.grandTotal)) > 0.01) return fail('INVOICE_TOTAL_MISMATCH');

  const payments: InvoicePayment[] = invoice.payments?.length
    ? invoice.payments
    : invoice.creditAmount !== undefined
      ? [
          ...(invoice.grandTotal - invoice.creditAmount > 0
            ? [{ method: invoice.paymentMethod, amount: invoice.grandTotal - invoice.creditAmount }]
            : []),
          ...(invoice.creditAmount > 0 ? [{ method: 'آجل / حساب ورشة', amount: invoice.creditAmount }] : []),
        ]
      : [{ method: invoice.paymentMethod, amount: invoice.grandTotal }];
  if (payments.some(p => !validAmount(p.amount)) || Math.abs(r2(payments.reduce((s, p) => s + p.amount, 0)) - r2(invoice.grandTotal)) > 0.01) {
    return fail('PAYMENT_TOTAL_MISMATCH');
  }

  const lines: JournalLine[] = [];
  for (const payment of payments.filter(p => p.amount > 0)) {
    let accountId: string | undefined;
    try {
      accountId = paymentAccountOf(String(payment.method)) === 'credit'
        ? accounts.receivables
        : accounts.settlementAccount(String(payment.method), payment.bankAccountId);
    } catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (!addLine(lines, accountId, payment.amount, 0, 'تحصيل فاتورة ' + invoice.invoiceNumber)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  }
  if (!addLine(lines, accounts.sales, 0, netSales, 'صافي مبيعات فاتورة ' + invoice.invoiceNumber)) return fail('ACCOUNT_MAPPING_MISSING');
  if (!addLine(lines, invoice.tax > 0 ? accounts.outputVat : accounts.outputVat, 0, invoice.tax, 'ضريبة مخرجات فاتورة ' + invoice.invoiceNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }

  let cogs = 0;
  for (const item of invoice.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return fail('INVOICE_LINES_INVALID');
    if (item.costPrice === undefined || !validAmount(item.costPrice)) return fail('COST_BASIS_MISSING');
    cogs += item.quantity * item.costPrice;
  }
  cogs = r2(cogs);
  if (!addLine(lines, accounts.costOfGoodsSold, cogs, 0, 'تكلفة بضاعة مباعة — ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.inventory, 0, cogs, 'إخراج تكلفة المخزون — ' + invoice.invoiceNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'sales.invoice', invoice.id, invoice.date, periodId,
    'ترحيل فاتورة بيع ' + invoice.invoiceNumber, lines, createdAt, createdBy));
}

/**
 * Reverses a voided sales invoice using the already-computed legacy void plan.
 * This creates a new journal source; it never edits or deletes the original invoice journal.
 */
export function buildInvoiceVoidJournal(
  invoice: Invoice, plan: VoidPlan, context: AccountingContext, periodId: string,
  createdAt: string, createdBy: string, accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!invoice.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  const voidDate = invoice.voidedAt?.slice(0, 10) || '';
  if (!validDate(voidDate)) return fail('SOURCE_DATE_INVALID');
  if (invoice.status !== 'ملغاة' || !invoice.voidReason?.trim() || !invoice.voidApprovedBy?.trim()) {
    return fail('INVOICE_VOID_INVALID');
  }
  if (![invoice.subtotal, invoice.discount, invoice.tax, invoice.grandTotal, plan.fraction, plan.creditAmount,
    invoice.returnedAmount || 0].every(validAmount)
    || plan.fraction > 1 || plan.creditAmount > invoice.grandTotal + 0.01
    || !Array.isArray(plan.refunds) || plan.refunds.some(refund => !refund.method?.trim() || !validAmount(refund.amount))
    || !Array.isArray(plan.restock) || plan.restock.some(item => !item.partNumber?.trim() || !Number.isFinite(item.qty) || item.qty <= 0)) {
    return fail('SOURCE_AMOUNT_INVALID');
  }
  const netSales = r2(invoice.subtotal - invoice.discount);
  if (netSales < 0 || Math.abs(r2(netSales + invoice.tax) - r2(invoice.grandTotal)) > 0.01) {
    return fail('INVOICE_TOTAL_MISMATCH');
  }
  const refundTotal = r2(plan.creditAmount + plan.refunds.reduce((sum, refund) => sum + refund.amount, 0));
  const expectedRemaining = r2(invoice.grandTotal - (invoice.returnedAmount || 0));
  const expectedFraction = invoice.grandTotal > 0 ? expectedRemaining / invoice.grandTotal : 0;
  if (expectedRemaining < 0 || Math.abs(refundTotal - expectedRemaining) > 0.01
    || Math.abs(plan.fraction - expectedFraction) > 0.0001) return fail('INVOICE_VOID_INVALID');
  if ((invoice.returnedAmount || 0) > 0.005 && invoice.tax > 0.005) {
    return fail('TAX_DETAIL_MISSING');
  }

  const expectedRestock = invoice.items.map(item => ({
    partId: item.partId, partNumber: item.partNumber,
    qty: Math.max(0, item.quantity - (item.returnedQuantity || 0)),
  })).filter(item => item.qty > 0);
  const key = (item: { partId?: string; partNumber: string }) => item.partId ? 'id:' + item.partId : 'number:' + item.partNumber;
  const aggregate = (items: { partId?: string; partNumber: string; qty: number }[]) => {
    const map = new Map<string, number>();
    for (const item of items) map.set(key(item), r2((map.get(key(item)) || 0) + item.qty));
    return map;
  };
  const expectedQty = aggregate(expectedRestock);
  const plannedQty = aggregate(plan.restock);
  if (expectedQty.size !== plannedQty.size || [...expectedQty].some(([id, qty]) => Math.abs(qty - (plannedQty.get(id) || 0)) > 0.0001)) {
    return fail('INVOICE_VOID_INVALID');
  }

  let restoredCost = 0;
  for (const item of invoice.items) {
    const remainingQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
    if (remainingQty === 0) continue;
    if (item.costPrice === undefined || !validAmount(item.costPrice)) return fail('COST_BASIS_MISSING');
    restoredCost += remainingQty * item.costPrice;
  }

  const lines: JournalLine[] = [];
  if (!addLine(lines, accounts.sales, netSales * plan.fraction, 0, 'عكس صافي مبيعات الفاتورة الملغاة ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.outputVat, invoice.tax * plan.fraction, 0, 'عكس ضريبة مخرجات الفاتورة الملغاة ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.inventory, r2(restoredCost), 0, 'إعادة تكلفة المخزون للفاتورة الملغاة ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.costOfGoodsSold, 0, r2(restoredCost), 'عكس تكلفة البضاعة للفاتورة الملغاة ' + invoice.invoiceNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  if (plan.creditAmount > 0 && !addLine(lines, accounts.receivables, 0, plan.creditAmount, 'إلغاء رصيد العميل للفاتورة ' + invoice.invoiceNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  for (const refund of plan.refunds) {
    if (!Number.isFinite(refund.amount) || refund.amount < 0) return fail('SOURCE_AMOUNT_INVALID');
    if (refund.amount <= 0) continue;
    const matchingPayments = (invoice.payments?.length ? invoice.payments : [{ method: invoice.paymentMethod, amount: invoice.grandTotal }])
      .filter(payment => payment.method === refund.method);
    if (!matchingPayments.length) return fail('PAYMENT_METHOD_UNSUPPORTED');
    const bankIds = [...new Set(matchingPayments.map(payment => payment.bankAccountId || ''))];
    if (bankIds.length > 1) return fail('PAYMENT_METHOD_UNSUPPORTED');
    let settlement: string | undefined;
    try { settlement = accounts.settlementAccount(String(refund.method), bankIds[0] || undefined); }
    catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (!addLine(lines, settlement, 0, refund.amount, 'رد وسيلة الدفع عند إلغاء الفاتورة ' + invoice.invoiceNumber)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  }

  return ok(baseInput(context, 'sales.invoice-void', invoice.id, voidDate, periodId,
    'قيد عكسي لإلغاء فاتورة بيع ' + invoice.invoiceNumber, lines, createdAt, createdBy));
}

/** Expenses have no tax breakdown in the legacy Expense record; the full amount stays unsplit. */
export function buildExpenseJournal(
  expense: Expense, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!expense.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(expense.date)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  let settlement: string | undefined;
  try { settlement = accounts.settlementAccount(String(expense.paymentMethod), expense.bankAccountId); }
  catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
  const lines: JournalLine[] = [];
  if (!addLine(lines, accounts.operatingExpenses, expense.amount, 0, 'مصروف ' + expense.title)
    || !addLine(lines, settlement, 0, expense.amount, 'سداد مصروف ' + expense.title)) return fail('ACCOUNT_MAPPING_MISSING');
  return ok(baseInput(context, 'finance.expense', expense.id, expense.date, periodId,
    'ترحيل مصروف ' + expense.title, lines, createdAt, createdBy));
}

/** Partner current-account movements follow the existing legacy balance-effect semantics. */
export function buildPartnerCurrentAccountJournal(
  movement: PartnerCurrentAccountTransaction, context: AccountingContext, periodId: string,
  createdAt: string, createdBy: string, accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!movement.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(movement.date)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(movement.amount) || movement.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  let settlement: string | undefined;
  try { settlement = accounts.settlementAccount(String(movement.paymentMethod), movement.bankAccountId); }
  catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
  const lines: JournalLine[] = [];
  const cashIn = movement.type === 'partner_deposit' || movement.type === 'partner_repayment';
  const currentDebit = movement.type === 'partner_withdrawal' || movement.type === 'company_repayment';
  if (cashIn) {
    if (!addLine(lines, settlement, movement.amount, 0, 'استلام جاري شريك ' + movement.partnerName)
      || !addLine(lines, accounts.partnerCurrentAccount, 0, movement.amount, 'زيادة رصيد جاري الشريك ' + movement.partnerName)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  } else if (currentDebit) {
    if (!addLine(lines, accounts.partnerCurrentAccount, movement.amount, 0, 'تخفيض / تسوية جاري الشريك ' + movement.partnerName)
      || !addLine(lines, settlement, 0, movement.amount, 'صرف جاري شريك ' + movement.partnerName)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  } else {
    return fail('SOURCE_AMOUNT_INVALID');
  }
  return ok(baseInput(context, 'partner.current-account', movement.id, movement.date, periodId,
    'حركة جاري الشريك ' + movement.partnerName, lines, createdAt, createdBy));
}


/** Purchase posting separates inventory, recoverable input VAT, paid amount, supplier credit and remaining payable. */
export function buildPurchaseInvoiceJournal(
  invoice: PurchaseInvoice, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap, supplierCreditApplied = 0,
): SourceAdapterResult {
  if (!invoice.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(invoice.date)) return fail('SOURCE_DATE_INVALID');
  if (!invoice.items?.length || invoice.items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0
    || !validAmount(item.costPrice) || !validAmount(item.total))) return fail('INVOICE_LINES_INVALID');
  if (![invoice.subtotal, invoice.discount, invoice.tax, invoice.grandTotal, invoice.amountPaid, supplierCreditApplied].every(validAmount)) {
    return fail('SOURCE_AMOUNT_INVALID');
  }
  const netInventory = r2(invoice.subtotal - invoice.discount);
  if (netInventory < 0 || Math.abs(r2(netInventory + invoice.tax) - r2(invoice.grandTotal)) > 0.01
    || invoice.amountPaid + supplierCreditApplied > invoice.grandTotal + 0.01) return fail('INVOICE_TOTAL_MISMATCH');
  const lines: JournalLine[] = [];
  if (!addLine(lines, accounts.inventory, netInventory, 0, 'مخزون فاتورة مشتريات ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.inputVat, invoice.tax, 0, 'ضريبة مدخلات فاتورة مشتريات ' + invoice.invoiceNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  if (invoice.amountPaid > 0) {
    let settlement: string | undefined;
    try { settlement = accounts.settlementAccount(String(invoice.paymentMethod), invoice.bankAccountId); }
    catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (!addLine(lines, settlement, 0, invoice.amountPaid, 'المدفوع من فاتورة مشتريات ' + invoice.invoiceNumber)) return fail('ACCOUNT_MAPPING_MISSING');
  }
  if (!addLine(lines, accounts.supplierAdvances, 0, supplierCreditApplied, 'استخدام رصيد دائن سابق لدى المورد ' + invoice.supplierName)
    || !addLine(lines, accounts.payables, 0, invoice.grandTotal - invoice.amountPaid - supplierCreditApplied, 'المتبقي للمورد ' + invoice.supplierName)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'purchase.invoice', invoice.id, invoice.date, periodId,
    'ترحيل فاتورة مشتريات ' + invoice.invoiceNumber, lines, createdAt, createdBy));
}

/** Customer receipts reduce receivables; they are not sales revenue. */
export function buildCustomerReceiptJournal(
  payment: CustomerPayment, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!payment.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(payment.paymentDate)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  let settlement: string | undefined;
  try { settlement = accounts.settlementAccount(String(payment.paymentMethod)); }
  catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
  const lines: JournalLine[] = [];
  if (!addLine(lines, settlement, payment.amount, 0, 'تحصيل من العميل ' + payment.customerName)
    || !addLine(lines, accounts.receivables, 0, payment.amount, 'تخفيض مديونية العميل ' + payment.customerName)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'customer.receipt', payment.id, payment.paymentDate, periodId,
    'إيصال تحصيل ' + payment.receiptNumber, lines, createdAt, createdBy));
}

/** Supplier settlements debit payable first; excess payments are supplier advances, never expenses. */
export function buildSupplierPaymentJournal(
  payment: SupplierPayment, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap, payableApplied = payment.amount,
): SourceAdapterResult {
  if (!payment.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(payment.paymentDate)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(payment.amount) || payment.amount <= 0 || !Number.isFinite(payableApplied)
    || payableApplied < 0 || payableApplied > payment.amount) return fail('SOURCE_AMOUNT_INVALID');
  let settlement: string | undefined;
  try { settlement = accounts.settlementAccount(String(payment.paymentMethod), payment.bankAccountId); }
  catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
  const lines: JournalLine[] = [];
  if (!addLine(lines, accounts.payables, payableApplied, 0, 'تسوية مديونية المورد ' + payment.supplierName)
    || !addLine(lines, accounts.supplierAdvances, payment.amount - payableApplied, 0, 'رصيد مقدم لدى المورد ' + payment.supplierName)
    || !addLine(lines, settlement, 0, payment.amount, 'سداد للمورد ' + payment.supplierName)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'supplier.payment', payment.id, payment.paymentDate, periodId,
    'سداد مورد ' + payment.supplierName + ' — ' + payment.paymentNumber, lines, createdAt, createdBy));
}

/** A transfer between owned bank accounts only changes asset subaccounts, not income or expense. */
export function buildBankTransferJournal(
  input: { id: string; date: string; sourceBankAccountId: string; destinationBankAccountId: string; amount: number; reference?: string },
  context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  bankAccountLedgerId: (bankAccountId: string) => string | undefined,
): SourceAdapterResult {
  if (!input.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(input.date)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(input.amount) || input.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  if (!input.sourceBankAccountId || !input.destinationBankAccountId
    || input.sourceBankAccountId === input.destinationBankAccountId) return fail('ACCOUNT_MAPPING_MISSING');
  const source = bankAccountLedgerId(input.sourceBankAccountId);
  const destination = bankAccountLedgerId(input.destinationBankAccountId);
  const lines: JournalLine[] = [];
  if (!addLine(lines, destination, input.amount, 0, 'تحويل وارد إلى البنك ' + input.destinationBankAccountId)
    || !addLine(lines, source, 0, input.amount, 'تحويل صادر من البنك ' + input.sourceBankAccountId)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'bank.transfer', input.id, input.date, periodId,
    'تحويل بين حسابين بنكيين ' + (input.reference || input.id), lines, createdAt, createdBy));
}


/**
 * Sales return reverses revenue and restores inventory at original invoice-line cost.
 * Taxable returns are blocked because legacy return records do not preserve a VAT amount.
 */
export function buildSalesReturnJournal(
  salesReturn: SalesReturn, originalInvoice: Invoice, context: AccountingContext,
  periodId: string, createdAt: string, createdBy: string, accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!salesReturn.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(salesReturn.date) || !validDate(originalInvoice.date)) return fail('SOURCE_DATE_INVALID');
  if (salesReturn.invoiceId !== originalInvoice.id || originalInvoice.status === 'ملغاة') return fail('INVOICE_CANCELLED');
  if (!Number.isFinite(salesReturn.totalRefundAmount) || salesReturn.totalRefundAmount <= 0
    || !Number.isFinite(originalInvoice.grandTotal) || originalInvoice.grandTotal <= 0
    || salesReturn.totalRefundAmount > originalInvoice.grandTotal - (originalInvoice.returnedAmount || 0) + 0.01) {
    return fail('SOURCE_AMOUNT_INVALID');
  }
  if (!salesReturn.items.length) return fail('INVOICE_LINES_INVALID');
  // Legacy return records do not say whether unitPrice includes VAT or carry a return VAT amount.
  if (!Number.isFinite(originalInvoice.tax) || originalInvoice.tax > 0.005) return fail('TAX_DETAIL_MISSING');

  let restoredCost = 0;
  for (const returned of salesReturn.items) {
    if (!Number.isFinite(returned.quantity) || returned.quantity <= 0) return fail('INVOICE_LINES_INVALID');
    const candidates = originalInvoice.items.filter((line, index) => {
      const lineId = line.lineId || originalInvoice.id + ':' + index;
      if (returned.lineId) return returned.lineId === lineId;
      if (returned.partId) return returned.partId === line.partId && returned.unitPrice === line.unitPrice;
      return returned.partNumber === line.partNumber && returned.unitPrice === line.unitPrice;
    });
    if (candidates.length !== 1) return fail('INVOICE_LINES_INVALID');
    const originalLine = candidates[0];
    if (originalLine.costPrice === undefined || !validAmount(originalLine.costPrice)) return fail('COST_BASIS_MISSING');
    if ((originalLine.returnedQuantity || 0) + returned.quantity > originalLine.quantity + 0.0001) return fail('INVOICE_LINES_INVALID');
    restoredCost += originalLine.costPrice * returned.quantity;
  }

  const lines: JournalLine[] = [];
  if (!addLine(lines, accounts.salesReturns, salesReturn.totalRefundAmount, 0, 'مردودات مبيعات ' + salesReturn.returnNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }

  if (salesReturn.refundMethod === 'خصم من رصيد العميل الآجل') {
    if (salesReturn.treasuryDeducted) return fail('SOURCE_AMOUNT_INVALID');
    if (!addLine(lines, accounts.receivables, 0, salesReturn.totalRefundAmount, 'تخفيض مديونية العميل ' + salesReturn.customerName)) return fail('ACCOUNT_MAPPING_MISSING');
  } else {
    if (!salesReturn.treasuryDeducted) return fail('SOURCE_AMOUNT_INVALID');
    const method = salesReturn.refundMethod === 'نقدي (خصم من الخزنة)' ? 'نقدي' : 'إنستاباي / محفظة';
    let settlement: string | undefined;
    try { settlement = accounts.settlementAccount(method); }
    catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (!addLine(lines, settlement, 0, salesReturn.totalRefundAmount, 'رد قيمة مرتجع للعميل ' + salesReturn.customerName)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  }

  if (!addLine(lines, accounts.inventory, restoredCost, 0, 'إعادة تكلفة مخزون مرتجع ' + salesReturn.returnNumber)
    || !addLine(lines, accounts.costOfGoodsSold, 0, restoredCost, 'عكس تكلفة بضاعة مرتجعة ' + salesReturn.returnNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'sales.return', salesReturn.id, salesReturn.date, periodId,
    'ترحيل مرتجع مبيعات ' + salesReturn.returnNumber, lines, createdAt, createdBy));
}


/**
 * Legacy purchase returns are cost-only (quantity × unitCost); they do not carry a VAT
 * refund/allocation. Taxable source invoices are therefore rejected until the source
 * schema can represent the VAT reversal without inventing amounts.
 */
export function buildPurchaseReturnJournal(
  purchaseReturn: PurchaseReturn, originalInvoice: PurchaseInvoice, context: AccountingContext,
  periodId: string, createdAt: string, createdBy: string, accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!purchaseReturn.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(purchaseReturn.date) || !validDate(originalInvoice.date)) return fail('SOURCE_DATE_INVALID');
  if (purchaseReturn.purchaseInvoiceId !== originalInvoice.id) return fail('INVOICE_CANCELLED');
  if (!validAmount(originalInvoice.tax) || originalInvoice.tax > 0.005) return fail('TAX_DETAIL_MISSING');
  if (!Number.isFinite(purchaseReturn.totalReturnAmount) || purchaseReturn.totalReturnAmount <= 0
    || purchaseReturn.totalReturnAmount > originalInvoice.grandTotal - (originalInvoice.returnedAmount || 0) + 0.01
    || !purchaseReturn.items.length) return fail('SOURCE_AMOUNT_INVALID');

  let itemTotal = 0;
  for (const returned of purchaseReturn.items) {
    if (!Number.isFinite(returned.quantity) || returned.quantity <= 0
      || !Number.isFinite(returned.unitCost) || returned.unitCost < 0
      || Math.abs(r2(returned.total) - r2(returned.quantity * returned.unitCost)) > 0.01) {
      return fail('INVOICE_LINES_INVALID');
    }
    const originals = originalInvoice.items.filter(item =>
      item.partNumber === returned.partNumber && item.partName === returned.partName);
    if (originals.length !== 1) return fail('INVOICE_LINES_INVALID');
    if ((originals[0].returnedQuantity || 0) + returned.quantity > originals[0].quantity + 0.0001
      || Math.abs(r2(originals[0].costPrice) - r2(returned.unitCost)) > 0.01) {
      return fail('INVOICE_LINES_INVALID');
    }
    itemTotal += returned.total;
  }
  if (Math.abs(r2(itemTotal) - r2(purchaseReturn.totalReturnAmount)) > 0.01) return fail('INVOICE_TOTAL_MISMATCH');

  const cashRefund = r2(purchaseReturn.cashRefundToTreasury || 0);
  const debtReduction = r2(purchaseReturn.deductedFromDeferredDebt || 0);
  const supplierCredit = r2(purchaseReturn.creditedToStoreBalance || 0);
  if ([cashRefund, debtReduction, supplierCredit].some(value => !validAmount(value))
    || Math.abs(r2(cashRefund + debtReduction + supplierCredit) - r2(purchaseReturn.totalReturnAmount)) > 0.01) {
    return fail('SOURCE_AMOUNT_INVALID');
  }

  const lines: JournalLine[] = [];
  if (!addLine(lines, accounts.inventory, 0, purchaseReturn.totalReturnAmount, 'إخراج مخزون مرتجع مشتريات ' + purchaseReturn.returnNumber)
    || !addLine(lines, accounts.payables, debtReduction, 0, 'تخفيض مديونية المورد ' + purchaseReturn.supplierName)
    || !addLine(lines, accounts.supplierAdvances, supplierCredit, 0, 'إثبات رصيد دائن لدى المورد ' + purchaseReturn.supplierName)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  if (cashRefund > 0) {
    let settlement: string | undefined;
    try { settlement = accounts.settlementAccount(String(originalInvoice.paymentMethod), originalInvoice.bankAccountId); }
    catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (!addLine(lines, settlement, cashRefund, 0, 'استرداد نقدي لمرتجع مشتريات ' + purchaseReturn.returnNumber)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  }
  return ok(baseInput(context, 'purchase.return', purchaseReturn.id, purchaseReturn.date, periodId,
    'ترحيل مرتجع مشتريات ' + purchaseReturn.returnNumber, lines, createdAt, createdBy));
}


/**
 * Purchase-invoice cancellation is driven by an explicit settlement event because legacy
 * PurchaseInvoice does not retain the cancellation state or the original supplier-credit split.
 * The event allocations must fully account for the invoice value; returned stock blocks full void.
 */
export function buildPurchaseInvoiceVoidJournal(
  invoice: PurchaseInvoice,
  cancellation: {
    id: string; date: string; reason: string; approvedBy: string;
    cashRefund: number; supplierAdvanceRestored: number; payableReleased: number;
    refundMethod?: string; refundBankAccountId?: string;
  },
  context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!invoice.id?.trim() || !cancellation.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(invoice.date) || !validDate(cancellation.date)) return fail('SOURCE_DATE_INVALID');
  if (!cancellation.reason?.trim() || !cancellation.approvedBy?.trim()) return fail('PURCHASE_INVOICE_VOID_INVALID');
  if (![invoice.subtotal, invoice.discount, invoice.tax, invoice.grandTotal, invoice.amountPaid,
    cancellation.cashRefund, cancellation.supplierAdvanceRestored, cancellation.payableReleased].every(validAmount)) {
    return fail('SOURCE_AMOUNT_INVALID');
  }
  if (invoice.returnedAmount && invoice.returnedAmount > 0.005
    || invoice.items.some(item => (item.returnedQuantity || 0) > 0.0001)) {
    return fail('PURCHASE_INVOICE_VOID_INVALID');
  }
  const netInventory = r2(invoice.subtotal - invoice.discount);
  if (netInventory < 0 || Math.abs(r2(netInventory + invoice.tax) - r2(invoice.grandTotal)) > 0.01
    || invoice.amountPaid > invoice.grandTotal + 0.01) return fail('INVOICE_TOTAL_MISMATCH');
  const allocated = r2(cancellation.cashRefund + cancellation.supplierAdvanceRestored + cancellation.payableReleased);
  if (Math.abs(allocated - r2(invoice.grandTotal)) > 0.01
    || cancellation.cashRefund > invoice.amountPaid + 0.01) {
    return fail('PURCHASE_INVOICE_VOID_INVALID');
  }

  const lines: JournalLine[] = [];
  if (cancellation.cashRefund > 0) {
    if (!cancellation.refundMethod?.trim()) return fail('PAYMENT_METHOD_UNSUPPORTED');
    let settlement: string | undefined;
    try { settlement = accounts.settlementAccount(cancellation.refundMethod, cancellation.refundBankAccountId); }
    catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (!addLine(lines, settlement, cancellation.cashRefund, 0, 'استرداد مدفوعات فاتورة مشتريات ملغاة ' + invoice.invoiceNumber)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  }
  if (!addLine(lines, accounts.supplierAdvances, cancellation.supplierAdvanceRestored, 0,
    'استعادة رصيد مقدم المورد بسبب إلغاء فاتورة ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.payables, cancellation.payableReleased, 0,
    'إلغاء مستحقات المورد عن الفاتورة ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.inventory, 0, netInventory, 'عكس مخزون فاتورة مشتريات ملغاة ' + invoice.invoiceNumber)
    || !addLine(lines, accounts.inputVat, 0, invoice.tax, 'عكس ضريبة مدخلات فاتورة مشتريات ملغاة ' + invoice.invoiceNumber)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'purchase.invoice-void', invoice.id + ':' + cancellation.id,
    cancellation.date, periodId, 'إلغاء فاتورة مشتريات ' + invoice.invoiceNumber + ' — ' + cancellation.reason,
    lines, createdAt, createdBy));
}

/** Cash deposited to a bank moves assets from cash to bank; withdrawal moves them back. */
export function buildCashBankMovementJournal(
  movement: {
    id: string; date: string; direction: 'deposit' | 'withdrawal';
    amount: number; bankAccountId: string; reference?: string;
  },
  context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  cashAccountId: string, bankAccountLedgerId: (bankAccountId: string) => string | undefined,
): SourceAdapterResult {
  if (!movement.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(movement.date)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(movement.amount) || movement.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  if (!movement.bankAccountId || !cashAccountId) return fail('ACCOUNT_MAPPING_MISSING');
  const bank = bankAccountLedgerId(movement.bankAccountId);
  if (!bank) return fail('ACCOUNT_MAPPING_MISSING');
  const lines: JournalLine[] = [];
  const isDeposit = movement.direction === 'deposit';
  if (!['deposit', 'withdrawal'].includes(movement.direction)) return fail('SOURCE_AMOUNT_INVALID');
  if (!addLine(lines, isDeposit ? bank : cashAccountId, movement.amount, 0,
    isDeposit ? 'إيداع نقدية في البنك ' + movement.bankAccountId : 'سحب نقدية من البنك ' + movement.bankAccountId)
    || !addLine(lines, isDeposit ? cashAccountId : bank, 0, movement.amount,
    isDeposit ? 'إخراج نقدية من الخزينة للإيداع البنكي' : 'إضافة النقدية المسحوبة إلى الخزينة')) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, isDeposit ? 'bank.cash-deposit' : 'bank.cash-withdrawal',
    movement.id, movement.date, periodId, 'حركة نقدية بين الخزينة والبنك ' + (movement.reference || movement.id),
    lines, createdAt, createdBy));
}

/** Card settlement clears gross Visa receivable, books the processor fee, and receives net cash in bank. */
export function buildCardSettlementJournal(
  batch: { id: string; processor: string; grossAmount: number; feeAmount: number; netAmount: number; settlementDate: string; bankAccountId: string; reference: string },
  context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!batch.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(batch.settlementDate)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(batch.grossAmount) || batch.grossAmount <= 0
    || !Number.isFinite(batch.feeAmount) || batch.feeAmount < 0
    || !Number.isFinite(batch.netAmount) || batch.netAmount <= 0
    || batch.feeAmount >= batch.grossAmount
    || Math.abs(r2(batch.grossAmount - batch.feeAmount) - r2(batch.netAmount)) > 0.01
    || !batch.bankAccountId || !batch.reference?.trim()) return fail('SOURCE_AMOUNT_INVALID');
  let bank: string | undefined;
  try { bank = accounts.settlementAccount('تحويل بنكي', batch.bankAccountId); }
  catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
  const lines: JournalLine[] = [];
  if (!addLine(lines, bank, batch.netAmount, 0, 'صافي تسوية فيزا ' + batch.processor)
    || !addLine(lines, accounts.bankFees, batch.feeAmount, 0, 'عمولة تحصيل فيزا ' + batch.processor)
    || !addLine(lines, accounts.visaClearing, 0, batch.grossAmount, 'تصفير مستحقات فيزا ' + batch.processor)) {
    return fail('ACCOUNT_MAPPING_MISSING');
  }
  return ok(baseInput(context, 'bank.card-settlement', batch.id, batch.settlementDate, periodId,
    'تسوية بطاقة ' + batch.reference, lines, createdAt, createdBy));
}


/**
 * Registering a cheque changes the party balance immediately in the legacy workflow,
 * but does not move cash/bank until clearing. Keep the cheque as a separate asset/liability.
 */
export function buildChequeRegistrationJournal(
  cheque: Cheque, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!cheque.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(cheque.receivedDate)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(cheque.amount) || cheque.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  const lines: JournalLine[] = [];
  if (cheque.direction === 'incoming') {
    if (!Number.isFinite(cheque.appliedAmount) || Math.abs(r2((cheque.appliedAmount as number) - cheque.amount)) > 0.01) {
      return fail('CHEQUE_LIFECYCLE_INVALID');
    }
    if (!addLine(lines, accounts.chequesReceivable, cheque.amount, 0, 'شيك وارد تحت التحصيل ' + cheque.number)
      || !addLine(lines, accounts.receivables, 0, cheque.amount, 'تخفيض مديونية العميل بالشيك ' + cheque.number)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  } else if (cheque.direction === 'outgoing') {
    const appliedDebt = cheque.appliedDebt;
    const appliedCredit = cheque.appliedCredit;
    if (!Number.isFinite(appliedDebt) || !Number.isFinite(appliedCredit)
      || (appliedDebt as number) < 0 || (appliedCredit as number) < 0
      || Math.abs(r2((appliedDebt as number) + (appliedCredit as number)) - r2(cheque.amount)) > 0.01) {
      return fail('CHEQUE_LIFECYCLE_INVALID');
    }
    if (!addLine(lines, accounts.payables, appliedDebt as number, 0, 'تخفيض مستحقات المورد بالشيك ' + cheque.number)
      || !addLine(lines, accounts.supplierAdvances, appliedCredit as number, 0, 'رصيد مقدم لدى المورد بالشيك ' + cheque.number)
      || !addLine(lines, accounts.chequesPayable, 0, cheque.amount, 'شيك صادر غير مصروف ' + cheque.number)) {
      return fail('ACCOUNT_MAPPING_MISSING');
    }
  } else {
    return fail('CHEQUE_LIFECYCLE_INVALID');
  }
  return ok(baseInput(context, 'cheque.register', cheque.id, cheque.receivedDate, periodId,
    'تسجيل شيك ' + cheque.number, lines, createdAt, createdBy));
}

/**
 * Clear/bounce/cancel lifecycle event. eventId is supplied by the caller and must be
 * stable across retries. Depositing an incoming cheque is memo-only and creates no journal.
 */
export function buildChequeLifecycleJournal(
  cheque: Cheque, action: 'clear' | 'bounce' | 'cancel', previousStatus: Cheque['status'],
  eventId: string, eventDate: string, context: AccountingContext, periodId: string,
  createdAt: string, createdBy: string, accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!eventId?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(eventDate)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(cheque.amount) || cheque.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');

  const incoming = cheque.direction === 'incoming';
  const wasCleared = incoming ? previousStatus === 'محصّل' : previousStatus === 'مصروف';
  const wasUncleared = incoming
    ? previousStatus === 'في الحافظة' || previousStatus === 'مودع بالبنك'
    : previousStatus === 'صادر';
  if (action === 'clear' && !wasUncleared) return fail('CHEQUE_LIFECYCLE_INVALID');
  if (action === 'bounce' && !wasUncleared && !wasCleared) return fail('CHEQUE_LIFECYCLE_INVALID');
  if (action === 'cancel' && (wasCleared || (incoming ? previousStatus !== 'في الحافظة' : previousStatus !== 'صادر'))) {
    return fail('CHEQUE_LIFECYCLE_INVALID');
  }

  if (incoming && (!Number.isFinite(cheque.appliedAmount)
    || Math.abs(r2((cheque.appliedAmount as number) - cheque.amount)) > 0.01)) return fail('CHEQUE_LIFECYCLE_INVALID');
  if (!incoming && (!Number.isFinite(cheque.appliedDebt) || !Number.isFinite(cheque.appliedCredit)
    || (cheque.appliedDebt as number) < 0 || (cheque.appliedCredit as number) < 0
    || Math.abs(r2((cheque.appliedDebt as number) + (cheque.appliedCredit as number) - cheque.amount)) > 0.01)) {
    return fail('CHEQUE_LIFECYCLE_INVALID');
  }

  const lines: JournalLine[] = [];
  if (action === 'clear') {
    const bankId = cheque.clearedBankAccountId;
    let bank: string | undefined;
    try { bank = accounts.settlementAccount('تحويل بنكي', bankId); }
    catch { return fail('PAYMENT_METHOD_UNSUPPORTED'); }
    if (incoming) {
      if (!addLine(lines, bank, cheque.amount, 0, 'تحصيل شيك وارد ' + cheque.number)
        || !addLine(lines, accounts.chequesReceivable, 0, cheque.amount, 'إقفال شيك وارد ' + cheque.number)) return fail('ACCOUNT_MAPPING_MISSING');
    } else {
      if (!addLine(lines, accounts.chequesPayable, cheque.amount, 0, 'إقفال شيك صادر ' + cheque.number)
        || !addLine(lines, bank, 0, cheque.amount, 'صرف شيك صادر ' + cheque.number)) return fail('ACCOUNT_MAPPING_MISSING');
    }
  } else if (action === 'bounce' || action === 'cancel') {
    if (incoming) {
      const creditAccount = wasCleared
        ? (() => { try { return accounts.settlementAccount('تحويل بنكي', cheque.clearedBankAccountId); } catch { return undefined; } })()
        : accounts.chequesReceivable;
      if (!addLine(lines, accounts.receivables, cheque.amount, 0, 'إعادة مديونية العميل بسبب ' + (action === 'bounce' ? 'ارتداد' : 'إلغاء') + ' الشيك ' + cheque.number)
        || !addLine(lines, creditAccount, 0, cheque.amount, 'عكس أثر الشيك ' + cheque.number)) return fail('ACCOUNT_MAPPING_MISSING');
    } else {
      const debitAccount = wasCleared
        ? (() => { try { return accounts.settlementAccount('تحويل بنكي', cheque.clearedBankAccountId); } catch { return undefined; } })()
        : accounts.chequesPayable;
      const appliedDebt = cheque.appliedDebt;
      const appliedCredit = cheque.appliedCredit;
      if (!addLine(lines, debitAccount, cheque.amount, 0, 'عكس صرف الشيك ' + cheque.number)
        || !addLine(lines, accounts.payables, 0, appliedDebt as number, 'إعادة مستحقات المورد بسبب الشيك ' + cheque.number)
        || !addLine(lines, accounts.supplierAdvances, 0, appliedCredit as number, 'عكس رصيد مقدم المورد بسبب الشيك ' + cheque.number)) return fail('ACCOUNT_MAPPING_MISSING');
    }
  } else {
    return fail('CHEQUE_LIFECYCLE_INVALID');
  }

  return ok(baseInput(context, 'cheque.lifecycle', eventId, eventDate, periodId,
    (action === 'clear' ? 'تحصيل / صرف' : action === 'bounce' ? 'ارتداد' : 'إلغاء') + ' شيك ' + cheque.number,
    lines, createdAt, createdBy));
}
