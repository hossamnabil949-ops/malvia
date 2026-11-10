import type { SupplierPayment, SupplierPaymentSchedule } from '../types/autoParts';

export interface SupplierSchedulePaymentState {
  amountPaid: number;
  remainingAmount: number;
  status: 'scheduled' | 'partial' | 'paid' | 'cancelled';
}

const money = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

export function getSupplierSchedulePaymentState(
  schedule: SupplierPaymentSchedule,
  payments: SupplierPayment[],
): SupplierSchedulePaymentState {
  const amount = money(schedule.amount);
  const savedPaid = money(schedule.amountPaid);
  const linkedPayments = payments
    .filter(payment => payment.scheduleId === schedule.id)
    .reduce((sum, payment) => sum + money(payment.amount), 0);
  const amountPaid = schedule.status === 'paid'
    ? amount
    : Math.min(amount, Math.max(savedPaid, money(linkedPayments)));
  const remainingAmount = money(Math.max(0, amount - amountPaid));

  return {
    amountPaid,
    remainingAmount,
    status: schedule.status === 'cancelled'
      ? 'cancelled'
      : remainingAmount <= 0
        ? 'paid'
        : amountPaid > 0
          ? 'partial'
          : 'scheduled',
  };
}

export function applySupplierSchedulePayment(
  schedule: SupplierPaymentSchedule,
  payments: SupplierPayment[],
  amount: number,
  paymentId: string,
  treasuryTransactionId: string,
  updatedAt: string,
): SupplierPaymentSchedule | null {
  const state = getSupplierSchedulePaymentState(schedule, payments);
  const paymentAmount = money(amount);
  if (state.status === 'cancelled' || state.status === 'paid' || paymentAmount <= 0 || paymentAmount > state.remainingAmount) return null;

  const nextPaid = money(Math.min(Number(schedule.amount) || 0, state.amountPaid + paymentAmount));
  const paymentIds = Array.from(new Set([...(schedule.paymentIds || []), ...(schedule.paymentId ? [schedule.paymentId] : []), paymentId]));
  const treasuryTransactionIds = Array.from(new Set([...(schedule.treasuryTransactionIds || []), ...(schedule.treasuryTransactionId ? [schedule.treasuryTransactionId] : []), treasuryTransactionId]));

  return {
    ...schedule,
    amountPaid: nextPaid,
    status: nextPaid >= money(schedule.amount) ? 'paid' : 'scheduled',
    paymentId,
    paymentIds,
    treasuryTransactionId,
    treasuryTransactionIds,
    updatedAt,
  };
}
