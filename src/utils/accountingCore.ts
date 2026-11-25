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


export interface StatementLine {
  accountId: string; code: string; name: string; amount: number;
}
export interface IncomeStatement {
  revenueLines: StatementLine[]; expenseLines: StatementLine[];
  totalRevenue: number; totalExpenses: number; netIncome: number;
}
export interface BalanceSheet {
  assetLines: StatementLine[]; liabilityLines: StatementLine[]; equityLines: StatementLine[];
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  currentPeriodEarnings: number; liabilitiesAndEquity: number; difference: number;
}
export interface CashFlowStatement {
  openingCash: number; operating: number; investing: number;
  financing: number; unclassified: number; netChange: number; closingCash: number;
}
export interface FinancialStatements {
  income: IncomeStatement; balance: BalanceSheet; cashFlow: CashFlowStatement;
}
export type PeriodCloseError =
  | 'PERIOD_NOT_FOUND' | 'PERIOD_ALREADY_CLOSED' | 'PERIOD_NOT_ENDED'
  | 'CLOSE_DATE_INVALID' | 'PERIOD_ENTRIES_UNBALANCED' | 'PERIOD_TOTALS_UNBALANCED';
export type PeriodCloseResult =
  | { period: AccountingPeriod; error: null }
  | { period: null; error: PeriodCloseError };

const inContext = (account: LedgerAccount, context: AccountingContext) =>
  account.tenantId === context.tenantId && account.branchId === context.branchId
  && account.currency.toUpperCase() === context.currency.toUpperCase();

const statementLines = (accounts: LedgerAccount[], amountById: Map<string, number>): StatementLine[] =>
  accounts.filter(account => account.active && (amountById.get(account.id) || 0) !== 0)
    .map(account => ({ accountId: account.id, code: account.code, name: account.name,
      amount: roundCurrency(amountById.get(account.id) || 0) }))
    .sort((a, b) => a.code.localeCompare(b.code));

/** Builds journal-only statements. Legacy balances are included only through posted opening journals. */
export function buildFinancialStatements(
  accounts: LedgerAccount[], entries: JournalEntry[], context: AccountingContext,
  from: string, to: string,
): FinancialStatements {
  if (!validDate(from) || !validDate(to) || from > to) {
    const emptyIncome: IncomeStatement = { revenueLines: [], expenseLines: [], totalRevenue: 0, totalExpenses: 0, netIncome: 0 };
    const emptyBalance: BalanceSheet = { assetLines: [], liabilityLines: [], equityLines: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, currentPeriodEarnings: 0, liabilitiesAndEquity: 0, difference: 0 };
    return { income: emptyIncome, balance: emptyBalance, cashFlow: { openingCash: 0, operating: 0, investing: 0, financing: 0, unclassified: 0, netChange: 0, closingCash: 0 } };
  }
  const scopedAccounts = accounts.filter(account => inContext(account, context));
  const scopedEntries = entries.filter(entry => entry.status === 'posted' && entry.tenantId === context.tenantId
    && entry.branchId === context.branchId && entry.currency.toUpperCase() === context.currency.toUpperCase()
    && entry.date <= to);
  const periodEntries = scopedEntries.filter(entry => entry.date >= from);
  const incomeNet = new Map<string, number>();
  for (const entry of periodEntries) for (const line of entry.lines) {
    incomeNet.set(line.accountId, (incomeNet.get(line.accountId) || 0) + line.credit - line.debit);
  }
  const revenueAmounts = new Map<string, number>();
  const expenseAmounts = new Map<string, number>();
  for (const account of scopedAccounts) {
    const net = incomeNet.get(account.id) || 0;
    if (account.type === 'revenue') revenueAmounts.set(account.id, net);
    if (account.type === 'expense') expenseAmounts.set(account.id, -net);
  }
  const revenueLines = statementLines(scopedAccounts.filter(a => a.type === 'revenue'), revenueAmounts);
  const expenseLines = statementLines(scopedAccounts.filter(a => a.type === 'expense'), expenseAmounts);
  const totalRevenue = roundCurrency(revenueLines.reduce((sum, line) => sum + line.amount, 0));
  const totalExpenses = roundCurrency(expenseLines.reduce((sum, line) => sum + line.amount, 0));
  const netIncome = roundCurrency(totalRevenue - totalExpenses);
  const balanceNet = new Map<string, number>();
  for (const entry of scopedEntries) for (const line of entry.lines) {
    balanceNet.set(line.accountId, (balanceNet.get(line.accountId) || 0) + line.debit - line.credit);
  }
  const assets = new Map<string, number>(), liabilities = new Map<string, number>(), equity = new Map<string, number>();
  for (const account of scopedAccounts) {
    const net = balanceNet.get(account.id) || 0;
    if (account.type === 'asset') assets.set(account.id, net);
    if (account.type === 'liability') liabilities.set(account.id, -net);
    if (account.type === 'equity') equity.set(account.id, -net);
  }
  const assetLines = statementLines(scopedAccounts.filter(a => a.type === 'asset'), assets);
  const liabilityLines = statementLines(scopedAccounts.filter(a => a.type === 'liability'), liabilities);
  const equityLines = statementLines(scopedAccounts.filter(a => a.type === 'equity'), equity);
  const totalAssets = roundCurrency(assetLines.reduce((sum, line) => sum + line.amount, 0));
  const totalLiabilities = roundCurrency(liabilityLines.reduce((sum, line) => sum + line.amount, 0));
  const totalEquity = roundCurrency(equityLines.reduce((sum, line) => sum + line.amount, 0));
  const liabilitiesAndEquity = roundCurrency(totalLiabilities + totalEquity + netIncome);
  const cashKeys = (key?: string) => !!key && (key === 'cash' || key === 'bank' || key.startsWith('bank:')
    || key === 'wallet' || key.startsWith('wallet:') || key === 'instapay' || key.startsWith('instapay:'));
  const liquidIds = new Set(scopedAccounts.filter(account => cashKeys(account.systemKey)).map(account => account.id));
  const cashDelta = (entry: JournalEntry) => roundCurrency(entry.lines
    .filter(line => liquidIds.has(line.accountId)).reduce((sum, line) => sum + line.debit - line.credit, 0));
  const openingCash = roundCurrency(scopedEntries.filter(entry => entry.date < from).reduce((sum, entry) => sum + cashDelta(entry), 0));
  const flows = { operating: 0, investing: 0, financing: 0, unclassified: 0 };
  const flowTypes: Record<string, keyof typeof flows> = {
    'sales.invoice': 'operating', 'sales.invoice-void': 'operating', 'sales.return': 'operating',
    'purchase.invoice': 'operating', 'purchase.invoice-void': 'operating', 'purchase.return': 'operating',
    expense: 'operating', 'customer.receipt': 'operating', 'supplier.payment': 'operating',
    'bank.card-settlement': 'operating', 'cheque.lifecycle': 'operating',
    'partner.current-account': 'financing',
  };
  for (const entry of periodEntries) {
    const delta = cashDelta(entry);
    if (!delta) continue;
    const category = flowTypes[entry.source.type] || 'unclassified';
    flows[category] = roundCurrency(flows[category] + delta);
  }
  const netChange = roundCurrency(flows.operating + flows.investing + flows.financing + flows.unclassified);
  return {
    income: { revenueLines, expenseLines, totalRevenue, totalExpenses, netIncome },
    balance: { assetLines, liabilityLines, equityLines, totalAssets, totalLiabilities, totalEquity,
      currentPeriodEarnings: netIncome, liabilitiesAndEquity, difference: roundCurrency(totalAssets - liabilitiesAndEquity) },
    cashFlow: { openingCash, ...flows, netChange, closingCash: roundCurrency(openingCash + netChange) },
  };
}

/** Closes a period only after checking every posted entry and the period-wide debit/credit totals. */
export function closeAccountingPeriod(
  periodId: string, closedAt: string, closedBy: string,
  periods: AccountingPeriod[], entries: JournalEntry[],
): PeriodCloseResult {
  const period = periods.find(item => item.id === periodId);
  if (!period) return { period: null, error: 'PERIOD_NOT_FOUND' };
  if (period.status !== 'open') return { period: null, error: 'PERIOD_ALREADY_CLOSED' };
  const closeDate = closedAt.slice(0, 10);
  if (!validDate(closeDate)) return { period: null, error: 'CLOSE_DATE_INVALID' };
  if (period.endDate > closeDate) return { period: null, error: 'PERIOD_NOT_ENDED' };
  const periodEntries = entries.filter(entry => entry.status === 'posted' && entry.periodId === periodId
    && entry.tenantId === period.tenantId && entry.branchId === period.branchId
    && entry.currency.toUpperCase() === period.currency.toUpperCase());
  let debit = 0, credit = 0;
  for (const entry of periodEntries) {
    let entryDebit = 0, entryCredit = 0;
    for (const line of entry.lines) {
      if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0
        || ((line.debit > 0) === (line.credit > 0))) return { period: null, error: 'PERIOD_ENTRIES_UNBALANCED' };
      entryDebit += line.debit; entryCredit += line.credit;
    }
    if (roundCurrency(entryDebit) <= 0 || roundCurrency(entryDebit) !== roundCurrency(entryCredit)) {
      return { period: null, error: 'PERIOD_ENTRIES_UNBALANCED' };
    }
    debit += entryDebit; credit += entryCredit;
  }
  if (roundCurrency(debit) !== roundCurrency(credit)) return { period: null, error: 'PERIOD_TOTALS_UNBALANCED' };
  return { period: { ...period, status: 'closed', closedAt, closedBy }, error: null };
}
