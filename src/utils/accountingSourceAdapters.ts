import type {
  AccountingContext, CreateJournalInput, JournalLine,
} from './accountingCore';
import type {
  Expense, Invoice, InvoicePayment, PartnerCurrentAccountTransaction,
} from '../types/autoParts';
import { paymentAccountOf } from './paymentMethods';

export type SourceAdapterError =
  | 'SOURCE_ID_REQUIRED' | 'SOURCE_DATE_INVALID' | 'SOURCE_AMOUNT_INVALID'
  | 'INVOICE_CANCELLED' | 'INVOICE_TOTAL_MISMATCH' | 'PAYMENT_TOTAL_MISMATCH'
  | 'PAYMENT_METHOD_UNSUPPORTED' | 'ACCOUNT_MAPPING_MISSING'
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
  partnerCurrentAccount: string;
  /** Resolve cash, bank, wallet, InstaPay, card-clearing, or other approved rails. */
  settlementAccount: (method: string, bankAccountId?: string) => string | undefined;
}

const fail = (error: SourceAdapterError): SourceAdapterResult => ({ input: null, error });
const ok = (input: CreateJournalInput): SourceAdapterResult => ({ input, error: null });
const validDate = (value: string): boolean => {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
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

/** Expenses have no tax breakdown in the legacy Expense record; the full amount stays unsplit. */
export function buildExpenseJournal(
  expense: Expense, context: AccountingContext, periodId: string, createdAt: string, createdBy: string,
  accounts: SourceAccountMap,
): SourceAdapterResult {
  if (!expense.id?.trim()) return fail('SOURCE_ID_REQUIRED');
  if (!validDate(expense.date)) return fail('SOURCE_DATE_INVALID');
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) return fail('SOURCE_AMOUNT_INVALID');
  let settlement: string | undefined;
  try { settlement = accounts.settlementAccount(String(expense.paymentMethod)); }
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
  }
  return ok(baseInput(context, 'partner.current-account', movement.id, movement.date, periodId,
    'حركة جاري الشريك ' + movement.partnerName, lines, createdAt, createdBy));
}
