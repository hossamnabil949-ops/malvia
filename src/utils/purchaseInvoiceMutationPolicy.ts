import type { PurchaseInvoice, PurchaseReturn, SupplierPayment, SupplierPaymentSchedule, StockMovement } from '../types/autoParts';

export type PurchaseInvoiceMutationBlocker = 'INVOICE_NOT_FOUND' | 'SNAPSHOT_MISSING' | 'PAYMENT_LINKED' | 'RETURN_LINKED' | 'SCHEDULE_LINKED' | 'SUBSEQUENT_STOCK_MOVEMENT' | 'TRACKED_STOCK_LINKED';
export interface PurchaseInvoiceMutationContext {
  invoice: PurchaseInvoice | null | undefined;
  purchaseReturns?: PurchaseReturn[];
  supplierPayments?: SupplierPayment[];
  paymentSchedules?: SupplierPaymentSchedule[];
  stockMovements?: StockMovement[];
  stockBatches?: Array<{ purchaseInvoiceId?: string; partId?: string }>;
  serialUnits?: Array<{ purchaseInvoiceId?: string; partId?: string; status?: string }>;
}

/** Conservative UI guard only. The server must repeat all checks before mutating data. */
export function evaluatePurchaseInvoiceMutation(context: PurchaseInvoiceMutationContext): { allowed: boolean; blockers: PurchaseInvoiceMutationBlocker[] } {
  const invoice = context.invoice;
  if (!invoice) return { allowed: false, blockers: ['INVOICE_NOT_FOUND'] };
  const blockers: PurchaseInvoiceMutationBlocker[] = [];
  if (!(invoice as PurchaseInvoice & { mutationSnapshot?: unknown }).mutationSnapshot) blockers.push('SNAPSHOT_MISSING');
  if ((Number(invoice.amountPaid) || 0) > 0 || (context.supplierPayments || []).some(p =>
    p.supplierId === invoice.supplierId && (p as SupplierPayment & { purchaseInvoiceId?: string }).purchaseInvoiceId === invoice.id
  )) blockers.push('PAYMENT_LINKED');
  if ((context.purchaseReturns || []).some(r => r.purchaseInvoiceId === invoice.id)) blockers.push('RETURN_LINKED');
  if ((context.paymentSchedules || []).some(s => s.purchaseInvoiceId === invoice.id)) blockers.push('SCHEDULE_LINKED');
  const partIds = new Set(invoice.items.map(item => item.partId).filter((id): id is string => Boolean(id)));
  const invoiceTime = Date.parse(`${invoice.date}T${invoice.time || '00:00:00'}`);
  if ((context.stockMovements || []).some(m => {
    if (!partIds.has(m.partId) || m.refId === invoice.id) return false;
    const at = Date.parse(m.at);
    return Number.isFinite(invoiceTime) && Number.isFinite(at) && at > invoiceTime;
  })) blockers.push('SUBSEQUENT_STOCK_MOVEMENT');
  if ((context.stockBatches || []).some(b => b.purchaseInvoiceId === invoice.id)
    || (context.serialUnits || []).some(u => u.purchaseInvoiceId === invoice.id)) blockers.push('TRACKED_STOCK_LINKED');
  return { allowed: blockers.length === 0, blockers };
}
