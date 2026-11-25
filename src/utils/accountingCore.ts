/**
 * MALVIA accounting foundation — pure domain primitives.
 * No legacy financial records are read, changed, or migrated by this module.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';
export type AccountingPeriodStatus = 'open' | 'closed';

export interface AccountingContext { tenantId: string; branchId: string; currency: string }
export interface LedgerAccount extends AccountingContext {
  id: string; code: string; name: string; type: AccountType; normalBalance: NormalBalance;
  parentId?: string; systemKey?: string; active: boolean;
}
export interface AccountingPeriod extends AccountingContext {
  id: string; name: string; startDate: string; endDate: string;
  status: AccountingPeriodStatus; closedAt?: string; closedBy?: string;
}
export interface JournalSource { type: string; id: string; lineId?: string }
export interface JournalLine { accountId: string; debit: number; credit: number; description?: string }
export interface JournalEntry extends AccountingContext {
  id: string; postingId: string; sourceKey: string; source: JournalSource; date: string;
  periodId: string; memo: string; status: 'posted'; lines: JournalLine[];
  reversalOf?: string; createdAt: string; createdBy: string;
}
export interface CreateJournalInput extends AccountingContext {
  postingId: string; source: JournalSource; date: string; periodId: string; memo: string;
  lines: JournalLine[]; createdAt: string; createdBy: string; reversalOf?: string;
}
export type AccountingError =
  | 'CONTEXT_REQUIRED' | 'CURRENCY_REQUIRED' | 'POSTING_ID_REQUIRED' | 'SOURCE_REQUIRED'
  | 'DATE_INVALID' | 'PERIOD_NOT_FOUND' | 'PERIOD_CLOSED' | 'DATE_OUTSIDE_PERIOD'
  | 'LINES_REQUIRED' | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_INACTIVE' | 'LINE_AMOUNT_INVALID'
  | 'LINE_SIDE_INVALID' | 'ENTRY_UNBALANCED' | 'DUPLICATE_POSTING'
  | 'REVERSAL_TARGET_NOT_FOUND' | 'REVERSAL_ALREADY_EXISTS'
  | 'REVERSAL_CONTEXT_MISMATCH' | 'REVERSAL_ID_REQUIRED'
  | 'OPENING_BALANCE_DATE_MISMATCH' | 'OPENING_BALANCE_RECONCILIATION_INCOMPLETE';
export interface JournalResult { entry: JournalEntry | null; error: AccountingError | null }

export interface TrialBalanceRow {
  account: LedgerAccount;
  openingDebit: number; openingCredit: number;
  movementDebit: number; movementCredit: number;
  closingDebit: number; closingCredit: number;
}

/** Builds a trial balance from posted ledger entries only; legacy balances are not inferred. */
export function buildTrialBalanceRows(
  accounts: LedgerAccount[], entries: JournalEntry[], from: string, to: string,
): TrialBalanceRow[] {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  return accounts.map(account => {
    let openingNet = 0, movementDebit = 0, movementCredit = 0;
    for (const entry of entries) {
      if (entry.status !== 'posted' || entry.date > to
        || entry.tenantId !== account.tenantId || entry.branchId !== account.branchId
        || entry.currency.toUpperCase() !== account.currency.toUpperCase()) continue;
      for (const line of entry.lines) {
        if (line.accountId !== account.id) continue;
        if (entry.date < from) openingNet += line.debit - line.credit;
        else { movementDebit += line.debit; movementCredit += line.credit; }
      }
    }
    const closingNet = openingNet + movementDebit - movementCredit;
    const row = {
      account,
      openingDebit: roundCurrency(Math.max(0, openingNet)),
      openingCredit: roundCurrency(Math.max(0, -openingNet)),
      movementDebit: roundCurrency(movementDebit),
      movementCredit: roundCurrency(movementCredit),
      closingDebit: roundCurrency(Math.max(0, closingNet)),
      closingCredit: roundCurrency(Math.max(0, -closingNet)),
    };
    return row;
  }).filter(row => row.account.active || row.openingDebit || row.openingCredit
    || row.movementDebit || row.movementCredit || row.closingDebit || row.closingCredit);
}

/**
 * Historical preservation policy: legacy source transactions remain untouched.
 * New accounting postings begin at activationDate; prior balances enter only
 * through a separately reconciled opening-balance journal on that date.
 */
export type OpeningBalanceCategory =
  | 'cash' | 'banks' | 'inventory' | 'receivables'
  | 'payables' | 'partnerCurrentAccounts' | 'equity';
export interface OpeningBalanceReconciliation {
  category: OpeningBalanceCategory;
  status: 'matched' | 'unmatched';
  evidenceRef?: string;
}
export interface CreateOpeningBalanceInput extends AccountingContext {
  batchId: string;
  activationDate: string;
  date: string;
  periodId: string;
  memo: string;
  lines: JournalLine[];
  reconciliation: OpeningBalanceReconciliation[];
  createdAt: string;
  createdBy: string;
}


const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

export function roundCurrency(value: number, decimalPlaces = 2): number {
  if (!Number.isFinite(value)) throw new RangeError('قيمة العملة غير صالحة');
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new RangeError('عدد الخانات العشرية للعملة غير صالح');
  }
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
}

export function makeSourceKey(context: AccountingContext, source: JournalSource, postingId: string): string {
  return [
    context.tenantId.trim(), context.branchId.trim(), source.type.trim(), source.id.trim(),
    (source.lineId || '').trim(), postingId.trim(),
  ].map(part => encodeURIComponent(part)).join('|');
}

export function makeJournalId(sourceKey: string): string {
  return 'JRN:' + sourceKey;
}

export function validateAccountingPeriod(period: AccountingPeriod): AccountingError | null {
  if (!period.tenantId.trim() || !period.branchId.trim() || !period.currency.trim()) return 'CONTEXT_REQUIRED';
  if (!period.id.trim() || !validDate(period.startDate) || !validDate(period.endDate)
    || period.startDate > period.endDate) return 'PERIOD_NOT_FOUND';
  return null;
}

export function createJournalEntry(
  input: CreateJournalInput,
  accounts: LedgerAccount[],
  periods: AccountingPeriod[],
  existingEntries: JournalEntry[] = [],
): JournalResult {
  if (!input.tenantId.trim() || !input.branchId.trim()) return { entry: null, error: 'CONTEXT_REQUIRED' };
  if (!input.currency.trim()) return { entry: null, error: 'CURRENCY_REQUIRED' };
  if (!input.postingId.trim()) return { entry: null, error: 'POSTING_ID_REQUIRED' };
  if (!input.source.type.trim() || !input.source.id.trim()) return { entry: null, error: 'SOURCE_REQUIRED' };
  if (!validDate(input.date)) return { entry: null, error: 'DATE_INVALID' };
  if (!input.lines.length) return { entry: null, error: 'LINES_REQUIRED' };

  const context: AccountingContext = {
    tenantId: input.tenantId.trim(), branchId: input.branchId.trim(),
    currency: input.currency.trim().toUpperCase(),
  };
  const period = periods.find(item =>
    item.id === input.periodId && item.tenantId === context.tenantId
    && item.branchId === context.branchId && item.currency.toUpperCase() === context.currency
  );
  if (!period) return { entry: null, error: 'PERIOD_NOT_FOUND' };
  if (period.status !== 'open') return { entry: null, error: 'PERIOD_CLOSED' };
  if (input.date < period.startDate || input.date > period.endDate) return { entry: null, error: 'DATE_OUTSIDE_PERIOD' };

  const sourceKey = makeSourceKey(context, input.source, input.postingId);
  if (existingEntries.some(item => item.sourceKey === sourceKey)) return { entry: null, error: 'DUPLICATE_POSTING' };

  let debitTotal = 0;
  let creditTotal = 0;
  const normalizedLines: JournalLine[] = [];
  for (const line of input.lines) {
    const account = accounts.find(item =>
      item.id === line.accountId && item.tenantId === context.tenantId
      && item.branchId === context.branchId && item.currency.toUpperCase() === context.currency
    );
    if (!account) return { entry: null, error: 'ACCOUNT_NOT_FOUND' };
    if (!account.active) return { entry: null, error: 'ACCOUNT_INACTIVE' };
    if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit)
      || line.debit < 0 || line.credit < 0) return { entry: null, error: 'LINE_AMOUNT_INVALID' };

    const debit = roundCurrency(line.debit);
    const credit = roundCurrency(line.credit);
    if ((debit > 0) === (credit > 0)) return { entry: null, error: 'LINE_SIDE_INVALID' };
    debitTotal += debit;
    creditTotal += credit;
    normalizedLines.push({ ...line, debit, credit });
  }
  debitTotal = roundCurrency(debitTotal);
  creditTotal = roundCurrency(creditTotal);
  if (debitTotal <= 0 || debitTotal !== creditTotal) return { entry: null, error: 'ENTRY_UNBALANCED' };

  return {
    entry: {
      ...context, id: makeJournalId(sourceKey), postingId: input.postingId.trim(), sourceKey,
      source: { ...input.source }, date: input.date, periodId: input.periodId,
      memo: input.memo.trim(), status: 'posted', lines: normalizedLines,
      ...(input.reversalOf ? { reversalOf: input.reversalOf } : {}),
      createdAt: input.createdAt, createdBy: input.createdBy,
    },
    error: null,
  };
}

/** Create a new immutable reversal; never edit or delete the original journal. */
export function createReversalEntry(
  originalEntryId: string, reversalId: string, date: string, periodId: string,
  createdAt: string, createdBy: string, accounts: LedgerAccount[],
  periods: AccountingPeriod[], existingEntries: JournalEntry[],
): JournalResult {
  if (!reversalId.trim()) return { entry: null, error: 'REVERSAL_ID_REQUIRED' };
  const original = existingEntries.find(item => item.id === originalEntryId);
  if (!original) return { entry: null, error: 'REVERSAL_TARGET_NOT_FOUND' };
  if (existingEntries.some(item => item.reversalOf === originalEntryId)) {
    return { entry: null, error: 'REVERSAL_ALREADY_EXISTS' };
  }
  const period = periods.find(item => item.id === periodId);
  if (!period || period.tenantId !== original.tenantId || period.branchId !== original.branchId
    || period.currency.toUpperCase() !== original.currency.toUpperCase()) {
    return { entry: null, error: 'REVERSAL_CONTEXT_MISMATCH' };
  }
  return createJournalEntry({
    tenantId: original.tenantId, branchId: original.branchId, currency: original.currency,
    postingId: 'reversal:' + reversalId.trim(),
    source: { type: 'journal.reversal', id: originalEntryId },
    date, periodId, memo: 'عكس القيد ' + original.id,
    lines: original.lines.map(line => ({ ...line, debit: line.credit, credit: line.debit })),
    reversalOf: original.id, createdAt, createdBy,
  }, accounts, periods, existingEntries);
}



const REQUIRED_OPENING_BALANCE_CATEGORIES: OpeningBalanceCategory[] = [
  'cash', 'banks', 'inventory', 'receivables',
  'payables', 'partnerCurrentAccounts', 'equity',
];

/** Posts one balanced opening batch only after every legacy balance class is reconciled. */
export function createOpeningBalanceEntry(
  input: CreateOpeningBalanceInput,
  accounts: LedgerAccount[],
  periods: AccountingPeriod[],
  existingEntries: JournalEntry[] = [],
): JournalResult {
  if (!validDate(input.activationDate) || input.date !== input.activationDate) {
    return { entry: null, error: 'OPENING_BALANCE_DATE_MISMATCH' };
  }
  const reconciled = new Set(
    input.reconciliation.filter(item => item.status === 'matched').map(item => item.category),
  );
  if (REQUIRED_OPENING_BALANCE_CATEGORIES.some(category => !reconciled.has(category))) {
    return { entry: null, error: 'OPENING_BALANCE_RECONCILIATION_INCOMPLETE' };
  }
  if (input.reconciliation.some(item => item.status === 'matched' && !item.evidenceRef?.trim())) {
    return { entry: null, error: 'OPENING_BALANCE_RECONCILIATION_INCOMPLETE' };
  }
  return createJournalEntry({
    tenantId: input.tenantId,
    branchId: input.branchId,
    currency: input.currency,
    postingId: 'opening-balance:' + input.batchId.trim(),
    source: { type: 'accounting.opening-balance', id: input.batchId.trim() },
    date: input.date,
    periodId: input.periodId,
    memo: input.memo,
    lines: input.lines,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  }, accounts, periods, existingEntries);
}

/** Extensible starter chart, not a jurisdiction-specific tax chart. */
export function createDefaultChartOfAccounts(context: AccountingContext): LedgerAccount[] {
  const base = { ...context, currency: context.currency.trim().toUpperCase(), active: true };
  const rows: Array<[string, string, AccountType, NormalBalance, string]> = [
    ['1000', 'الخزينة', 'asset', 'debit', 'cash'],
    ['1010', 'البنوك', 'asset', 'debit', 'bank'],
    ['1020', 'مستحقات البطاقات', 'asset', 'debit', 'card-clearing'],
    ['1021', 'محافظ إلكترونية', 'asset', 'debit', 'wallet'],
    ['1022', 'مستحقات إنستاباي', 'asset', 'debit', 'instapay'],
    ['1100', 'العملاء', 'asset', 'debit', 'receivables'],
    ['1200', 'المخزون', 'asset', 'debit', 'inventory'],
    ['1300', 'ضريبة مدخلات - تحتاج ضبطًا ضريبيًا', 'asset', 'debit', 'vat-input'],
    ['1400', 'دفعات مقدمة للموردين', 'asset', 'debit', 'supplier-advances'],
    ['1500', 'شيكات تحت التحصيل', 'asset', 'debit', 'cheques-receivable'],
    ['2000', 'الموردون', 'liability', 'credit', 'payables'],
    ['2050', 'شيكات مستحقة الدفع', 'liability', 'credit', 'cheques-payable'],
    ['2010', 'جاري الشركاء - التزامات', 'liability', 'credit', 'partner-current-account'],
    ['2100', 'ضريبة مخرجات - تحتاج ضبطًا ضريبيًا', 'liability', 'credit', 'vat-output'],
    ['3000', 'رأس المال', 'equity', 'credit', 'capital'],
    ['3100', 'الأرباح المحتجزة', 'equity', 'credit', 'retained-earnings'],
    ['4000', 'المبيعات', 'revenue', 'credit', 'sales'],
    ['4010', 'مردودات المبيعات', 'revenue', 'debit', 'sales-returns'],
    ['5000', 'تكلفة البضاعة المباعة', 'expense', 'debit', 'cost-of-goods-sold'],
    ['5100', 'المصروفات التشغيلية', 'expense', 'debit', 'operating-expenses'],
    ['5110', 'عمولات ورسوم بنكية', 'expense', 'debit', 'bank-fees'],
  ];
  return rows.map(([code, name, type, normalBalance, systemKey]) => ({
    ...base, id: context.tenantId + ':' + context.branchId + ':' + systemKey,
    code, name, type, normalBalance, systemKey,
  }));
}
