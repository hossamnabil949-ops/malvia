// ترقيم فواتير البيع محلياً دون إنترنت: لكل تثبيت/جهاز بادئة مستقلة ثابتة.
// يمنع تصادم الرقم التسلسلي بين جهازين يعملان Offline ثم تتم مزامنتهما لاحقاً.
const DEVICE_KEY = 'malvia_invoice_device_code_v1';
let ephemeralDeviceCode: string | undefined;

export const getInvoiceDeviceCode = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(DEVICE_KEY);
      if (saved && /^[A-Z0-9]{6}$/.test(saved)) return saved;
      const generated = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
        .slice(0, 6).toUpperCase();
      localStorage.setItem(DEVICE_KEY, generated);
      return generated;
    }
  } catch {
    // Storage may be unavailable in private/restricted browser contexts.
  }
  if (!ephemeralDeviceCode) {
    ephemeralDeviceCode = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 6).toUpperCase();
  }
  return ephemeralDeviceCode;
};

export const nextSalesInvoiceNumber = (
  invoices: { invoiceNumber: string }[],
  date = new Date(),
  deviceCode = getInvoiceDeviceCode()
): string => {
  const year = date.getFullYear();
  const safeDevice = String(deviceCode || 'LOCAL1').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6).padEnd(6, '0');
  const re = new RegExp(`^INV-${year}-${safeDevice}-(\\d+)$`);
  let max = 0;
  invoices.forEach(inv => {
    const m = re.exec((inv.invoiceNumber || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `INV-${year}-${safeDevice}-${String(max + 1).padStart(4, '0')}`;
};

// ترقيم فواتير المشتريات يبقى تسلسلياً محلياً حالياً؛ سيتم توحيده مع حجز أرقام الخادم في مرحلة التزامن.
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
