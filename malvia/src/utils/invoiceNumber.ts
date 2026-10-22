// ترقيم فواتير البيع بشكل تسلسلي: INV-السنة-0001, 0002, ...
// الرقم التالي = أكبر رقم تسلسلي موجود لنفس السنة + 1 (حتى لا يتكرر أو يتخطى).
export const nextSalesInvoiceNumber = (invoices: { invoiceNumber: string }[], date = new Date()): string => {
  const year = date.getFullYear();
  const re = new RegExp(`^INV-${year}-(\\d+)$`);
  let max = 0;
  invoices.forEach(inv => {
    const m = re.exec((inv.invoiceNumber || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `INV-${year}-${String(max + 1).padStart(4, '0')}`;
};

// ترقيم فواتير المشتريات: PUR-السنة-001, 002, ...
export const nextPurchaseInvoiceNumber = (invoices: { invoiceNumber: string }[], date = new Date()): string => {
  const year = date.getFullYear();
  const re = new RegExp(`^PUR-${year}-(\\d+)$`);
  let max = 0;
  invoices.forEach(inv => {
    const m = re.exec((inv.invoiceNumber || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `PUR-${year}-${String(max + 1).padStart(3, '0')}`;
};
