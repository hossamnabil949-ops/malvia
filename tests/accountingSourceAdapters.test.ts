import assert from 'node:assert/strict';
import {
  buildExpenseJournal, buildPartnerCurrentAccountJournal, buildSalesInvoiceJournal,
  type SourceAccountMap,
} from '../src/utils/accountingSourceAdapters';

const accounts: SourceAccountMap = {
  sales: 'sales', outputVat: 'vat-output', receivables: 'receivables',
  costOfGoodsSold: 'cogs', inventory: 'inventory', operatingExpenses: 'expenses',
  partnerCurrentAccount: 'partner-current',
  settlementAccount: (method, bankId) => {
    if (method.includes('نقد') || method.includes('كاش')) return 'cash';
    if (method.includes('تحويل')) return bankId ? 'bank:' + bankId : undefined;
    if (method.includes('فيزا')) return 'card-clearing';
    return undefined;
  },
};
const context = { tenantId: 'tenant-1', branchId: 'branch-1', currency: 'EGP' };

const invoice: any = {
  id: 'INV-1', invoiceNumber: 'S-001', date: '2026-11-16',
  customerName: 'عميل', customerType: 'تجزئة', items: [{
    partId: 'part-1', partNumber: 'P-1', partName: 'قطعة', quantity: 2,
    unitPrice: 50, costPrice: 20, total: 100,
  }],
  subtotal: 100, tax: 13.5, discount: 10, grandTotal: 103.5,
  paymentMethod: 'نقدي', payments: [
    { method: 'نقدي', amount: 50 }, { method: 'آجل / حساب ورشة', amount: 53.5 },
  ],
  cashierName: 'Test',
};
const sale = buildSalesInvoiceJournal(invoice, context, 'period-1', '2026-11-16T10:00:00Z', 'tester', accounts);
assert.equal(sale.error, null);
assert.ok(sale.input);
assert.equal(sale.input?.source.type, 'sales.invoice');
assert.equal(sale.input?.lines.reduce((s, line) => s + line.debit, 0), 143.5);
assert.equal(sale.input?.lines.reduce((s, line) => s + line.credit, 0), 143.5);
assert.equal(sale.input?.lines.find(line => line.accountId === 'receivables')?.debit, 53.5);
assert.equal(sale.input?.lines.find(line => line.accountId === 'cogs')?.debit, 40);

assert.equal(buildSalesInvoiceJournal(
  { ...invoice, items: [{ ...invoice.items[0], costPrice: undefined }] },
  context, 'period-1', 'now', 'tester', accounts,
).error, 'COST_BASIS_MISSING');
assert.equal(buildSalesInvoiceJournal(
  { ...invoice, payments: [{ method: 'نقدي', amount: 20 }] },
  context, 'period-1', 'now', 'tester', accounts,
).error, 'PAYMENT_TOTAL_MISMATCH');
assert.equal(buildSalesInvoiceJournal(
  { ...invoice, status: 'ملغاة' },
  context, 'period-1', 'now', 'tester', accounts,
).error, 'INVOICE_CANCELLED');

const expense: any = {
  id: 'EXP-1', title: 'إيجار', category: 'إيجار المحل والمستودع',
  amount: 25, date: '2026-11-16', paymentMethod: 'نقدي', recordedBy: 'Test',
};
const expenseJournal = buildExpenseJournal(expense, context, 'period-1', 'now', 'tester', accounts);
assert.equal(expenseJournal.error, null);
assert.equal(expenseJournal.input?.lines[0].accountId, 'expenses');
assert.equal(expenseJournal.input?.lines[1].accountId, 'cash');

const partnerMovement: any = {
  id: 'PCA-1', partnerId: 'partner-1', partnerName: 'Partner',
  type: 'partner_deposit', amount: 70, date: '2026-11-16',
  paymentMethod: 'نقدي', treasuryTransactionId: 'TX-1',
  recordedBy: 'Test', createdAt: '2026-11-16T10:00:00.000Z',
};
const partnerJournal = buildPartnerCurrentAccountJournal(
  partnerMovement, context, 'period-1', 'now', 'tester', accounts,
);
assert.equal(partnerJournal.error, null);
assert.equal(partnerJournal.input?.lines[0].accountId, 'cash');
assert.equal(partnerJournal.input?.lines[0].debit, 70);
assert.equal(partnerJournal.input?.lines[1].accountId, 'partner-current');
assert.equal(partnerJournal.input?.lines[1].credit, 70);

const companyRepayment = buildPartnerCurrentAccountJournal(
  { ...partnerMovement, id: 'PCA-2', type: 'company_repayment' },
  context, 'period-1', 'now', 'tester', accounts,
);
assert.equal(companyRepayment.error, null);
assert.equal(companyRepayment.input?.lines[0].accountId, 'partner-current');
assert.equal(companyRepayment.input?.lines[0].debit, 70);
assert.equal(companyRepayment.input?.lines[1].accountId, 'cash');
assert.equal(companyRepayment.input?.lines[1].credit, 70);

console.log('Accounting source adapter tests passed');
