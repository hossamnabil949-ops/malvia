import type { AccountingContext, AccountingPeriod, JournalEntry, LedgerAccount, JournalResult } from './accountingCore';
import { createJournalEntry, makeSourceKey } from './accountingCore';
import type { Invoice, PurchaseInvoice, SalesReturn, PurchaseReturn, Expense } from '../types/autoParts';
import { paymentAccountOf } from './paymentMethods';
import {
  buildSalesInvoiceJournal, buildPurchaseInvoiceJournal, buildSalesReturnJournal,
  buildPurchaseReturnJournal, buildExpenseJournal, buildInvoiceVoidJournal,
  type SourceAccountMap, type SourceAdapterError,
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
    sales: required('sales'),
    outputVat: required('vat-output'),
    receivables: required('receivables'),
    costOfGoodsSold: required('cost-of-goods-sold'),
    inventory: required('inventory'),
    operatingExpenses: required('operating-expenses'),
    inputVat: required('vat-input'),
    visaClearing: required('card-clearing'),
    bankFees: required('bank-fees'),
    payables: required('payables'),
    supplierAdvances: required('supplier-advances'),
    salesReturns: required('sales-returns'),
    chequesReceivable: required('cheques-receivable'),
    chequesPayable: required('cheques-payable'),
    partnerCurrentAccount: required('partner-current-account'),
    settlementAccount: (method, bankAccountId) => {
      const rail = paymentAccountOf(method);
      if (rail === 'cash') return systemAccount(accounts, 'cash');
      if (rail === 'visa') return systemAccount(accounts, 'card-clearing');
      if (rail === 'bank') return bankAccountId
        ? systemAccount(accounts, 'bank:' + bankAccountId)
        : undefined;
      if (rail === 'wallet') return systemAccount(accounts, 'wallet');
      if (rail === 'instapay') return systemAccount(accounts, 'instapay');
      return undefined;
    },
  };
}

function sourceInput(request: AccountingPostingRequest) {
  const { kind, document, context, accounts, periods, existingEntries, actor, createdAt } = request;
  const date = 'date' in document ? document.date : '';
  const period = periods.find(item => item.tenantId === context.tenantId
    && item.branchId === context.branchId
    && item.currency.toUpperCase() === context.currency.toUpperCase()
    && item.status === 'open' && item.startDate <= date && item.endDate >= date);
  if (!period) return { error: 'ACCOUNTING_PERIOD_NOT_OPEN' as const };
  const accountMap = makeSourceAccountMap(accounts);
  let adapted: ReturnType<typeof buildSalesInvoiceJournal>;

  switch (kind) {
    case 'sales.invoice':
      adapted = buildSalesInvoiceJournal(document as Invoice, context, period.id, createdAt, actor, accountMap);
      break;
    case 'sales.invoice-void':
      if (!request.voidPlan) return { error: 'VOID_PLAN_REQUIRED' as const };
      adapted = buildInvoiceVoidJournal(document as Invoice, request.voidPlan, context, period.id, createdAt, actor, accountMap);
      break;
    case 'sales.return':
      if (!request.originalInvoice) return { error: 'ORIGINAL_SALES_INVOICE_REQUIRED' as const };
      adapted = buildSalesReturnJournal(document as SalesReturn, request.originalInvoice as Invoice, context, period.id, createdAt, actor, accountMap);
      break;
    case 'purchase.invoice': {
      const purchase = document as PurchaseInvoice;
      if (purchase.receiptStatus === 'pending') return { skipped: 'PURCHASE_NOT_RECEIVED' as const };
      if (purchase.receiptStatus === 'cancelled') return { skipped: 'DOCUMENT_CANCELLED' as const };
      adapted = buildPurchaseInvoiceJournal(purchase, context, period.id, createdAt, actor, accountMap,
        Number((purchase as PurchaseInvoice & { supplierCreditApplied?: number }).supplierCreditApplied ?? 0));
      break;
    }
    case 'purchase.return':
      if (!request.originalInvoice) return { error: 'ORIGINAL_PURCHASE_INVOICE_REQUIRED' as const };
      if ((request.originalInvoice as PurchaseInvoice).receiptStatus === 'pending'
        || (request.originalInvoice as PurchaseInvoice).receiptStatus === 'cancelled') {
        return { skipped: 'PURCHASE_NOT_RECEIVED' as const };
      }
      adapted = buildPurchaseReturnJournal(document as PurchaseReturn, request.originalInvoice as PurchaseInvoice,
        context, period.id, createdAt, actor, accountMap);
      break;
    case 'expense':
      adapted = buildExpenseJournal(document as Expense, context, period.id, createdAt, actor, accountMap);
      break;
  }
  if (adapted.error || !adapted.input) return { error: adapted.error || 'SOURCE_ADAPTER_FAILED' };
  const sourceKey = makeSourceKey(context, adapted.input.source, adapted.input.postingId);
  const prior = existingEntries.find(entry => entry.sourceKey === sourceKey);
  if (prior) return { alreadyPosted: prior };
  return { input: adapted.input, accounts, periods, existingEntries };
}

export function prepareAccountingDocumentPosting(request: AccountingPostingRequest): AccountingPostingResult {
  const prepared = sourceInput(request);
  if ('skipped' in prepared) return { status: 'skipped', entry: null, error: null, reason: prepared.skipped };
  if ('error' in prepared) return { status: 'failed', entry: null, error: prepared.error };
  if ('alreadyPosted' in prepared) return { status: 'already-posted', entry: prepared.alreadyPosted, error: null };
  const result: JournalResult = createJournalEntry(
    prepared.input, prepared.accounts, prepared.periods, prepared.existingEntries,
  );
  if (result.error || !result.entry) {
    // A concurrent/retried request may have won the race after the local duplicate check.
    if (result.error === 'DUPLICATE_POSTING') {
      const key = makeSourceKey(request.context, prepared.input.source, prepared.input.postingId);
      const prior = request.existingEntries.find(entry => entry.sourceKey === key);
      if (prior) return { status: 'already-posted', entry: prior, error: null };
    }
    return { status: 'failed', entry: null, error: result.error || 'JOURNAL_CREATION_FAILED' };
  }
  return { status: 'posted', entry: result.entry, error: null };
}
