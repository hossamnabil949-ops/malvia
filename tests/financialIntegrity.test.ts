import assert from 'node:assert/strict';
import { generateSupplierScheduleDates } from '../src/utils/supplierPaymentSchedule.ts';
import { accountOf, isCreditMethod } from '../src/utils/treasuryAccounts.ts';
import { normalizePaymentMethod } from '../src/utils/paymentMethods.ts';
import { hasTabAccess, ROLE_PRESETS } from '../src/utils/permissions.ts';
import { registrationEffect, actionEffect } from '../src/utils/chequeLogic.ts';
import { refundForLine, computeVoidPlan } from '../src/utils/saleLogic.ts';
import { nextSalesInvoiceNumber } from '../src/utils/invoiceNumber.ts';
import { uniqueTransactionNumber } from '../src/utils/uniqueTransactionNumber.ts';
import { validateSale, SaleError, computeTotals, weightedAverageUnitCost } from '../src/utils/saleLogic.ts';
import { cairoDateKey, salesForDate, netSales, reportDailySales, reportSalesByItem, reportVatSummary, reportSalesReconciliation } from '../src/utils/reportsLogic.ts';

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
assert.equal(dailyReport.totals?.net, 630);
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
