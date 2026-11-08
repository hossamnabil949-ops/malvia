import assert from 'node:assert/strict';
import { validateBankLedgerSync } from '../src/utils/bankLedgerSyncPolicy.js';
import { validatePartnerCurrentAccountSync } from '../src/utils/partnerCurrentAccount.js';
import {
  validateChequeCollectionSync,
  validateChequeAuditSync,
  validateExpenseOnlySync,
  validatePurchaseAuditSync,
} from '../src/utils/chequeSyncPolicy.js';

const bank = validateBankLedgerSync({
  previous: [],
  incoming: [{
    id: 'bank-entry-1', batchId: 'invoice-1', direction: 'in', amount: 100,
    date: '2026-11-08', reference: 'INV-1', description: 'POS payment',
    accountKind: 'bank', bankAccountId: 'missing-account',
  }] as any,
  bankAccounts: [],
}, true);
assert.equal(bank?.code, 'BANK_LEDGER_ACCOUNT_INVALID');
assert.deepEqual(bank?.recordIds, ['bank-entry-1']);
assert.deepEqual(bank?.relatedGroupIds, ['invoice-1', 'INV-1']);

const partner = validatePartnerCurrentAccountSync({
  previous: [],
  incoming: [{ id: 'partner-move-1' }] as any,
  partners: [], bankAccounts: [], treasury: [], bankLedgerEntries: [], openingBalances: [],
}, true);
assert.equal(partner?.code, 'PARTNER_CURRENT_ACCOUNT_ENTRY_INVALID');
assert.deepEqual(partner?.recordIds, ['partner-move-1']);

const cheque = validateChequeCollectionSync(
  [], [{ id: 'cheque-1' }], { name: 'Cashier' }, { canRegisterCheques: false }, true,
);
assert.equal(cheque?.code, 'CHEQUE_REGISTER_DENIED');
assert.deepEqual(cheque?.recordIds, ['cheque-1']);

const chequeAudit = validateChequeAuditSync({
  previous: [],
  incoming: [{ id: 'audit-cheque-1', userName: 'Other', entityId: 'cheque-1' }],
  previousCheques: [], incomingCheques: [], employee: { name: 'Cashier' },
}, true);
assert.equal(chequeAudit?.code, 'CHEQUE_AUDIT_ACTOR_MISMATCH');
assert.deepEqual(chequeAudit?.recordIds, ['audit-cheque-1']);

const expense = validateExpenseOnlySync({
  previousExpenses: [], incomingExpenses: [{ id: 'expense-1' }],
  previousTreasury: [], incomingTreasury: [], employee: { name: 'Accountant' },
}, true);
assert.equal(expense?.code, 'EXPENSE_TREASURY_MISMATCH');
assert.deepEqual(expense?.recordIds, ['expense-1']);

const purchaseAudit = validatePurchaseAuditSync({
  previousAudit: [],
  incomingAudit: [{ id: 'purchase-audit-1', action: 'invalid', userName: 'Receiver', entityId: 'purchase-1' }],
  previousInvoices: [], incomingInvoices: [], employee: { name: 'Receiver' },
}, true);
assert.equal(purchaseAudit?.code, 'PURCHASE_AUDIT_ACTION_INVALID');
assert.deepEqual(purchaseAudit?.recordIds, ['purchase-audit-1']);

console.log('Partial sync validator tests passed.');
