import assert from 'node:assert/strict';
import {
  createDefaultChartOfAccounts, createJournalEntry, createReversalEntry,
  makeSourceKey, roundCurrency,
  type AccountingContext, type AccountingPeriod, type CreateJournalInput,
  type JournalEntry, type LedgerAccount,
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

console.log('accountingCore: all tests passed');
