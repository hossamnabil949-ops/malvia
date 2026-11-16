import assert from 'node:assert/strict';
import {
  buildBankTransferJournal, buildCustomerReceiptJournal, buildExpenseJournal,
  buildSalesReturnJournal,
  buildPartnerCurrentAccountJournal, buildPurchaseInvoiceJournal, buildPurchaseReturnJournal,
  buildSalesInvoiceJournal,
  buildSupplierPaymentJournal,
  type SourceAccountMap,
} from '../src/utils/accountingSourceAdapters';

const accounts: SourceAccountMap = {
  sales: 'sales', outputVat: 'vat-output', receivables: 'receivables',
  costOfGoodsSold: 'cogs', inventory: 'inventory', operatingExpenses: 'expenses',
  partnerCurrentAccount: 'partner-current', inputVat: 'vat-input', payables: 'payables',
  supplierAdvances: 'supplier-advances', salesReturns: 'sales-returns',
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


const salesReturn: any = {
  id: 'RET-1', returnNumber: 'SR-001', invoiceId: 'INV-1', invoiceNumber: 'S-001',
  date: '2026-11-16', time: '11:00', customerName: 'عميل', customerId: 'C-1',
  items: [{ lineId: 'INV-1:0', partId: 'part-1', partNumber: 'P-1',
    partName: 'قطعة', quantity: 1, unitPrice: 50, total: 50 }],
  totalRefundAmount: 51.75, refundMethod: 'نقدي (خصم من الخزنة)',
  treasuryDeducted: true, recordedBy: 'Test',
};
const returnJournal = buildSalesReturnJournal(
  salesReturn, invoice, context, 'period-1', 'now', 'tester', accounts,
);
assert.equal(returnJournal.error, null);
assert.equal(returnJournal.input?.source.type, 'sales.return');
assert.equal(returnJournal.input?.lines.find(line => line.accountId === 'sales-returns')?.debit, 45);
assert.equal(returnJournal.input?.lines.find(line => line.accountId === 'vat-output')?.debit, 6.75);
assert.equal(returnJournal.input?.lines.find(line => line.accountId === 'cash')?.credit, 51.75);
assert.equal(returnJournal.input?.lines.find(line => line.accountId === 'inventory')?.debit, 20);
assert.equal(returnJournal.input?.lines.find(line => line.accountId === 'cogs')?.credit, 20);
assert.equal(buildSalesReturnJournal(
  { ...salesReturn, id: 'RET-2', refundMethod: 'خصم من رصيد العميل الآجل', treasuryDeducted: false },
  invoice, context, 'period-1', 'now', 'tester', accounts,
).input?.lines.find(line => line.accountId === 'receivables')?.credit, 51.75);
assert.equal(buildSalesReturnJournal(
  salesReturn, { ...invoice, items: [{ ...invoice.items[0], costPrice: undefined }] },
  context, 'period-1', 'now', 'tester', accounts,
).error, 'COST_BASIS_MISSING');

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


const purchase: any = {
  id: 'PUR-1', invoiceNumber: 'P-001', date: '2026-11-16', supplierId: 'sup-1',
  supplierName: 'Supplier', items: [{ partNumber: 'P-1', partName: 'Part', category: 'ميكانيكا',
    quantity: 2, costPrice: 50, salePrice: 80, total: 100, taxAmount: 13.5 }],
  subtotal: 100, tax: 13.5, discount: 10, grandTotal: 103.5,
  paymentStatus: 'مسددة جزئياً', amountPaid: 40, paymentMethod: 'نقدي', receivedBy: 'Test',
};
const purchaseJournal = buildPurchaseInvoiceJournal(purchase, context, 'period-1', 'now', 'tester', accounts, 10);
assert.equal(purchaseJournal.error, null);
assert.equal(purchaseJournal.input?.source.type, 'purchase.invoice');
assert.equal(purchaseJournal.input?.lines.reduce((s, line) => s + line.debit, 0), 103.5);
assert.equal(purchaseJournal.input?.lines.reduce((s, line) => s + line.credit, 0), 103.5);
assert.equal(purchaseJournal.input?.lines.find(line => line.accountId === 'inventory')?.debit, 90);
assert.equal(purchaseJournal.input?.lines.find(line => line.accountId === 'vat-input')?.debit, 13.5);
assert.equal(purchaseJournal.input?.lines.find(line => line.accountId === 'supplier-advances')?.credit, 10);
assert.equal(buildPurchaseInvoiceJournal(
  { ...purchase, amountPaid: 100 }, context, 'period-1', 'now', 'tester', accounts, 10,
).error, 'INVOICE_TOTAL_MISMATCH');


const untaxedPurchase: any = {
  ...purchase, id: 'PUR-UNTAXED', invoiceNumber: 'P-002', tax: 0, grandTotal: 90,
  subtotal: 100, discount: 10, amountPaid: 0,
  items: [{ ...purchase.items[0], quantity: 2, costPrice: 50, total: 100 }],
};
const purchaseReturn: any = {
  id: 'PRET-1', returnNumber: 'PR-001', purchaseInvoiceId: 'PUR-UNTAXED',
  purchaseInvoiceNumber: 'P-002', supplierId: 'SUP-1', supplierName: 'Supplier',
  date: '2026-11-16', time: '12:00',
  items: [{ partNumber: 'P-1', partName: 'Part', quantity: 1, unitCost: 50, total: 50 }],
  totalReturnAmount: 50, cashRefundToTreasury: 0, deductedFromDeferredDebt: 35,
  creditedToStoreBalance: 15, isSettled: true, recordedBy: 'Test',
};
const purchaseReturnJournal = buildPurchaseReturnJournal(
  purchaseReturn, untaxedPurchase, context, 'period-1', 'now', 'tester', accounts,
);
assert.equal(purchaseReturnJournal.error, null);
assert.equal(purchaseReturnJournal.input?.source.type, 'purchase.return');
assert.equal(purchaseReturnJournal.input?.lines.find(line => line.accountId === 'payables')?.debit, 35);
assert.equal(purchaseReturnJournal.input?.lines.find(line => line.accountId === 'supplier-advances')?.debit, 15);
assert.equal(purchaseReturnJournal.input?.lines.find(line => line.accountId === 'inventory')?.credit, 50);
assert.equal(buildPurchaseReturnJournal(
  purchaseReturn, purchase, context, 'period-1', 'now', 'tester', accounts,
).error, 'TAX_DETAIL_MISSING');

const customerReceipt: any = {
  id: 'RCPT-1', receiptNumber: 'R-001', customerId: 'C-1', customerName: 'Customer',
  amount: 35, paymentDate: '2026-11-16', paymentMethod: 'نقدي',
  treasuryTarget: 'الخزنة', recordedBy: 'Test',
};
const receiptJournal = buildCustomerReceiptJournal(
  customerReceipt, context, 'period-1', 'now', 'tester', accounts,
);
assert.equal(receiptJournal.error, null);
assert.equal(receiptJournal.input?.lines.find(line => line.accountId === 'cash')?.debit, 35);
assert.equal(receiptJournal.input?.lines.find(line => line.accountId === 'receivables')?.credit, 35);

const supplierPayment: any = {
  id: 'SP-1', paymentNumber: 'SP001', supplierId: 'SUP-1', supplierName: 'Supplier',
  amount: 60, paymentDate: '2026-11-16', paymentMethod: 'نقدي',
  treasurySource: 'الخزنة', recordedBy: 'Test',
};
const supplierJournal = buildSupplierPaymentJournal(
  supplierPayment, context, 'period-1', 'now', 'tester', accounts, 45,
);
assert.equal(supplierJournal.error, null);
assert.equal(supplierJournal.input?.lines.find(line => line.accountId === 'payables')?.debit, 45);
assert.equal(supplierJournal.input?.lines.find(line => line.accountId === 'supplier-advances')?.debit, 15);
assert.equal(supplierJournal.input?.lines.find(line => line.accountId === 'cash')?.credit, 60);
assert.equal(buildSupplierPaymentJournal(
  supplierPayment, context, 'period-1', 'now', 'tester', accounts, 70,
).error, 'SOURCE_AMOUNT_INVALID');

const transferJournal = buildBankTransferJournal(
  { id: 'BT-1', date: '2026-11-16', sourceBankAccountId: 'BANK-A',
    destinationBankAccountId: 'BANK-B', amount: 100, reference: 'REF-1' },
  context, 'period-1', 'now', 'tester',
  id => id === 'BANK-A' ? 'bank-a' : id === 'BANK-B' ? 'bank-b' : undefined,
);
assert.equal(transferJournal.error, null);
assert.equal(transferJournal.input?.lines.find(line => line.accountId === 'bank-b')?.debit, 100);
assert.equal(transferJournal.input?.lines.find(line => line.accountId === 'bank-a')?.credit, 100);
assert.equal(transferJournal.input?.lines.some(line => line.accountId === 'sales' || line.accountId === 'expenses'), false);
assert.equal(buildBankTransferJournal(
  { id: 'BT-2', date: '2026-11-16', sourceBankAccountId: 'BANK-A',
    destinationBankAccountId: 'BANK-A', amount: 100 },
  context, 'period-1', 'now', 'tester', () => 'bank-a',
).error, 'ACCOUNT_MAPPING_MISSING');

console.log('Accounting source adapter tests passed');
