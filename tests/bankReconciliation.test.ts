import assert from 'node:assert/strict';
import { reconcileBankStatement } from '../src/utils/bankReconciliation';
import type { BankLedgerEntry } from '../src/utils/bankLedger';

const ledger: BankLedgerEntry[] = [
  { id: 'L-1', batchId: 'B-1', accountKind: 'bank', bankAccountId: 'BANK-1', direction: 'in', amount: 100, date: '2026-11-10', reference: 'TRX-001', description: 'قبض' },
  { id: 'L-2', batchId: 'B-2', accountKind: 'bank', bankAccountId: 'BANK-1', direction: 'out', amount: 50, date: '2026-11-10', reference: 'PAY-002', description: 'صرف' },
  { id: 'L-3', batchId: 'B-3', accountKind: 'bank', bankAccountId: 'BANK-1', direction: 'in', amount: 75, date: '2026-11-10', reference: 'OTHER-A', description: 'قبض' },
  { id: 'L-4', batchId: 'B-4', accountKind: 'bank', bankAccountId: 'BANK-1', direction: 'in', amount: 75, date: '2026-11-10', reference: 'OTHER-B', description: 'قبض' },
  { id: 'L-5', batchId: 'B-5', accountKind: 'bank', bankAccountId: 'BANK-2', direction: 'in', amount: 999, date: '2026-11-10', reference: 'OTHER', description: 'حساب آخر' },
];
const statement = [
  { id: 'S-1', bankAccountId: 'BANK-1', direction: 'in' as const, amount: 100, date: '2026-11-10', reference: 'TRX001' },
  { id: 'S-2', bankAccountId: 'BANK-1', direction: 'out' as const, amount: 50, date: '2026-11-10', reference: 'PAY-002' },
  { id: 'S-3', bankAccountId: 'BANK-1', direction: 'in' as const, amount: 75, date: '2026-11-10' },
  { id: 'S-4', bankAccountId: 'BANK-1', direction: 'out' as const, amount: 80, date: '2026-11-10', reference: 'NOT-IN-LEDGER' },
  { id: 'S-5', bankAccountId: 'BANK-1', direction: 'in' as const, amount: 100, date: '2026-11-10', reference: 'TRX001' },
];
const result = reconcileBankStatement('BANK-1', statement, ledger);
assert.equal(result.matches[0].status, 'matched_reference');
assert.equal(result.matches[1].status, 'matched_reference');
assert.equal(result.matches[2].status, 'ambiguous_statement');
assert.equal(result.matches[3].status, 'unmatched_statement');
assert.equal(result.matches[4].status, 'duplicate_statement');
assert.equal(result.matchedCount, 2);
assert.equal(result.unmatchedStatementCount, 1);
assert.equal(result.ambiguousCount, 1);
assert.equal(result.duplicateStatementCount, 1);
assert.deepEqual(result.unmatchedLedgerEntryIds, ['L-3', 'L-4']);
assert.equal(ledger.length, 5, 'reconciliation must not mutate source ledger entries');

const uniqueFallback = reconcileBankStatement('BANK-1', [
  { id: 'S-6', bankAccountId: 'BANK-1', direction: 'in', amount: 100, date: '2026-11-10' },
], [ledger[0]]);
assert.equal(uniqueFallback.matches[0].status, 'matched_amount_date');

const invalid = reconcileBankStatement('BANK-1', [
  { id: 'S-7', bankAccountId: 'BANK-2', direction: 'in', amount: 100, date: '2026-11-10' },
], ledger);
assert.equal(invalid.matches[0].status, 'unmatched_statement');
