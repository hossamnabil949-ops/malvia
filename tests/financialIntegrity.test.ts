import assert from 'node:assert/strict';
import { generateSupplierScheduleDates } from '../src/utils/supplierPaymentSchedule.ts';
import { accountOf } from '../src/utils/treasuryAccounts.ts';
import { registrationEffect, actionEffect } from '../src/utils/chequeLogic.ts';
import { refundForLine } from '../src/utils/saleLogic.ts';
import { nextSalesInvoiceNumber } from '../src/utils/invoiceNumber.ts';
import { uniqueTransactionNumber } from '../src/utils/uniqueTransactionNumber.ts';

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

// FIN-17: final partial return takes the exact remaining cents.
assert.equal(refundForLine(100.01, 3, 1, 0), 33.34);
assert.equal(refundForLine(100.01, 3, 1, 1), 33.34);
assert.equal(refundForLine(100.01, 3, 1, 2), 33.33);
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
