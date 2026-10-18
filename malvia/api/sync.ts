// نقطة المزامنة: GET يرجّع كل بيانات المحل، POST يكتب مورد واحد بشرط الإصدار.
// الاعتماد: مفتاح الترخيص (x-license-key) هو سر المحل. سجل التراخيص نفسه محفوظ كمورد داخل tenant "_registry".
import { getAll, getOne, putIfVersion } from './_db';

const REGISTRY = '_registry';
const ALLOWED = new Set(['parts','invoices','customers','suppliers','supplierPayments','treasury','employees','settings',
  'salesReturns','purchaseInvoices','purchaseReturns','expenses','partners','carModels','reservations','inventoryErrors']);

async function findLicense(key: string) {
  const reg = await getOne(REGISTRY, 'licenses');
  const list = (reg?.data as any[]) || [];
  return list.find(l => String(l.licenseKey).toUpperCase() === key.toUpperCase()) || null;
}

export default async function handler(req: any, res: any) {
  try {
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) return res.status(401).json({ error: 'مفتاح الترخيص مطلوب' });
    const lic = await findLicense(key);
    if (!lic) return res.status(403).json({ error: 'مفتاح غير مسجل' });
    if (lic.status === 'معلق مؤقتاً') return res.status(403).json({ error: 'الترخيص معلق' });
    const tenant = String(lic.tenantId);

    if (req.method === 'GET') {
      const docs = await getAll(tenant);
      return res.status(200).json({ tenant: lic, docs });
    }
    if (req.method === 'POST') {
      const { resource, data, baseVersion } = req.body || {};
      if (!ALLOWED.has(resource)) return res.status(400).json({ error: 'مورد غير مسموح' });
      const v = await putIfVersion(tenant, resource, data, Number(baseVersion) || 0);
      if (v === null) {
        const cur = await getOne(tenant, resource);
        return res.status(409).json({ conflict: true, current: cur });
      }
      return res.status(200).json({ version: v });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
