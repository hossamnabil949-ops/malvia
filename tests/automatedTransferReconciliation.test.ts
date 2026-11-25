import assert from 'node:assert/strict';
import {
  createDefaultChartOfAccounts, createJournalEntry, buildTrialBalanceRows,
  type AccountingPeriod, type JournalEntry, type LedgerAccount,
} from '../src/utils/accountingCore';
import { buildLiquidAccountTransferJournal, type SourceAccountMap } from '../src/utils/accountingSourceAdapters';

// Fully isolated in-memory fixture. It never connects to Neon, sync APIs, or production data.
const context = { tenantId: 'AUTOTEST-TENANT', branchId: 'AUTOTEST-BRANCH', currency: 'EGP' };
const period: AccountingPeriod = {
  ...context, id: 'AUTOTEST-PERIOD', name: 'Automated transfer test',
  startDate: '2026-11-01', endDate: '2026-11-30', status: 'open',
};
const accounts: LedgerAccount[] = createDefaultChartOfAccounts(context);
const cash = accounts.find(account => account.systemKey === 'cash')!;
const equity = accounts.find(account => account.systemKey === 'capital')!;
const bank: LedgerAccount = {
  ...context, id: 'AUTOTEST-BANK-01', code: '1011', name: 'حساب اختبار بنكي',
  type: 'asset', normalBalance: 'debit', systemKey: 'bank:AUTOTEST-BANK-01', active: true,
};
const wallet: LedgerAccount = {
  ...context, id: 'AUTOTEST-WALLET-01', code: '1023', name: 'محفظة اختبار',
  type: 'asset', normalBalance: 'debit', systemKey: 'wallet:AUTOTEST-WALLET-01', active: true,
};
accounts.push(bank, wallet);
const methods: Record<string, string> = {
  'نقدي': cash.id,
  'تحويل بنكي': bank.id,
  'محفظة إلكترونية - Vodafone Cash': wallet.id,
};
const sourceAccounts: SourceAccountMap = {
  sales: 'sales', outputVat: 'vat-output', receivables: 'receivables',
  costOfGoodsSold: 'cost-of-goods-sold', inventory: 'inventory',
  operatingExpenses: 'operating-expenses', partnerCurrentAccount: 'partner-current-account',
  inputVat: 'vat-input', payables: 'payables', supplierAdvances: 'supplier-advances',
  salesReturns: 'sales-returns', visaClearing: 'card-clearing', bankFees: 'bank-fees',
  chequesReceivable: 'cheques-receivable', chequesPayable: 'cheques-payable',
  settlementAccount: method => methods[method],
};
const entries: JournalEntry[] = [];
const post = (postingId: string, sourceType: string, lines: {accountId:string;debit:number;credit:number}[]) => {
  const result = createJournalEntry({
    ...context, postingId, source: { type: sourceType, id: postingId },
    date: '2026-11-25', periodId: period.id, memo: postingId, lines,
    createdAt: '2026-11-25T08:00:00.000Z', createdBy: 'AUTOMATED-TEST',
  }, accounts, [period], entries);
  assert.equal(result.error, null, 'journal should post: ' + postingId);
  entries.push(result.entry!);
  return result.entry!;
};
const balances = () => {
  const result = new Map<string, number>();
  for (const entry of entries) for (const line of entry.lines) {
    result.set(line.accountId, (result.get(line.accountId) || 0) + line.debit - line.credit);
  }
  return result;
};
const transfer = (id: string, sourceMethod: string, destinationMethod: string, amount: number) => {
  const adapted = buildLiquidAccountTransferJournal({
    id, date: '2026-11-25', amount, sourceMethod, destinationMethod, reference: 'AUTO-' + id,
  }, context, period.id, '2026-11-25T08:00:00.000Z', 'AUTOMATED-TEST', sourceAccounts);
  assert.equal(adapted.error, null, 'transfer adapter should map both accounts: ' + id);
  return post(id, 'finance.account-transfer', adapted.input!.lines);
};

// Opening balances: cash 20,000 + bank 50,000 + wallet 3,000 = 73,000.
post('AUTO-OPENING', 'opening.balance', [
  { accountId: cash.id, debit: 20000, credit: 0 },
  { accountId: bank.id, debit: 50000, credit: 0 },
  { accountId: wallet.id, debit: 3000, credit: 0 },
  { accountId: equity.id, debit: 0, credit: 73000 },
]);
assert.equal(balances().get(cash.id), 20000);
assert.equal(balances().get(bank.id), 50000);
assert.equal(balances().get(wallet.id), 3000);

// Cash -> bank 5,000; bank -> wallet 1,000; wallet -> cash 250.
transfer('AUTO-T1', 'نقدي', 'تحويل بنكي', 5000);
assert.equal(balances().get(cash.id), 15000);
assert.equal(balances().get(bank.id), 55000);
transfer('AUTO-T2', 'تحويل بنكي', 'محفظة إلكترونية - Vodafone Cash', 1000);
assert.equal(balances().get(bank.id), 54000);
assert.equal(balances().get(wallet.id), 4000);
transfer('AUTO-T3', 'محفظة إلكترونية - Vodafone Cash', 'نقدي', 250);
assert.equal(balances().get(wallet.id), 3750);
assert.equal(balances().get(cash.id), 15250);

// Transfer journals must never touch revenue or expense accounts.
assert.equal(entries.filter(entry => entry.source.type === 'finance.account-transfer').length, 3);
assert.ok(entries.filter(entry => entry.source.type === 'finance.account-transfer')
  .every(entry => entry.lines.every(line => !['revenue','expense'].includes(accounts.find(a => a.id === line.accountId)!.type))));

// Duplicate retry is rejected, without changing balances.
const duplicate = createJournalEntry({
  ...context, postingId: 'AUTO-T1', source: { type: 'finance.account-transfer', id: 'AUTO-T1' },
  date: '2026-11-25', periodId: period.id, memo: 'duplicate retry',
  lines: [{ accountId: bank.id, debit: 5000, credit: 0 }, { accountId: cash.id, debit: 0, credit: 5000 }],
  createdAt: '2026-11-25T08:01:00.000Z', createdBy: 'AUTOMATED-TEST',
}, accounts, [period], entries);
assert.equal(duplicate.error, 'DUPLICATE_POSTING');
assert.equal(entries.length, 4);
assert.equal(balances().get(cash.id), 15250);
assert.equal(balances().get(bank.id), 54000);
assert.equal(balances().get(wallet.id), 3750);

// Trial balance debit and credit totals must agree, and total assets remain 73,000.
const trialBalance = buildTrialBalanceRows(accounts, entries, '2026-11-01', '2026-11-30');
const debit = trialBalance.reduce((sum, row) => sum + row.closingDebit, 0);
const credit = trialBalance.reduce((sum, row) => sum + row.closingCredit, 0);
assert.equal(debit, credit);
assert.equal(balances().get(cash.id)! + balances().get(bank.id)! + balances().get(wallet.id)!, 73000);
console.log('Automated isolated treasury/bank/wallet transfer reconciliation passed:', {
  cash: balances().get(cash.id), bank: balances().get(bank.id), wallet: balances().get(wallet.id),
  totalLiquidAssets: 73000, journalCount: entries.length, trialBalanceDebit: debit, trialBalanceCredit: credit,
});
