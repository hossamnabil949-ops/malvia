// حقول الباركود الإضافية متوافقة مع الأصناف القديمة؛ لا تتطلب ترحيل بيانات.
export type PartBarcode = {
  value: string;
  kind: 'internal' | 'supplier';
  label?: string;
};

export function makeInternalBarcode(existing: Iterable<string> = []): string {
  const used = new Set(Array.from(existing, value => String(value || '').trim()));
  let code = '';
  do {
    code = 'MAL' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  } while (used.has(code));
  return code;
}

export function barcodeValues(part: { barcode?: string; internalBarcode?: string; supplierBarcode?: string; extraBarcodes?: PartBarcode[] }) {
  return Array.from(new Set([
    part.internalBarcode, part.barcode, part.supplierBarcode,
    ...(part.extraBarcodes || []).map(item => item.value),
  ].map(value => String(value || '').trim()).filter(Boolean)));
}

export function findBarcodeConflict(
  parts: Array<{ id: string; barcode?: string; internalBarcode?: string; supplierBarcode?: string; extraBarcodes?: PartBarcode[] }>,
  value: string,
  exceptPartId?: string,
) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return undefined;
  return parts.find(part => part.id !== exceptPartId &&
    barcodeValues(part).some(code => code.toUpperCase() === normalized));
}
