import assert from 'node:assert/strict';
import { validateBankLedgerSync } from '../src/utils/bankLedgerSyncPolicy';

const bankAccounts: any[] = [{
  id: 'BANK-01', name: 'حساب جاري', bankName: 'بنك', openingBalance: 1000,
  openingDate: '2026-11-01', active: true,
}];

const voucher = (direction: 'deposit' | 'withdrawal') => ({
  id: 'TX-CB-V-001',
  txNumber: 'TX-CB-001',
  referenceId: 'V-001',
  date: '2026-11-17',
  type: direction === 'deposit' ? 'صرف' : 'قبض',
  category: direction === 'deposit' ? 'تحويل من الخزينة إلى البنك' : 'تحويل من البنك إلى الخزينة',
  amount: 250,
  paymentMethod: 'نقدي',
  bankAccountId: 'BANK-01',
});

const bankEntry = (direction: 'in' | 'out') => ({
  id: 'cash-bank:V-001',
  batchId: 'V-001',
  accountKind: 'bank' as const,
  bankAccountId: 'BANK-01',
  direction,
  amount: 250,
  date: '2026-11-17',
  reference: 'DEP-001',
  description: 'سند تحويل بين الخزينة والبنك',
});

for (const [kind, entryDirection] of [['deposit', 'in'], ['withdrawal', 'out']] as const) {
  assert.equal(validateBankLedgerSync({
    previous: [],
    incoming: [bankEntry(entryDirection)],
    bankAccounts,
    treasury: [voucher(kind)],
  }), null, kind + ' should sync when paired with its treasury voucher');
}

assert.equal(validateBankLedgerSync({
  previous: [],
  incoming: [bankEntry('out')],
  bankAccounts,
  treasury: [voucher('deposit')],
}), 'BANK_LEDGER_SOURCE_MISSING', 'mismatched voucher direction must be rejected');

assert.equal(validateBankLedgerSync({
  previous: [],
  incoming: [bankEntry('in')],
  bankAccounts: [{ ...bankAccounts[0], active: false }],
  treasury: [voucher('deposit')],
}), 'BANK_LEDGER_ACCOUNT_INVALID', 'inactive bank account must be rejected');

const original = bankEntry('in');
assert.equal(validateBankLedgerSync({
  previous: [original as any],
  incoming: [{ ...original, amount: 251 } as any],
  bankAccounts,
  treasury: [voucher('deposit')],
}), 'BANK_LEDGER_HISTORY_MODIFIED', 'existing bank ledger history is immutable');
