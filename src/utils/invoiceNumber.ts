// ترقيم مبيعات مستقل لكل جهاز؛ يمنع تصادم رقمين عند البيع من جهازين دون اتصال.
let fallbackDeviceCode: string | undefined;
const deviceCode = (): string => {
  const storageKey = 'malvia_invoice_device_code_v1';
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (saved && /^[A-F0-9]{8}$/.test(saved)) return saved;
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    const created = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    globalThis.localStorage?.setItem(storageKey, created);
    return created;
  } catch {
    if (!fallbackDeviceCode) fallbackDeviceCode = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 6)}`.slice(-8).toUpperCase();
    return fallbackDeviceCode;
  }
};

export const nextSalesInvoiceNumber = (invoices: { invoiceNumber: string }[], date = new Date()): string => {
  const year = date.getFullYear();
  const device = deviceCode();
  const re = new RegExp(`^INV-${year}-${device}-(\\\\d+)$`);
  let max = 0;
  invoices.forEach(inv => {
    const match = re.exec((inv.invoiceNumber || '').trim());
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });
  return `INV-${year}-${device}-${String(max + 1).padStart(4, '0')}`;
};

// ترقيم المشتريات محلي متسلسل؛ لا يغيّر الأرقام القديمة.
export const nextPurchaseInvoiceNumber = (invoices: { invoiceNumber: string }[], date = new Date()): string => {
  const year = date.getFullYear();
  const re = new RegExp(`^PUR-${year}-(\\\\d+)$`);
  let max = 0;
  invoices.forEach(inv => {
    const match = re.exec((inv.invoiceNumber || '').trim());
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });
  return `PUR-${year}-${String(max + 1).padStart(3, '0')}`;
};
