import { createHash } from 'node:crypto';
import { getAuthenticatedEmployee, getOne } from './_db.js';
import { evaluatePurchaseInvoiceMutation } from '../src/utils/purchaseInvoiceMutationPolicy.js';
import { ApiError, clientIp, findLicense, rateLimit, sendError } from './_security.js';
import { verifyOwnerCredential } from './_ownerApproval.js';

/** Re-authenticates the active server session and owner password before a purchase-invoice mutation flow. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
  try {
    const ip = clientIp(req);
    rateLimit(`purchase-invoice-owner-approval:${ip}`, 5, 10 * 60_000);
    const licenseKey = String(req.headers['x-license-key'] || '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const invoiceId = typeof req.body?.invoiceId === 'string' ? req.body.invoiceId.trim() : '';
    const action = req.body?.action === 'edit' || req.body?.action === 'cancel' ? req.body.action : '';
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!licenseKey || !bearer || !password || password.length > 200 || !invoiceId || invoiceId.length > 160 || !action) throw new ApiError('INVALID_BODY');
    const license = await findLicense(licenseKey);
    if (!license) throw new ApiError('LICENSE_INVALID');
    if (license.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const tenant = String(license.tenantId || '');
    if (!tenant) throw new ApiError('LICENSE_INVALID');
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const employee = await getAuthenticatedEmployee(tenant, tokenHash);
    if (!employee || employee.role !== 'مدير عام' || employee.status !== 'نشط') {
      return res.status(403).json({ code: 'OWNER_REQUIRED', error: 'هذه العملية تتطلب جلسة مالك نشطة.' });
    }
    if (!verifyOwnerCredential(password, employee)) {
      rateLimit(`purchase-invoice-owner-password:${ip}:${employee.id}`, 5, 10 * 60_000);
      return res.status(403).json({ code: 'OWNER_PASSWORD_INVALID', error: 'كلمة مرور المالك غير صحيحة.' });
    }

    // Re-check eligibility against the tenant's current server-side records, not UI state.
    const resources = await Promise.all([
      getOne(tenant, 'purchaseInvoices'), getOne(tenant, 'purchaseReturns'),
      getOne(tenant, 'supplierPayments'), getOne(tenant, 'supplierPaymentSchedules'),
      getOne(tenant, 'stockMovements'), getOne(tenant, 'stockBatches'), getOne(tenant, 'serialUnits'),
    ]);
    const asArray = (row: any) => Array.isArray(row?.data) ? row.data : [];
    const invoices = asArray(resources[0]);
    const invoice = invoices.find((item: any) => item?.id === invoiceId);
    if (!invoice) return res.status(404).json({ code: 'PURCHASE_INVOICE_NOT_FOUND', error: 'فاتورة المشتريات غير موجودة في هذا الحساب.' });
    const eligibility = evaluatePurchaseInvoiceMutation({
      invoice,
      purchaseReturns: asArray(resources[1]),
      supplierPayments: asArray(resources[2]),
      paymentSchedules: asArray(resources[3]),
      stockMovements: asArray(resources[4]),
      stockBatches: asArray(resources[5]),
      serialUnits: asArray(resources[6]),
    });
    if (!eligibility.allowed) return res.status(409).json({
      code: 'PURCHASE_INVOICE_MUTATION_BLOCKED', action, invoiceId,
      blockers: eligibility.blockers,
      error: 'لا يمكن تعديل أو إلغاء الفاتورة قبل تسوية ارتباطاتها المالية والمخزنية.',
    });
    // This is an invoice/action-bound preflight approval only. The mutation endpoint must
    // still re-check versions and commit every affected resource atomically.
    return res.status(200).json({ approved: true, preflightOnly: true, action, invoiceId, ownerId: employee.id, ownerName: employee.name,
      versions: resources.map((row: any) => row?.version ?? 0) });
  } catch (error) {
    return sendError(res, error);
  }
}
