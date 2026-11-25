import assert from 'node:assert/strict';
import { createDefaultChartOfAccounts, type AccountingPeriod, type JournalEntry } from '../src/utils/accountingCore';
import { prepareAccountingDocumentPosting } from '../src/utils/accountingDocumentPosting';

const context = { tenantId: 'tenant-test', branchId: 'MAIN', currency: 'EGP' };
const accounts = createDefaultChartOfAccounts(context);
const periods: AccountingPeriod[] = [{
  ...context, id: 'FY-2026', name: 'FY 2026', startDate: '2026-01-01',
  endDate: '2026-12-31', status: 'open',
}];
const invoice: any = {
  id: 'SALE-1', invoiceNumber: 'S-1', date: '2026-11-25', customerName: 'عميل',
  customerType: 'عميل تجزئة', items: [{ partId: 'P-1', partNumber: 'P-1', partName: 'Part',
    quantity: 2, unitPrice: 50, costPrice: 20, total: 100 }],
  subtotal: 100, discount: 0, tax: 0, grandTotal: 100, paymentMethod: 'نقدي',
  payments: [{ method: 'نقدي', amount: 100 }], cashierName: 'Tester',
};
const request: any = {
  kind: 'sales.invoice', document: invoice, context, accounts, periods,
  existingEntries: [], actor: 'Tester', createdAt: '2026-11-25T08:00:00.000Z',
};
const sale = prepareAccountingDocumentPosting(request);
assert.equal(sale.status, 'posted');
if (sale.status !== 'posted') throw new Error('sale was not posted');
assert.equal(sale.entry.source.type, 'sales.invoice');
assert.equal(sale.entry.lines.reduce((sum, line) => sum + line.debit, 0),
  sale.entry.lines.reduce((sum, line) => sum + line.credit, 0));
const retry = prepareAccountingDocumentPosting({ ...request, existingEntries: [sale.entry] });
assert.equal(retry.status, 'already-posted');
if (retry.status !== 'already-posted') throw new Error('retry was not idempotent');
assert.equal(retry.entry.id, sale.entry.id);

const purchase: any = {
  id: 'PUR-1', invoiceNumber: 'P-1', date: '2026-11-25', supplierId: 'SUP-1',
  supplierName: 'Supplier', items: [{ partNumber: 'P-1', partName: 'Part', category: 'General',
    quantity: 2, costPrice: 20, salePrice: 50, total: 40, taxAmount: 0 }],
  subtotal: 40, tax: 0, discount: 0, grandTotal: 40, paymentStatus: 'آجل',
  amountPaid: 0, paymentMethod: 'نقدي', receivedBy: 'Tester', receiptStatus: 'received', receivedAt: '2026-11-26T09:30:00.000Z',
};
const purchaseRequest: any = { ...request, kind: 'purchase.invoice', document: purchase };
const received = prepareAccountingDocumentPosting(purchaseRequest);
assert.equal(received.status, 'posted');
if (received.status !== 'posted') throw new Error('received purchase was not posted');
assert.equal(received.entry.date, '2026-11-26', 'purchase posting uses actual receipt date');
const pending = prepareAccountingDocumentPosting({
  ...purchaseRequest, document: { ...purchase, id: 'PUR-PENDING', receiptStatus: 'pending' }, periods: [],
});
assert.equal(pending.status, 'skipped');
if (pending.status !== 'skipped') throw new Error('pending purchase must not post');
assert.equal(pending.reason, 'PURCHASE_NOT_RECEIVED');
const cancelled = prepareAccountingDocumentPosting({
  ...purchaseRequest, document: { ...purchase, id: 'PUR-CANCELLED', receiptStatus: 'cancelled' }, periods: [],
});
assert.equal(cancelled.status, 'skipped');
if (cancelled.status !== 'skipped') throw new Error('cancelled purchase must not post');
assert.equal(cancelled.reason, 'DOCUMENT_CANCELLED');

const receipt: any = {
  id: 'RCPT-1', receiptNumber: 'RCPT-1', customerId: 'C-1', customerName: 'Customer',
  amount: 60, paymentDate: '2026-11-25', paymentMethod: 'نقدي',
  treasuryTarget: 'cash', recordedBy: 'Tester',
};
const receiptResult = prepareAccountingDocumentPosting({ ...request, kind: 'customer.receipt', document: receipt });
assert.equal(receiptResult.status, 'posted');
if (receiptResult.status !== 'posted') throw new Error('customer receipt was not posted');
assert.equal(receiptResult.entry.lines.find(line => line.accountId === accounts.find(a => a.systemKey === 'cash')?.id)?.debit, 60);

const supplierPayment: any = {
  id: 'SP-1', paymentNumber: 'SP-1', supplierId: 'SUP-1', supplierName: 'Supplier',
  amount: 100, payableApplied: 70, paymentDate: '2026-11-25', paymentMethod: 'نقدي',
  treasurySource: 'cash', recordedBy: 'Tester',
};
const supplierPaymentResult = prepareAccountingDocumentPosting({
  ...request, kind: 'supplier.payment', document: supplierPayment,
});
assert.equal(supplierPaymentResult.status, 'posted');
if (supplierPaymentResult.status !== 'posted') throw new Error('supplier payment was not posted');
assert.equal(supplierPaymentResult.entry.lines.find(line => line.accountId === accounts.find(a => a.systemKey === 'payables')?.id)?.debit, 70);
assert.equal(supplierPaymentResult.entry.lines.find(line => line.accountId === accounts.find(a => a.systemKey === 'supplier-advances')?.id)?.debit, 30);

const noPeriod = prepareAccountingDocumentPosting({ ...request, periods: [] });
assert.equal(noPeriod.status, 'failed');
if (noPeriod.status !== 'failed') throw new Error('missing period should fail closed');
assert.equal(noPeriod.error, 'ACCOUNTING_PERIOD_NOT_OPEN');

console.log('accountingDocumentPosting: all tests passed');
