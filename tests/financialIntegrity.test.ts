import { summarizeOpeningBalances, validateOpeningBalanceRecord, openingDifferenceLabel } from '../src/utils/openingBalanceLogic';
import assert from 'node:assert/strict';
import { generateSupplierScheduleDates } from '../src/utils/supplierPaymentSchedule.ts';
import { accountOf, isCreditMethod, summarizeTreasury } from '../src/utils/treasuryAccounts.ts';
import { normalizePaymentMethod } from '../src/utils/paymentMethods.ts';
import { hasTabAccess, ROLE_PRESETS } from '../src/utils/permissions.ts';
import { validateChequeCollectionSync, validateChequeAuxiliarySync, validateExpenseOnlySync, validatePurchaseAuditSync } from '../src/utils/chequeSyncPolicy.ts';
import { registrationEffect, actionEffect, availableActions } from '../src/utils/chequeLogic.ts';
import { refundForLine, computeVoidPlan } from '../src/utils/saleLogic.ts';
import { validateBankLedgerSync } from '../src/utils/bankLedgerSyncPolicy.ts';
import { createBankTransferEntries, createCardSettlementEntries, createChequeBankEntry, createChequeBankReversalEntry, summarizeBankAccount, validateBankAccount } from '../src/utils/bankLedger.ts';
import { nextSalesInvoiceNumber } from '../src/utils/invoiceNumber.ts';
import { uniqueTransactionNumber } from '../src/utils/uniqueTransactionNumber.ts';
import { validateSale, SaleError, computeTotals, weightedAverageUnitCost } from '../src/utils/saleLogic.ts';
import { cairoDateKey, salesForDate, netSales, reportDailySales, reportSalesByItem, reportProfitLoss, reportVatSummary, reportSalesReconciliation } from '../src/utils/reportsLogic.ts';
import { getPartnerCurrentAccountBalance, getOpenPartnerCurrentAccountOrigins, validatePartnerCurrentAccountSync } from '../src/utils/partnerCurrentAccount.ts';

// FIN-1 / AI-4: dashboard sales use Cairo's calendar day and one consistent eligible-invoice set.
const dashboardInvoices: any[] = [
  { id: 'today-a', date: '2026-11-01', status: 'مدفوعة', subtotal: 120, discount: 0, tax: 0, grandTotal: 120, returnedAmount: 20 },
  { id: 'today-b', date: '2026-11-01', status: 'آجلة', subtotal: 80, discount: 0, tax: 0, grandTotal: 80, returnedAmount: 0 },
  { id: 'today-void', date: '2026-11-01', status: 'ملغاة', subtotal: 900, discount: 0, tax: 0, grandTotal: 900, returnedAmount: 0 },
  { id: 'yesterday', date: '2026-10-31', status: 'مدفوعة', subtotal: 500, discount: 0, tax: 0, grandTotal: 500, returnedAmount: 0 },
];
const todaySummary = salesForDate(dashboardInvoices, '2026-11-01');
assert.equal(todaySummary.count, 2);
assert.equal(todaySummary.sales, 180);
assert.equal(todaySummary.average, 90);
assert.deepEqual(todaySummary.invoices.map(invoice => invoice.id), ['today-a', 'today-b']);
assert.equal(salesForDate(dashboardInvoices, '2026-11-02').count, 0);
assert.equal(salesForDate(dashboardInvoices, '2026-11-02').average, 0);
assert.equal(cairoDateKey(new Date('2026-10-31T22:30:00.000Z')), '2026-11-01');

// FIN-2 / FIN-6: report totals use the same discounted, pre-tax net-sales definition.
const reportInvoice: any = {
  id: 'report-1', invoiceNumber: 'INV-1', date: '2026-11-01', time: '10:15 ص',
  status: 'مسددة', customerName: 'Test', customerId: 'c-test', cashierName: 'Cashier', paymentMethod: 'نقدي', payments: [{ method: 'نقدي', amount: 1026 }],
  subtotal: 1000, discount: 100, tax: 126, grandTotal: 1026, returnedAmount: 307.8,
  items: [
    { partId: 'p1', partNumber: 'A', partName: 'Part A', quantity: 2, returnedQuantity: 1, unitPrice: 300, costPrice: 100, total: 600 },
    { partId: 'p2', partNumber: 'B', partName: 'Part B', quantity: 1, returnedQuantity: 0, unitPrice: 400, costPrice: 200, total: 400 },
  ],
};
assert.equal(netSales(reportInvoice), 630);
const reportInput: any = {
  invoices: [reportInvoice], salesReturns: [], purchaseInvoices: [], parts: [], customers: [],
  suppliers: [], expenses: [], treasury: [], cheques: [], batches: [], loyaltyLedger: [], loyaltyPointValue: 0,
};
const dailyReport = reportDailySales(reportInput, { from: '2026-11-01', to: '2026-11-01' });
assert.equal(dailyReport.totals?.total, 1000);
assert.equal(dailyReport.totals?.discount, 100);
assert.equal(dailyReport.totals?.tax, 88.2);
assert.equal(dailyReport.totals?.returns, 270);
assert.equal(dailyReport.totals?.net, 630);
const profitLoss = reportProfitLoss({ ...reportInput, taxRegistered: true }, { from: '2026-11-01', to: '2026-11-01' });
assert.equal(profitLoss.rows.find(row => row.item === 'صافي المبيعات قبل الضريبة')?.amount, 630);
assert.equal(profitLoss.rows.find(row => row.item === 'صافي الربح')?.amount, 330);
const itemReport = reportSalesByItem(reportInput, { from: '2026-11-01', to: '2026-11-01' });
assert.equal(itemReport.totals?.revenue, 630);
assert.equal(itemReport.totals?.cost, 300);
assert.equal(itemReport.totals?.profit, 330);
const reconciliation = reportSalesReconciliation(reportInput, { from: '2026-11-01', to: '2026-11-01' });
assert.ok(reconciliation.rows.every(row => Number(row.difference) === 0));

// FIN-13: input/output VAT report nets sales and purchase returns in their return period.
const vatInput: any = {
  ...reportInput,
  salesReturns: [{ id: 'sr1', invoiceId: 'report-1', date: '2026-11-01', totalRefundAmount: 307.8 }],
  purchaseInvoices: [{
    id: 'pur1', invoiceNumber: 'PUR-1', date: '2026-11-01', grandTotal: 570, tax: 70,
    subtotal: 500, discount: 0, items: [],
  }],
  purchaseReturns: [{
    id: 'pr1', purchaseInvoiceId: 'pur1', date: '2026-11-01', totalReturnAmount: 57,
  }],
};
const vatReport = reportVatSummary(vatInput, { from: '2026-11-01', to: '2026-11-01' });
assert.equal(vatReport.rows[2].amount, 88.2);
assert.equal(vatReport.rows[5].amount, 63);
assert.equal(vatReport.rows[6].amount, 25.2);

// FIN-13: tenant tax settings support inclusive and exclusive selling prices.
const exclusiveTax = computeTotals([{ partId: 'p1', qty: 1, unitPrice: 100, unitCost: 50 }], 0, 14, true, false);
assert.equal(exclusiveTax.tax, 1400);
assert.equal(exclusiveTax.grandTotal, 11400);
const inclusiveTax = computeTotals([{ partId: 'p1', qty: 1, unitPrice: 114, unitCost: 50 }], 0, 14, true, true);
assert.equal(inclusiveTax.tax, 1400);
assert.equal(inclusiveTax.grandTotal, 11400);

// FIN-15: an unset/zero credit limit is not unlimited; it uses the explicit default cap.
const creditLimitLines = [{ partId: 'p1', qty: 1, unitPrice: 100, unitCost: 50 }];
const creditLimitTotals = computeTotals(creditLimitLines, 0, 0, false);
assert.throws(
  () => validateSale(
    creditLimitLines,
    [{ id: 'p1', stockQuantity: 10 }],
    creditLimitTotals,
    [{ method: 'آجل', amount: 100 }],
    { allowBelowCost: false, customerId: 'c1', customerBalance: 5000, customerCreditLimit: 0 },
  ),
  (error: any) => error instanceof SaleError && error.code === 'CREDIT_LIMIT_EXCEEDED',
);

// FIN-14: monthly schedule must never begin before the configured start date.
assert.deepEqual(
  generateSupplierScheduleDates({ recurrence: 'monthly', startDate: '2026-11-20', installmentCount: 3, dayOfMonth: 5 }),
  ['2026-12-05', '2027-01-05', '2027-02-05'],
);

// FIN-8: checks/transfers belong to bank, cards to visa, and unknown methods fail closed.
assert.equal(accountOf('شيك (حساب بنكي)'), 'bank');
assert.equal(accountOf('تحويل بنكي'), 'bank');
assert.equal(accountOf('فيزا / بطاقة بنكية'), 'visa');
assert.equal(accountOf('كاش (نقدي)'), 'cash');
assert.throws(() => accountOf('cash-like unknown'), /غير معروفة/);
assert.throws(() => accountOf('آجل'), /ليست حركة خزنة/);
assert.equal(accountOf('نقدي'), 'cash');
assert.equal(accountOf('انستاباي / InstaPay'), 'instapay'); // legacy ambiguous label remains backward compatible
assert.equal(accountOf('InstaPay - حساب بنكي'), 'bank');
assert.equal(accountOf('InstaPay - محفظة'), 'wallet');
assert.equal(accountOf('محفظة إلكترونية'), 'wallet');
assert.equal(accountOf('فيزا / بطاقة'), 'visa');
assert.equal(accountOf('bank transfer'), 'bank');

assert.equal(accountOf('تحويل بنكي'), 'bank');
const visaSettlementSummary = summarizeTreasury([
  { id: 'v1', type: 'قبض', amount: 1000, paymentMethod: 'فيزا / بطاقة', date: '2026-11-04' },
  { id: 'v2', type: 'صرف', amount: 1000, paymentMethod: 'فيزا / بطاقة', date: '2026-11-04' },
  { id: 'b1', type: 'قبض', amount: 980, paymentMethod: 'تحويل بنكي', date: '2026-11-04' },
] as any);
assert.equal(visaSettlementSummary.accounts.find(a => a.key === 'visa')?.balance, 0);
assert.equal(visaSettlementSummary.accounts.find(a => a.key === 'bank')?.balance, 980);
assert.equal(visaSettlementSummary.total.balance, 980);

assert.equal(isCreditMethod('credit'), true);
assert.equal(normalizePaymentMethod('انستاباي / InstaPay'), 'إنستاباي / InstaPay');


// CASH-PERM-1: a cashier can view operational cash and register cheques without treasury/partner access.
const cashierPermissions = ROLE_PRESETS['كاشير مبيعات'];
assert.equal(cashierPermissions.canViewCashBalances, true);
assert.equal(cashierPermissions.canRegisterCheques, true);
assert.equal(cashierPermissions.canManageChequeLifecycle, false);
assert.equal(cashierPermissions.canManageTreasury, false);
assert.equal(hasTabAccess('كاشير مبيعات', cashierPermissions, 'shifts'), true);
assert.equal(hasTabAccess('كاشير مبيعات', cashierPermissions, 'cheques'), true);
assert.equal(hasTabAccess('كاشير مبيعات', cashierPermissions, 'finance'), false);

const expenseOnly = { canManageExpenses: true };
assert.equal(hasTabAccess('موظف', expenseOnly, 'finance'), true);
assert.equal(hasTabAccess('موظف', expenseOnly, 'cheques'), false);
assert.equal(hasTabAccess('موظف', expenseOnly, 'settings'), false);
const receivingOnly = { canReceivePurchases: true };
assert.equal(hasTabAccess('موظف', receivingOnly, 'purchases'), true);
assert.equal(hasTabAccess('موظف', receivingOnly, 'suppliers'), false);

const receivedPurchase = { id: 'PUR-REC-1', grandTotal: 500, invoiceNumber: 'PUR-001' };
const receivedPurchaseAudit = {
  id: 'AUD-PUR-1', action: 'purchase.create', entityId: receivedPurchase.id,
  amount: 500, userName: 'موظف استلام',
};
assert.equal(validatePurchaseAuditSync({
  previousAudit: [], incomingAudit: [receivedPurchaseAudit],
  previousInvoices: [], incomingInvoices: [receivedPurchase],
  employee: { name: 'موظف استلام' },
}), null);
assert.equal(validatePurchaseAuditSync({
  previousAudit: [], incomingAudit: [receivedPurchaseAudit],
  previousInvoices: [], incomingInvoices: [],
  employee: { name: 'موظف استلام' },
}), 'PURCHASE_AUDIT_REFERENCE_INVALID');


const expenseOnlyRecord = {
  id: 'exp-only-1', title: 'مصروف تشغيل', category: 'صيانة ونثريات وضيافة',
  amount: 125, date: '2026-11-04', paymentMethod: 'كاش (نقدي)', recordedBy: 'مسجل المصروف',
};
const expenseOnlyTx = {
  id: 'TX-EXP-1', referenceId: expenseOnlyRecord.id, type: 'صرف',
  category: 'مصروفات تشغيلية', amount: 125, date: '2026-11-04',
  paymentMethod: 'كاش (نقدي)', recordedBy: 'مسجل المصروف',
};
assert.equal(validateExpenseOnlySync({
  previousExpenses: [], incomingExpenses: [expenseOnlyRecord],
  previousTreasury: [], incomingTreasury: [expenseOnlyTx],
  employee: { name: 'مسجل المصروف' },
}), null);
assert.equal(validateExpenseOnlySync({
  previousExpenses: [], incomingExpenses: [expenseOnlyRecord],
  previousTreasury: [], incomingTreasury: [],
  employee: { name: 'مسجل المصروف' },
}), 'EXPENSE_TREASURY_MISMATCH');
assert.equal(validateExpenseOnlySync({
  previousExpenses: [expenseOnlyRecord], incomingExpenses: [],
  previousTreasury: [expenseOnlyTx], incomingTreasury: [expenseOnlyTx],
  employee: { name: 'مسجل المصروف' },
}), 'EXPENSE_ONLY_UPDATE_DENIED');



// FIN-9: incoming cheque excess remains as customer credit and is fully reversible on bounce.
const incoming = registrationEffect('incoming', 150, { balance: 100 });
assert.equal(incoming.effect.customerBalanceDelta, -150);
assert.equal(incoming.applied.appliedAmount, 150);
const cheque: any = {
  id: 'q1', number: '1', direction: 'incoming', status: 'في الحافظة', amount: 150,
  bankName: 'CIB', dueDate: '2026-12-01', receivedDate: '2026-11-01',
  partyType: 'customer', partyId: 'c1', partyName: 'عميل', createdBy: 'test',
  createdAt: '2026-11-01T00:00:00.000Z', ...incoming.applied, history: [],
};
assert.equal(actionEffect(cheque, 'bounce').customerBalanceDelta, 150);
assert.equal(actionEffect(cheque, 'clear').treasury?.amount, 150);

// FIN-16: voiding an invoice subtracts refunds from the account that actually paid them.
const voidAfterCashReturn = computeVoidPlan({
  grandTotal: 100,
  returnedAmount: 20,
  items: [{ partId: 'p1', partNumber: 'A', quantity: 2, returnedQuantity: 1 }],
  payments: [
    { method: 'نقدي', amount: 50 },
    { method: 'فيزا', amount: 50 },
  ],
  priorRefunds: [{ refundMethod: 'نقدي (خصم من الخزنة)', totalRefundAmount: 20 }],
});
assert.deepEqual(voidAfterCashReturn.refunds, [
  { method: 'نقدي', amount: 30 },
  { method: 'فيزا', amount: 50 },
]);
const voidCashRefundAboveOriginalCash = computeVoidPlan({
  grandTotal: 100,
  returnedAmount: 20,
  items: [{ partId: 'p1', partNumber: 'A', quantity: 2, returnedQuantity: 1 }],
  payments: [{ method: 'نقدي', amount: 10 }, { method: 'فيزا', amount: 90 }],
  priorRefunds: [{ refundMethod: 'نقدي (خصم من الخزنة)', totalRefundAmount: 20 }],
});
assert.deepEqual(voidCashRefundAboveOriginalCash.refunds, [{ method: 'فيزا', amount: 80 }]);

// FIN-17: final partial return takes the exact remaining cents.
assert.equal(refundForLine(100.01, 3, 1, 0), 33.34);
assert.equal(refundForLine(100.01, 3, 1, 1), 33.33);
assert.equal(refundForLine(100.01, 3, 1, 2), 33.34);
assert.equal(
  refundForLine(100.01, 3, 1, 0) + refundForLine(100.01, 3, 1, 1) + refundForLine(100.01, 3, 1, 2),
  100.01,
);

// FIN-11/12: identifiers remain distinct across independent offline devices.
const fixedDate = new Date(2026, 10, 1);
const deviceA = nextSalesInvoiceNumber([], fixedDate, 'A1B2C3');
const deviceB = nextSalesInvoiceNumber([], fixedDate, 'D4E5F6');
assert.equal(deviceA, 'INV-2026-A1B2C3-0001');
assert.equal(deviceB, 'INV-2026-D4E5F6-0001');
assert.equal(nextSalesInvoiceNumber([{ invoiceNumber: deviceA }], fixedDate, 'A1B2C3'), 'INV-2026-A1B2C3-0002');
assert.notEqual(deviceA, deviceB);
const tx1 = uniqueTransactionNumber('TX', fixedDate);
const tx2 = uniqueTransactionNumber('TX', fixedDate);
assert.match(tx1, /^TX-20261101-/);
assert.notEqual(tx1, tx2);

console.log('financial integrity regression tests passed');


// Inventory: adding an existing SKU must use weighted-average cost and the newly entered sale price.
assert.equal(weightedAverageUnitCost(10, 100, 5, 160), 120);
assert.equal(weightedAverageUnitCost(0, 100, 5, 160), 160);
assert.equal(weightedAverageUnitCost(10, 100.01, 1, 100.02), 100.01);
assert.equal(weightedAverageUnitCost(0, 0, 0, 125.55), 125.55);
assert.throws(() => weightedAverageUnitCost(-1, 100, 1, 120), /INVALID_INVENTORY_COST_INPUT/);


// BANK-LEDGER-1: Visa settlements must clear gross receivables, credit only net cash to
// the selected bank, and record the processor fee exactly once.
const bankA = {
  id: 'bank-cib-001', name: 'الحساب الجاري', bankName: 'CIB',
  accountLast4: '1234', openingBalance: 1000, openingDate: '2026-01-01', active: true,
};
assert.equal(validateBankAccount(bankA, []), null);
assert.equal(validateBankAccount(bankA, [bankA]), 'BANK_ACCOUNT_DUPLICATE');
assert.equal(validateBankAccount({ ...bankA, openingDate: '2026-02-31' }), 'BANK_ACCOUNT_INVALID');
const bankB = { id: 'bank-nbe-002', name: 'حساب التوفير', bankName: 'NBE', openingBalance: 500, openingDate: '2026-01-01', active: true };
const bankTransfer = createBankTransferEntries({
  id: 'BANK-TRF-TEST-01', sourceBankAccountId: bankA.id, destinationBankAccountId: bankB.id,
  amount: 250, date: '2026-11-04', reference: 'TRF-778',
}, [bankA, bankB]);
assert.equal(bankTransfer.error, null);
assert.equal(bankTransfer.entries.length, 2);
assert.deepEqual(bankTransfer.entries.map(entry => [entry.bankAccountId, entry.direction, entry.amount]), [
  [bankA.id, 'out', 250], [bankB.id, 'in', 250],
]);
assert.equal(summarizeBankAccount(bankA, bankTransfer.entries), 750);
assert.equal(summarizeBankAccount(bankB, bankTransfer.entries), 750);
assert.equal(validateBankLedgerSync({
  previous: [], incoming: bankTransfer.entries, bankAccounts: [bankA, bankB],
}), null);
assert.equal(validateBankLedgerSync({
  previous: [bankTransfer.entries[0]], incoming: [bankTransfer.entries[0]], bankAccounts: [bankA, bankB],
}), null);
assert.equal(validateBankLedgerSync({
  previous: [bankTransfer.entries[0]], incoming: [], bankAccounts: [bankA, bankB],
}), 'BANK_LEDGER_HISTORY_MODIFIED');

assert.equal(createBankTransferEntries({
  id: 'BANK-TRF-TEST-01', sourceBankAccountId: bankA.id, destinationBankAccountId: bankB.id,
  amount: 250, date: '2026-11-04', reference: 'TRF-778',
}, [bankA, bankB], bankTransfer.entries).error, 'BANK_TRANSFER_DUPLICATE');
assert.equal(createBankTransferEntries({
  id: 'BANK-TRF-TEST-02', sourceBankAccountId: bankA.id, destinationBankAccountId: bankA.id,
  amount: 250, date: '2026-11-04', reference: 'TRF-779',
}, [bankA, bankB]).error, 'BANK_TRANSFER_SAME_ACCOUNT');

const settlement = {
  id: 'visa-settle-001', processor: 'البنك التجاري',
  grossAmount: 1000, feeAmount: 20, netAmount: 980,
  settlementDate: '2026-11-04', bankAccountId: bankA.id, reference: 'BATCH-7788',
};
const settlementResult = createCardSettlementEntries(settlement, [bankA], []);
assert.equal(settlementResult.error, null);
assert.equal(settlementResult.entries.length, 3);
assert.deepEqual(
  settlementResult.entries.map(entry => [entry.accountKind, entry.direction, entry.amount]),
  [
    ['visa-clearing', 'out', 1000],
    ['bank', 'in', 980],
    ['bank-fees', 'out', 20],
  ],
);
assert.equal(summarizeBankAccount(bankA, settlementResult.entries), 1980);
assert.equal(createCardSettlementEntries(settlement, [bankA], [settlement]).error, 'SETTLEMENT_DUPLICATE');
assert.equal(createCardSettlementEntries({ ...settlement, feeAmount: 1000, netAmount: 0 }, [bankA]).error, 'SETTLEMENT_FEE_INVALID');

const incomingChequePosting = createChequeBankEntry({
  chequeId: 'CHQ-IN-001', bankAccountId: bankA.id, direction: 'incoming',
  amount: 250, date: '2026-11-04', reference: 'CHK-001', description: 'تحصيل شيك وارد',
}, [bankA], settlementResult.entries);
assert.equal(incomingChequePosting.error, null);
assert.equal(incomingChequePosting.entry?.direction, 'in');
assert.equal(incomingChequePosting.entry?.bankAccountId, bankA.id);
assert.equal(createChequeBankEntry({
  chequeId: 'CHQ-IN-001', bankAccountId: bankA.id, direction: 'incoming',
  amount: 250, date: '2026-11-04', reference: 'CHK-001', description: 'تحصيل شيك وارد',
}, [bankA], [incomingChequePosting.entry!, ...settlementResult.entries]).error, 'CHEQUE_BANK_DUPLICATE');
const outgoingChequePosting = createChequeBankEntry({
  chequeId: 'CHQ-OUT-001', bankAccountId: bankA.id, direction: 'outgoing',
  amount: 125, date: '2026-11-04', reference: 'CHK-002', description: 'صرف شيك صادر',
}, [bankA]);
assert.equal(outgoingChequePosting.entry?.direction, 'out');

const chequeBounceReversal = createChequeBankReversalEntry({
  chequeId: 'CHQ-IN-001', date: '2026-11-05', reference: 'CHK-001',
  description: 'عكس شيك مرتد',
}, [incomingChequePosting.entry!]);
assert.equal(chequeBounceReversal.error, null);
assert.equal(chequeBounceReversal.entry?.direction, 'out');
assert.equal(createChequeBankReversalEntry({
  chequeId: 'CHQ-IN-001', date: '2026-11-05', reference: 'CHK-001',
  description: 'عكس شيك مرتد',
}, [incomingChequePosting.entry!, chequeBounceReversal.entry!]).error, 'CHEQUE_BANK_DUPLICATE');
assert.equal(summarizeBankAccount(bankA, [incomingChequePosting.entry!, chequeBounceReversal.entry!]), 1000);
assert.deepEqual(availableActions({ direction: 'incoming', status: 'محصّل' }), ['bounce']);
assert.deepEqual(availableActions({ direction: 'outgoing', status: 'مصروف' }), ['bounce']);
const chequeEffectFixture = {
  id: 'CHQ-EFFECT', number: '9003', direction: 'incoming' as const, status: 'محصّل' as const,
  amount: 250, bankName: 'CIB', dueDate: '2026-11-10', receivedDate: '2026-11-04',
  partyType: 'customer' as const, partyId: 'C-1', partyName: 'عميل', createdBy: 'مسؤول شيكات',
  createdAt: '2026-11-04T10:00:00.000Z', appliedAmount: 250, history: [],
};
const clearedIncomingEffect = actionEffect(chequeEffectFixture, 'bounce');
assert.equal(clearedIncomingEffect.customerBalanceDelta, 250);
assert.equal(clearedIncomingEffect.treasury?.type, 'صرف');
assert.equal(clearedIncomingEffect.treasury?.category, 'ارتداد شيك وارد');
const clearedOutgoingEffect = actionEffect({
  ...chequeEffectFixture, direction: 'outgoing' as const, status: 'مصروف' as const, appliedDebt: 200, appliedCredit: 50,
}, 'bounce');
assert.equal(clearedOutgoingEffect.treasury?.type, 'قبض');
assert.equal(clearedOutgoingEffect.treasury?.category, 'ارتداد شيك صادر');

assert.equal(summarizeBankAccount(bankA, [incomingChequePosting.entry!, outgoingChequePosting.entry!]), 1125);

assert.equal(createCardSettlementEntries({ ...settlement, netAmount: 1000 }, [bankA]).error, 'SETTLEMENT_AMOUNT_INVALID');
assert.equal(createCardSettlementEntries({ ...settlement, settlementDate: '2026-02-31' }, [bankA]).error, 'SETTLEMENT_DATE_INVALID');
assert.equal(createCardSettlementEntries(settlement, [{ ...bankA, active: false }]).error, 'BANK_ACCOUNT_INACTIVE');


// CHEQUE-SYNC-SECURITY: registration is append-only; lifecycle changes require the separate permission.
const remoteCheque = {
  id: 'CHQ-SYNC-01', number: '9001', direction: 'incoming', status: 'في الحافظة',
  amount: 250, bankName: 'CIB', dueDate: '2026-11-10', receivedDate: '2026-11-04',
  partyType: 'customer', partyId: 'C-1', partyName: 'عميل', createdBy: 'كاشير',
  createdAt: '2026-11-04T10:00:00.000Z', appliedAmount: 250,
  history: [{ at: '2026-11-04T10:00:00.000Z', status: 'في الحافظة', by: 'كاشير' }],
};
const newCheque = { ...remoteCheque, id: 'CHQ-SYNC-02', number: '9002' };
assert.equal(validateChequeCollectionSync([], [newCheque], { name: 'كاشير' }, { canRegisterCheques: true }), null);
assert.equal(validateChequeCollectionSync([remoteCheque], [{ ...remoteCheque, status: 'محصّل' }], { name: 'كاشير' }, { canRegisterCheques: true }), 'CHEQUE_LIFECYCLE_DENIED');
const clearedCheque = {
  ...remoteCheque, status: 'محصّل', clearedBankAccountId: bankA.id,
  history: [...remoteCheque.history, { at: '2026-11-04T11:00:00.000Z', status: 'محصّل', by: 'مسؤول شيكات' }],
};
assert.equal(validateChequeCollectionSync([remoteCheque], [clearedCheque], { name: 'مسؤول شيكات' }, { canManageChequeLifecycle: true }), null);

const bouncedCheque = {
  ...clearedCheque, status: 'مرتد',
  history: [...clearedCheque.history, { at: '2026-11-05T11:00:00.000Z', status: 'مرتد', by: 'مسؤول شيكات' }],
};
assert.equal(validateChequeCollectionSync([clearedCheque], [bouncedCheque], { name: 'مسؤول شيكات' }, { canManageChequeLifecycle: true }), null);



assert.equal(validateChequeCollectionSync([], [newCheque], { name: 'مسؤول شيكات' }, { canManageChequeLifecycle: true }), 'CHEQUE_REGISTER_DENIED');
const chequeTreasuryTx = {
  id: 'TX-CHQ-TEST', referenceId: remoteCheque.id, type: 'قبض',
  category: 'تحصيل من عميل / ورشة', paymentMethod: 'شيك (حساب بنكي)',
  amount: 250, recordedBy: 'مسؤول شيكات',
};
assert.equal(validateChequeAuxiliarySync({
  resource: 'treasury', previous: [], incoming: [chequeTreasuryTx],
  previousCheques: [remoteCheque], incomingCheques: [clearedCheque], bankAccounts: [],
  employee: { name: 'مسؤول شيكات' },
}), null);
const chequeBankEntry = {
  id: 'cheque:' + remoteCheque.id, batchId: remoteCheque.id, accountKind: 'bank',
  bankAccountId: bankA.id, direction: 'in', amount: 250, date: '2026-11-04',
  reference: remoteCheque.number, description: 'تحصيل شيك وارد',
};
assert.equal(validateChequeAuxiliarySync({
  resource: 'bankLedgerEntries', previous: [], incoming: [chequeBankEntry],
  previousCheques: [remoteCheque], incomingCheques: [clearedCheque], bankAccounts: [bankA],
  employee: { name: 'مسؤول شيكات' },
}), null);
assert.equal(validateChequeAuxiliarySync({
  resource: 'bankLedgerEntries', previous: [], incoming: [{ ...chequeBankEntry, amount: 251 }],
  previousCheques: [remoteCheque], incomingCheques: [clearedCheque], bankAccounts: [bankA],
  employee: { name: 'مسؤول شيكات' },
}), 'CHEQUE_BANK_ENTRY_INVALID');
const bouncedTreasuryTx = {
  id: 'TX-CHQ-BOUNCE-TEST', referenceId: remoteCheque.id, type: 'صرف',
  category: 'ارتداد شيك وارد', paymentMethod: 'شيك (حساب بنكي)',
  amount: 250, recordedBy: 'مسؤول شيكات',
};
assert.equal(validateChequeAuxiliarySync({
  resource: 'treasury', previous: [chequeTreasuryTx], incoming: [chequeTreasuryTx, bouncedTreasuryTx],
  previousCheques: [clearedCheque], incomingCheques: [bouncedCheque], bankAccounts: [],
  employee: { name: 'مسؤول شيكات' },
}), null);
const bouncedBankEntry = {
  id: 'cheque-bounce:' + remoteCheque.id, batchId: remoteCheque.id, accountKind: 'bank',
  bankAccountId: bankA.id, direction: 'out', amount: 250, date: '2026-11-05',
  reference: remoteCheque.number, description: 'عكس شيك مرتد',
};
assert.equal(validateChequeAuxiliarySync({
  resource: 'bankLedgerEntries', previous: [chequeBankEntry], incoming: [chequeBankEntry, bouncedBankEntry],
  previousCheques: [clearedCheque], incomingCheques: [bouncedCheque], bankAccounts: [bankA],
  employee: { name: 'مسؤول شيكات' },
}), null);



const openingFixture = {
  id: 'OPEN-TEST', status: 'approved' as const, cutoverDate: '2026-11-04', originalCapital: 500000,
  partners: [{ partnerId: 'P1', partnerName: 'شريك 1', originalContribution: 300000, ownershipPercentage: 60 }, { partnerId: 'P2', partnerName: 'شريك 2', originalContribution: 200000, ownershipPercentage: 40 }],
  lines: [
    { id: 'L1', category: 'inventory' as const, label: 'مخزون', amount: 300000, partId: 'PART-1', quantity: 100, unitCost: 3000 },
    { id: 'L2', category: 'cash' as const, label: 'خزينة', amount: 25000 },
    { id: 'L3', category: 'bank' as const, label: 'بنك', amount: 75000, bankAccountId: 'BANK-1' },
    { id: 'L4', category: 'fixed_asset' as const, label: 'معدات', amount: 100000 },
    { id: 'L5', category: 'supplier_payable' as const, label: 'موردون', amount: 50000 },
  ],
  createdAt: '2026-11-04T10:00:00.000Z', createdBy: 'Owner',
};
const openingSummary = summarizeOpeningBalances(openingFixture);
assert.equal(openingSummary.assets, 500000);
assert.equal(openingSummary.liabilities, 50000);
assert.equal(openingSummary.netAssets, 450000);
assert.equal(openingSummary.partnerCapital, 500000);
assert.equal(openingSummary.reconciliationDifference, -50000);
assert.equal(openingDifferenceLabel(-50000), 'opening_deficit');
assert.equal(validateOpeningBalanceRecord(openingFixture, { activeBankAccountIds: ['BANK-1'] }), null);
assert.equal(validateOpeningBalanceRecord({ ...openingFixture, lines: [...openingFixture.lines, { ...openingFixture.lines[0], id: 'L6', amount: -1 }] }, { activeBankAccountIds: ['BANK-1'] }), 'INVALID_LINE');
assert.equal(validateOpeningBalanceRecord(openingFixture, { activeBankAccountIds: [] }), 'BANK_ACCOUNT_REQUIRED');
assert.equal(validateOpeningBalanceRecord({ ...openingFixture, partners: [{ ...openingFixture.partners[0], ownershipPercentage: 50 }] }, { activeBankAccountIds: ['BANK-1'] }), 'INVALID_SHARE_TOTAL');
assert.equal(validateOpeningBalanceRecord(openingFixture, { activeBankAccountIds: ['BANK-1'], existingRecord: openingFixture }), 'APPROVED_RECORD_IMMUTABLE');


// PARTNER-CURRENT-ACCOUNT: opening balances, four movement directions, source-channel matching and append-only protection.
const currentAccountOpening: any = {
  id: 'OB-PCA-1', status: 'approved', cutoverDate: '2026-11-01', originalCapital: 1000,
  partners: [
    { partnerId: 'pca-partner', partnerName: 'Partner A', originalContribution: 1000, ownershipPercentage: 100, currentAccountBalance: 200 },
  ],
  lines: [{ id: 'OB-PCA-CASH', category: 'cash', label: 'Cash', amount: 1200 }],
  createdAt: '2026-11-01T00:00:00.000Z', createdBy: 'Test', approvedAt: '2026-11-01T00:00:00.000Z', approvedBy: 'Test',
};
const currentAccountOpeningSummary = summarizeOpeningBalances(currentAccountOpening);
assert.equal(currentAccountOpeningSummary.partnerCurrentAccountPayable, 200);
assert.equal(currentAccountOpeningSummary.partnerCurrentAccountReceivable, 0);
assert.equal(currentAccountOpeningSummary.assets, 1200);
assert.equal(currentAccountOpeningSummary.liabilities, 200);
assert.equal(currentAccountOpeningSummary.netAssets, 1000);
assert.equal(currentAccountOpeningSummary.reconciliationDifference, 0);
assert.equal(getPartnerCurrentAccountBalance('pca-partner', [], [currentAccountOpening]), 200);

const pcaOpeningDebit: any = {
  ...currentAccountOpening,
  id: 'OB-PCA-DEBIT',
  partners: [{ partnerId: 'pca-partner', partnerName: 'Partner A', originalContribution: 1000, ownershipPercentage: 100, currentAccountBalance: -500 }],
};
assert.equal(getPartnerCurrentAccountBalance('pca-partner', [], [pcaOpeningDebit]), -500);
assert.equal(getOpenPartnerCurrentAccountOrigins('pca-partner', 'partner_repayment', [], [pcaOpeningDebit])[0].remainingAmount, 500);

const pcaRepayment: any = {
  id: 'PCA-REPAY-1', partnerId: 'pca-partner', partnerName: 'Partner A',
  type: 'partner_repayment', amount: 200, date: '2026-11-04', paymentMethod: 'نقدي',
  relatedTransactionId: 'OPENING:pca-partner', treasuryTransactionId: 'TX-PCA-REPAY-1',
  recordedBy: 'Test', createdAt: '2026-11-04T12:00:00.000Z',
};
const pcaRepaymentTreasury: any = {
  id: 'TX-PCA-REPAY-1', referenceId: 'PCA-REPAY-1', type: 'قبض',
  category: 'جاري شركاء - رد الشريك للمبلغ المسحوب', amount: 200,
  date: '2026-11-04', paymentMethod: 'نقدي',
};
const pcaSyncInput: any = {
  previous: [], incoming: [pcaRepayment], partners: [{ id: 'pca-partner', name: 'Partner A' }],
  bankAccounts: [], treasury: [pcaRepaymentTreasury], bankLedgerEntries: [],
  openingBalances: [pcaOpeningDebit],
};
assert.equal(validatePartnerCurrentAccountSync(pcaSyncInput), null);
assert.equal(getPartnerCurrentAccountBalance('pca-partner', [pcaRepayment], [pcaOpeningDebit]), -300);
assert.equal(getOpenPartnerCurrentAccountOrigins('pca-partner', 'partner_repayment', [pcaRepayment], [pcaOpeningDebit])[0].remainingAmount, 300);

const pcaOverpayment: any = {
  ...pcaRepayment, id: 'PCA-REPAY-OVER', amount: 600, treasuryTransactionId: 'TX-PCA-REPAY-OVER',
};
assert.equal(validatePartnerCurrentAccountSync({
  ...pcaSyncInput,
  incoming: [pcaOverpayment],
  treasury: [{ ...pcaRepaymentTreasury, id: 'TX-PCA-REPAY-OVER', referenceId: 'PCA-REPAY-OVER', amount: 600 }],
}), 'PARTNER_CURRENT_ACCOUNT_OVERPAID');
assert.equal(validatePartnerCurrentAccountSync({
  ...pcaSyncInput,
  treasury: [],
}), 'PARTNER_CURRENT_ACCOUNT_TREASURY_MISMATCH');
assert.equal(validatePartnerCurrentAccountSync({
  ...pcaSyncInput,
  previous: [pcaRepayment],
  incoming: [],
}), 'PARTNER_CURRENT_ACCOUNT_HISTORY_MODIFIED');

const pcaBankDeposit: any = {
  id: 'PCA-BANK-1', partnerId: 'pca-partner', partnerName: 'Partner A',
  type: 'partner_deposit', amount: 300, date: '2026-11-04', paymentMethod: 'تحويل بنكي',
  bankAccountId: 'bank-pca-1', treasuryTransactionId: 'TX-PCA-BANK-1',
  recordedBy: 'Test', createdAt: '2026-11-04T13:00:00.000Z',
};
const pcaBankTreasury: any = {
  id: 'TX-PCA-BANK-1', referenceId: 'PCA-BANK-1', type: 'قبض',
  category: 'جاري شركاء - إيداع من شريك', amount: 300, date: '2026-11-04',
  paymentMethod: 'تحويل بنكي', bankAccountId: 'bank-pca-1',
};
const pcaBankEntry: any = {
  id: 'partner-current-account:PCA-BANK-1', batchId: 'PCA-BANK-1', accountKind: 'bank',
  bankAccountId: 'bank-pca-1', direction: 'in', amount: 300, date: '2026-11-04',
  reference: 'PCA-BANK-1', description: 'جاري الشركاء — Partner A',
};
const pcaBankInput: any = {
  previous: [], incoming: [pcaBankDeposit], partners: [{ id: 'pca-partner', name: 'Partner A' }],
  bankAccounts: [{ id: 'bank-pca-1', active: true }], treasury: [pcaBankTreasury],
  bankLedgerEntries: [pcaBankEntry], openingBalances: [],
};
assert.equal(validatePartnerCurrentAccountSync(pcaBankInput), null);
assert.equal(validatePartnerCurrentAccountSync({ ...pcaBankInput, bankLedgerEntries: [] }), 'PARTNER_CURRENT_ACCOUNT_BANK_MISMATCH');



const pcaOpeningCredit: any = {
  ...currentAccountOpening,
  id: 'OB-PCA-CREDIT',
  partners: [{ partnerId: 'pca-partner', partnerName: 'Partner A', originalContribution: 1000, ownershipPercentage: 100, currentAccountBalance: 400 }],
};
const pcaCompanyRepayment: any = {
  id: 'PCA-COMPANY-REPAY-1', partnerId: 'pca-partner', partnerName: 'Partner A',
  type: 'company_repayment', amount: 150, date: '2026-11-04', paymentMethod: 'نقدي',
  relatedTransactionId: 'OPENING:pca-partner', treasuryTransactionId: 'TX-PCA-COMPANY-REPAY-1',
  recordedBy: 'Test', createdAt: '2026-11-04T14:00:00.000Z',
};
const pcaCompanyRepaymentTreasury: any = {
  id: 'TX-PCA-COMPANY-REPAY-1', referenceId: 'PCA-COMPANY-REPAY-1', type: 'صرف',
  category: 'جاري شركاء - سداد المنشأة للشريك', amount: 150,
  date: '2026-11-04', paymentMethod: 'نقدي',
};
assert.equal(validatePartnerCurrentAccountSync({
  previous: [], incoming: [pcaCompanyRepayment], partners: [{ id: 'pca-partner', name: 'Partner A' }],
  bankAccounts: [], treasury: [pcaCompanyRepaymentTreasury], bankLedgerEntries: [],
  openingBalances: [pcaOpeningCredit],
}), null);
assert.equal(getPartnerCurrentAccountBalance('pca-partner', [pcaCompanyRepayment], [pcaOpeningCredit]), 250);
assert.equal(getOpenPartnerCurrentAccountOrigins('pca-partner', 'company_repayment', [pcaCompanyRepayment], [pcaOpeningCredit])[0].remainingAmount, 250);

const pcaPartnerDeposit: any = {
  id: 'PCA-DEPOSIT-1', partnerId: 'pca-partner', partnerName: 'Partner A',
  type: 'partner_deposit', amount: 350, date: '2026-11-04', paymentMethod: 'محفظة إلكترونية',
  treasuryTransactionId: 'TX-PCA-DEPOSIT-1', recordedBy: 'Test', createdAt: '2026-11-04T15:00:00.000Z',
};
const pcaPartnerDepositTreasury: any = {
  id: 'TX-PCA-DEPOSIT-1', referenceId: 'PCA-DEPOSIT-1', type: 'قبض',
  category: 'جاري شركاء - إيداع من شريك', amount: 350,
  date: '2026-11-04', paymentMethod: 'محفظة إلكترونية',
};
assert.equal(validatePartnerCurrentAccountSync({
  previous: [], incoming: [pcaPartnerDeposit], partners: [{ id: 'pca-partner', name: 'Partner A' }],
  bankAccounts: [], treasury: [pcaPartnerDepositTreasury], bankLedgerEntries: [], openingBalances: [],
}), null);
assert.equal(getPartnerCurrentAccountBalance('pca-partner', [pcaPartnerDeposit], []), 350);

const pcaPartnerWithdrawal: any = {
  id: 'PCA-WITHDRAW-1', partnerId: 'pca-partner', partnerName: 'Partner A',
  type: 'partner_withdrawal', amount: 120, date: '2026-11-04', paymentMethod: 'نقدي',
  treasuryTransactionId: 'TX-PCA-WITHDRAW-1', recordedBy: 'Test', createdAt: '2026-11-04T16:00:00.000Z',
};
const pcaPartnerWithdrawalTreasury: any = {
  id: 'TX-PCA-WITHDRAW-1', referenceId: 'PCA-WITHDRAW-1', type: 'صرف',
  category: 'جاري شركاء - سحب شريك', amount: 120,
  date: '2026-11-04', paymentMethod: 'نقدي',
};
assert.equal(validatePartnerCurrentAccountSync({
  previous: [], incoming: [pcaPartnerWithdrawal], partners: [{ id: 'pca-partner', name: 'Partner A' }],
  bankAccounts: [], treasury: [pcaPartnerWithdrawalTreasury], bankLedgerEntries: [], openingBalances: [],
}), null);
assert.equal(getPartnerCurrentAccountBalance('pca-partner', [pcaPartnerDeposit, pcaPartnerWithdrawal], []), 230);
