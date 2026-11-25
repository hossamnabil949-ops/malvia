import type { AccountingContext, AccountingPeriod, JournalEntry, LedgerAccount, JournalResult } from './accountingCore';
import { createJournalEntry, makeSourceKey } from './accountingCore';
import type { Invoice, PurchaseInvoice, SalesReturn, PurchaseReturn, Expense } from '../types/autoParts';
import { paymentAccountOf } from './paymentMethods';
import {
  buildSalesInvoiceJournal, buildPurchaseInvoiceJournal, buildSalesReturnJournal,
  buildPurchaseReturnJournal, buildExpenseJournal, buildInvoiceVoidJournal,
  type SourceAccountMap,
} from './accountingSourceAdapters';
import type { VoidPlan } from './saleLogic';

export type AccountingDocumentKind =
  | 'sales.invoice' | 'sales.invoice-void' | 'sales.return'
  | 'purchase.invoice' | 'purchase.return' | 'expense';

export interface AccountingPostingRequest {
  kind: AccountingDocumentKind;
  document: Invoice | PurchaseInvoice | SalesReturn | PurchaseReturn | Expense;
  context: AccountingContext;
  accounts: LedgerAccount[];
  periods: AccountingPeriod[];
  existingEntries: JournalEntry[];
  actor: string;
  createdAt: string;
  originalInvoice?: Invoice | PurchaseInvoice;
  voidPlan?: VoidPlan;
}

export type AccountingPostingResult =
  | { status: 'posted' | 'already-posted'; entry: JournalEntry; error: null }
  | { status: 'skipped'; entry: null; error: null; reason: 'PURCHASE_NOT_RECEIVED' | 'DOCUMENT_CANCELLED' }
  | { status: 'failed'; entry: null; error: string };

const systemAccount = (accounts: LedgerAccount[], key: string): string | undefined =>
  accounts.find(account => account.systemKey === key && account.active)?.id;

function makeSourceAccountMap(accounts: LedgerAccount[]): SourceAccountMap {
  const required = (key: string) => systemAccount(accounts, key) || '';
  return {
    sales: required('sales'), outputVat: required('vat-output'), receivables: required('receivables'),
    costOfGoodsSold: required('cost-of-goods-sold'), inventory: required('inventory'),
    operatingExpenses: required('operating-expenses'), inputVat: required('vat-input'),
    visaClearing: required('card-clearing'), bankFees: required('bank-fees'),
    payables: required('payables'), supplierAdvances: required('supplier-advances'),
    salesReturns: required('sales-returns'), chequesReceivable: required('cheques-receivable'),
    chequesPayable: required('cheques-payable'), partnerCurrentAccount: required('partner-current-account'),
    settlementAccount: (method, bankAccountId) => {
      const rail = paymentAccountOf(method);
      if (rail === 'cash') return systemAccount(accounts, 'cash');
      if (rail === 'visa') return systemAccount(accounts, 'card-clearing');
      if (rail === 'bank') return bankAccountId ? systemAccount(accounts, 'bank:' + bankAccountId) : undefined;
      if (rail === 'wallet') return systemAccount(accounts, 'wallet');
      if (rail === 'instapay') return systemAccount(accounts, 'instapay');
      return undefined;
    },
  };
}

export function prepareAccountingDocumentPosting(request: AccountingPostingRequest): AccountingPostingResult {
  const { kind, document, context, accounts, periods, existingEntries, actor, createdAt } = request;
  const date = 'date' in document ? document.date : '';
  if (kind === 'purchase.invoice') {
    const purchase = document as PurchaseInvoice;
    if (purchase.receiptStatus === 'pending') return { status: 'skipped', entry: null, error: null, reason: 'PURCHASE_NOT_RECEIVED' };
    if (purchase.receiptStatus === 'cancelled') return { status: 'skipped', entry: null, error: null, reason: 'DOCUMENT_CANCELLED' };
  }
  const period = periods.find(item => item.tenantId === context.tenantId
    && item.branchId === context.branchId && item.currency.toUpperCase() === context.currency.toUpperCase()
    && item.status === 'open' && item.startDate <= date && item.endDate >= date);
  if (!period) return { status: 'failed', entry: null, error: 'ACCOUNTING_PERIOD_NOT_OPEN' };
  const accountMap = makeSourceAccountMap(accounts);
  let adapted: ReturnType<typeof buildSalesInvoiceJournal>;
  switch (kind) {
    case 'sales.invoice':
      adapted = buildSalesInvoiceJournal(document as Invoice, context, period.id, createdAt, actor, accountMap); break;
    case 'sales.invoice-void':
      if (!request.voidPlan) return { status: 'failed', entry: null, error: 'VOID_PLAN_REQUIRED' };
      adapted = buildInvoiceVoidJournal(document as Invoice, request.voidPlan, context, period.id, createdAt, actor, accountMap); break;
    case 'sales.return':
      if (!request.originalInvoice) return { status: 'failed', entry: null, error: 'ORIGINAL_SALES_INVOICE_REQUIRED' };
      adapted = buildSalesReturnJournal(document as SalesReturn, request.originalInvoice as Invoice, context, period.id, createdAt, actor, accountMap); break;
    case 'purchase.invoice':
      adapted = buildPurchaseInvoiceJournal(document as PurchaseInvoice, context, period.id, createdAt, actor, accountMap,
        Number((document as PurchaseInvoice & { supplierCreditApplied?: number }).supplierCreditApplied ?? 0)); break;
    case 'purchase.return':
      if (!request.originalInvoice) return { status: 'failed', entry: null, error: 'ORIGINAL_PURCHASE_INVOICE_REQUIRED' };
      if ((request.originalInvoice as PurchaseInvoice).receiptStatus === 'pending'
        || (request.originalInvoice as PurchaseInvoice).receiptStatus === 'cancelled') {
        return { status: 'skipped', entry: null, error: null, reason: 'PURCHASE_NOT_RECEIVED' };
      }
      adapted = buildPurchaseReturnJournal(document as PurchaseReturn, request.originalInvoice as PurchaseInvoice, context, period.id, createdAt, actor, accountMap); break;
    case 'expense':
      adapted = buildExpenseJournal(document as Expense, context, period.id, createdAt, actor, accountMap); break;
  }
  if (adapted.error || !adapted.input) return { status: 'failed', entry: null, error: adapted.error || 'SOURCE_ADAPTER_FAILED' };
  const sourceKey = makeSourceKey(context, adapted.input.source, adapted.input.postingId);
  const prior = existingEntries.find(entry => entry.sourceKey === sourceKey);
  if (prior) return { status: 'already-posted', entry: prior, error: null };
  const result: JournalResult = createJournalEntry(adapted.input, accounts, periods, existingEntries);
  if (result.error || !result.entry) return { status: 'failed', entry: null, error: result.error || 'JOURNAL_CREATION_FAILED' };
  return { status: 'posted', entry: result.entry, error: null };
}
