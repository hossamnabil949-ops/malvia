import assert from 'node:assert/strict';
import {
  buildTrialBalanceRows, createDefaultChartOfAccounts, createJournalEntry, createReversalEntry, createOpeningBalanceEntry,
  makeSourceKey, roundCurrency,
  type AccountingContext, type AccountingPeriod, type CreateJournalInput,
  type JournalEntry, type LedgerAccount, type OpeningBalanceReconciliation,
} from '../src/utils/accountingCore.ts';

const context: AccountingContext = { tenantId: 'tenant-a', branchId: 'branch-1', currency: 'EGP' };
const accounts: LedgerAccount[] = createDefaultChartOfAccounts(context);
const cashId = context.tenantId + ':' + context.branchId + ':cash';
const salesId = context.tenantId + ':' + context.branchId + ':sales';
const vatId = context.tenantId + ':' + context.branchId + ':vat-output';
const period: AccountingPeriod = {
  ...context, id: '2026-11', name: 'November 2026',
  startDate: '2026-11-01', endDate: '2026-11-30', status: 'open',
};
const baseInput: CreateJournalInput = {
  ...context, postingId: 'invoice-100-sale',
  source: { type: 'sales-invoice', id: 'invoice-100' },
  date: '2026-11-16', periodId: period.id, memo: 'بيع نقدي',
  lines: [
    { accountId: cashId, debit: 1130, credit: 0 },
    { accountId: salesId, debit: 0, credit: 1000 },
    { accountId: vatId, debit: 0, credit: 130 },
  ],
  createdAt: '2026-11-16T10:00:00.000Z', createdBy: 'test-user',
};

const valid = createJournalEntry(baseInput, accounts, [period]);
assert.equal(valid.error, null);
assert.ok(valid.entry);
assert.equal(valid.entry?.lines.reduce((sum, line) => sum + line.debit, 0), 1130);
assert.equal(valid.entry?.lines.reduce((sum, line) => sum + line.credit, 0), 1130);

const unbalanced = createJournalEntry({
  ...baseInput, postingId: 'bad-balance',
  lines: [{ accountId: cashId, debit: 100, credit: 0 }, { accountId: salesId, debit: 0, credit: 99 }],
}, accounts, [period]);
assert.equal(unbalanced.error, 'ENTRY_UNBALANCED');

const bothSides = createJournalEntry({
  ...baseInput, postingId: 'bad-line',
  lines: [{ accountId: cashId, debit: 10, credit: 10 }],
}, accounts, [period]);
assert.equal(bothSides.error, 'LINE_SIDE_INVALID');

const original = valid.entry as JournalEntry;
assert.equal(createJournalEntry(baseInput, accounts, [period], [original]).error, 'DUPLICATE_POSTING');

const reversal = createReversalEntry(
  original.id, 'cancel-invoice-100', '2026-11-17', period.id,
  '2026-11-17T09:00:00.000Z', 'manager', accounts, [period], [original],
);
assert.equal(reversal.error, null);
assert.equal(reversal.entry?.reversalOf, original.id);
assert.deepEqual(reversal.entry?.lines.map(line => [line.debit, line.credit]),
  original.lines.map(line => [line.credit, line.debit]));
assert.equal(original.lines[0].debit, 1130);
const secondReversal = createReversalEntry(
  original.id, 'cancel-again', '2026-11-17', period.id,
  '2026-11-17T09:01:00.000Z', 'manager', accounts, [period], [original, reversal.entry as JournalEntry],
);
assert.equal(secondReversal.error, 'REVERSAL_ALREADY_EXISTS');

assert.equal(createJournalEntry(baseInput, accounts, [{ ...period, status: 'closed' }]).error, 'PERIOD_CLOSED');
assert.equal(createJournalEntry({ ...baseInput, date: '2026-12-01' }, accounts, [period]).error, 'DATE_OUTSIDE_PERIOD');

const foreignAccounts = createDefaultChartOfAccounts({ ...context, branchId: 'branch-2' });
assert.equal(createJournalEntry(baseInput, foreignAccounts, [period]).error, 'ACCOUNT_NOT_FOUND');
assert.equal(createJournalEntry(baseInput, accounts, [{ ...period, branchId: 'branch-2' }]).error, 'PERIOD_NOT_FOUND');

assert.equal(roundCurrency(1.005), 1.01);
assert.equal(roundCurrency(12.345, 3), 12.345);
assert.throws(() => roundCurrency(1, 7), RangeError);
assert.throws(() => roundCurrency(Number.NaN), RangeError);
assert.notEqual(
  makeSourceKey(context, { type: 'sale', id: '1' }, 'post-1'),
  makeSourceKey({ ...context, branchId: 'branch-2' }, { type: 'sale', id: '1' }, 'post-1'),
);



// Opening balances are permitted only on the configured activation date and
// only after all legacy balance classes have matching reconciliation evidence.
const reconciledOpeningBalances: OpeningBalanceReconciliation[] = [
  'cash', 'banks', 'inventory', 'receivables', 'payables',
  'partnerCurrentAccounts', 'equity',
].map(category => ({ category: category as OpeningBalanceReconciliation['category'], status: 'matched', evidenceRef: 'recon:' + category }));
const openingInput = {
  ...context, batchId: 'activation-batch-1',
  activationDate: '2026-11-20', date: '2026-11-20',
  periodId: period.id, memo: 'الأرصدة الافتتاحية بعد المطابقة',
  lines: [
    { accountId: cashId, debit: 5000, credit: 0 },
    { accountId: salesId, debit: 0, credit: 5000 },
  ],
  reconciliation: reconciledOpeningBalances,
  createdAt: '2026-11-20T08:00:00.000Z', createdBy: 'owner',
};
assert.equal(createOpeningBalanceEntry(openingInput, accounts, [period]).error, null);
assert.equal(
  createOpeningBalanceEntry({ ...openingInput, date: '2026-11-19' }, accounts, [period]).error,
  'OPENING_BALANCE_DATE_MISMATCH',
);
assert.equal(
  createOpeningBalanceEntry({
    ...openingInput,
    reconciliation: reconciledOpeningBalances.filter(item => item.category !== 'inventory'),
  }, accounts, [period]).error,
  'OPENING_BALANCE_RECONCILIATION_INCOMPLETE',
);
assert.equal(
  createOpeningBalanceEntry({
    ...openingInput,
    reconciliation: reconciledOpeningBalances.map(item =>
      item.category === 'banks' ? { ...item, evidenceRef: '' } : item),
  }, accounts, [period]).error,
  'OPENING_BALANCE_RECONCILIATION_INCOMPLETE',
);
assert.equal(
  createOpeningBalanceEntry({ ...openingInput, batchId: 'unbalanced', lines: [
    { accountId: cashId, debit: 5000, credit: 0 },
    { accountId: salesId, debit: 0, credit: 4999 },
  ] }, accounts, [period]).error,
  'ENTRY_UNBALANCED',
);

const openingTrialEntry = createJournalEntry({
  ...baseInput, postingId: 'trial-opening', date: '2026-11-05',
  lines: [{ accountId: cashId, debit: 1000, credit: 0 }, { accountId: salesId, debit: 0, credit: 1000 }],
}, accounts, [period]);
const movementTrialEntry = createJournalEntry({
  ...baseInput, postingId: 'trial-movement', date: '2026-11-16',
  lines: [{ accountId: cashId, debit: 0, credit: 200 }, { accountId: salesId, debit: 200, credit: 0 }],
}, accounts, [period]);
assert.equal(openingTrialEntry.error, null);
assert.equal(movementTrialEntry.error, null);
const trialRows = buildTrialBalanceRows(accounts,
  [openingTrialEntry.entry as JournalEntry, movementTrialEntry.entry as JournalEntry],
  '2026-11-10', '2026-11-30');
const cashTrial = trialRows.find(row => row.account.id === cashId);
assert.equal(cashTrial?.openingDebit, 1000);
assert.equal(cashTrial?.movementCredit, 200);
assert.equal(cashTrial?.closingDebit, 800);
assert.equal(cashTrial?.closingCredit, 0);
const salesTrial = trialRows.find(row => row.account.id === salesId);
assert.equal(salesTrial?.openingCredit, 1000);
assert.equal(salesTrial?.movementDebit, 200);
assert.equal(salesTrial?.closingCredit, 800);
assert.equal(buildTrialBalanceRows(accounts, [], '2026-12-31', '2026-01-01').length, 0);
const archivedCash = { ...accounts.find(account => account.id === cashId)!, active: false };
const archivedTrial = buildTrialBalanceRows(
  [archivedCash], [openingTrialEntry.entry as JournalEntry],
  '2026-11-10', '2026-11-30',
);
assert.equal(archivedTrial.length, 1, 'inactive accounts with balances must remain visible');
assert.equal(archivedTrial[0].closingDebit, 1000);


console.log('accountingCore: all tests passed');


const {
  buildFinancialStatements, closeAccountingPeriod,
} = await import('../src/utils/accountingCore.ts');
const expenseId = context.tenantId + ':' + context.branchId + ':operating-expenses';
const partnerCurrentId = context.tenantId + ':' + context.branchId + ':partner-current-account';
const makeTestEntry = (postingId: string, sourceType: string, date: string, lines: CreateJournalInput['lines']) => {
  const result = createJournalEntry({
    ...context, postingId, source: { type: sourceType, id: postingId },
    date, periodId: period.id, memo: postingId, lines,
    createdAt: date + 'T12:00:00.000Z', createdBy: 'test',
  }, accounts, [period]);
  assert.equal(result.error, null);
  return result.entry as JournalEntry;
};
const statementEntries = [
  makeTestEntry('statement-sale', 'sales.invoice', '2026-11-05', [
    { accountId: cashId, debit: 100, credit: 0 }, { accountId: salesId, debit: 0, credit: 100 },
  ]),
  makeTestEntry('statement-expense', 'expense', '2026-11-10', [
    { accountId: expenseId, debit: 40, credit: 0 }, { accountId: cashId, debit: 0, credit: 40 },
  ]),
  makeTestEntry('statement-partner-funding', 'partner.current-account', '2026-11-15', [
    { accountId: cashId, debit: 25, credit: 0 }, { accountId: partnerCurrentId, debit: 0, credit: 25 },
  ]),
];
const statements = buildFinancialStatements(accounts, statementEntries, context, '2026-11-01', '2026-11-30');
assert.equal(statements.income.totalRevenue, 100);
assert.equal(statements.income.totalExpenses, 40);
assert.equal(statements.income.netIncome, 60);
assert.equal(statements.balance.totalAssets, 85);
assert.equal(statements.balance.totalLiabilities, 25);
assert.equal(statements.balance.currentPeriodEarnings, 60);
assert.equal(statements.balance.difference, 0);
assert.equal(statements.cashFlow.operating, 60);
assert.equal(statements.cashFlow.financing, 25);
assert.equal(statements.cashFlow.closingCash, 85);

const closed = closeAccountingPeriod(period.id, '2026-12-01T09:00:00.000Z', 'owner', [period], statementEntries);
assert.equal(closed.error, null);
assert.equal(closed.period?.status, 'closed');
assert.equal(closed.period?.closedBy, 'owner');
assert.equal(closeAccountingPeriod(period.id, '2026-12-01T09:00:00.000Z', 'owner',
  [closed.period as AccountingPeriod], statementEntries).error, 'PERIOD_ALREADY_CLOSED');
assert.equal(closeAccountingPeriod(period.id, '2026-11-20T09:00:00.000Z', 'owner',
  [period], statementEntries).error, 'PERIOD_NOT_ENDED');
const tampered = { ...statementEntries[0], lines: [
  { accountId: cashId, debit: 100, credit: 0 },
  { accountId: salesId, debit: 0, credit: 99 },
] };
assert.equal(closeAccountingPeriod(period.id, '2026-12-01T09:00:00.000Z', 'owner',
  [period], [tampered, ...statementEntries.slice(1)]).error, 'PERIOD_ENTRIES_UNBALANCED');
