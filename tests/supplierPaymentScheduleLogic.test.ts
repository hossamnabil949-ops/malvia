import assert from 'node:assert/strict';
import { applySupplierSchedulePayment, getSupplierSchedulePaymentState } from '../src/utils/supplierPaymentScheduleLogic';
import type { SupplierPayment, SupplierPaymentSchedule } from '../src/types/autoParts';

const schedule: SupplierPaymentSchedule = {
  id: 'SCH-1', supplierId: 'SUP-1', supplierName: 'Supplier A',
  amount: 1000, amountPaid: 0, dueDate: '2026-11-10', status: 'scheduled',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const payment = (id: string, amount: number): SupplierPayment => ({
  id, paymentNumber: id, supplierId: 'SUP-1', supplierName: 'Supplier A',
  amount, paymentDate: '2026-11-10', paymentMethod: 'نقدي', treasurySource: 'الخزينة',
  notes: '', recordedBy: 'Tester', scheduleId: 'SCH-1',
});

{
  const partial = applySupplierSchedulePayment(schedule, [], 600, 'PAY-1', 'TX-1', '2026-11-10T10:00:00.000Z');
  assert.ok(partial);
  assert.equal(partial.amountPaid, 600);
  assert.equal(partial.status, 'scheduled');
  const state = getSupplierSchedulePaymentState(partial, [payment('PAY-1', 600)]);
  assert.equal(state.status, 'partial');
  assert.equal(state.remainingAmount, 400);
  const second = applySupplierSchedulePayment(partial, [payment('PAY-1', 600)], 300, 'PAY-2', 'TX-2', '2026-11-10T11:00:00.000Z');
  assert.ok(second, 'a second partial payment must be accepted');
  assert.equal(second.amountPaid, 900);
  assert.deepEqual(second.paymentIds, ['PAY-1', 'PAY-2']);
  assert.deepEqual(second.treasuryTransactionIds, ['TX-1', 'TX-2']);
  const final = applySupplierSchedulePayment(second, [payment('PAY-1', 600), payment('PAY-2', 300)], 100, 'PAY-3', 'TX-3', '2026-11-10T12:00:00.000Z');
  assert.ok(final);
  assert.equal(final.amountPaid, 1000);
  assert.equal(final.status, 'paid');
  assert.equal(getSupplierSchedulePaymentState(final, [payment('PAY-1', 600), payment('PAY-2', 300), payment('PAY-3', 100)]).remainingAmount, 0);
}

{
  const legacy = { ...schedule, amountPaid: 0 };
  const state = getSupplierSchedulePaymentState(legacy, [payment('LEGACY-PAY', 250)]);
  assert.equal(state.amountPaid, 250, 'linked historical payments must recover a stale schedule counter');
  assert.equal(state.remainingAmount, 750);
  const overpaid = applySupplierSchedulePayment(legacy, [payment('LEGACY-PAY', 250)], 751, 'OVER', 'TX-OVER', 'now');
  assert.ok(overpaid, 'an overpayment must be accepted and applied to the supplier account');
  assert.equal(overpaid.amountPaid, 1000, 'schedule paid amount must not exceed its face value');
  assert.equal(overpaid.status, 'paid');
}

{
  const cancelled = { ...schedule, status: 'cancelled' as const };
  assert.equal(applySupplierSchedulePayment(cancelled, [], 100, 'PAY', 'TX', 'now'), null);
}

console.log('supplierPaymentScheduleLogic: all tests passed');

{
  const smallerSchedule: SupplierPaymentSchedule = { ...schedule, id: 'SCH-OVER', amount: 966.66, amountPaid: 0, status: 'scheduled' };
  const overpayment = applySupplierSchedulePayment(smallerSchedule, [], 1000, 'PAY-OVER', 'TX-OVER', '2026-11-10T13:00:00.000Z');
  assert.ok(overpayment, 'payment above the installment amount must be accepted');
  assert.equal(overpayment.amountPaid, 966.66, 'installment paid amount must be capped at its face value');
  assert.equal(overpayment.status, 'paid');
  const state = getSupplierSchedulePaymentState(overpayment, [payment('PAY-OVER', 1000)]);
  assert.equal(state.status, 'paid');
  assert.equal(state.remainingAmount, 0);
  assert.equal(state.amountPaid, 966.66);
}
