// نقطة المزامنة: GET يرجّع كل بيانات المحل، POST يكتب مورد واحد بشرط الإصدار.
// الاعتماد: مفتاح الترخيص (x-license-key). سجل التراخيص محفوظ كمورد داخل tenant "_registry".
// التحقق من المدخلات وحد المعدل وأكواد الأخطاء في _security.ts.
import { getAll, getOne, putIfVersion, getAuthenticatedEmployee } from './_db.js';
import { createHash } from 'node:crypto';
import { ApiError, clientIp, findLicense, rateLimit, sendError, validateSyncBody } from './_security.js';

export default async function handler(req: any, res: any) {
  let phase = 'start';
  let resource = '';
  try {
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) throw new ApiError('LICENSE_REQUIRED');
    const ip = clientIp(req);
    rateLimit(`sync:${ip}`, 300, 60_000);
    phase = 'license_lookup';
    const lic = await findLicense(key);
    if (!lic) { rateLimit(`bad-key:${ip}`, 10, 10 * 60_000); throw new ApiError('LICENSE_INVALID'); }
    if (lic.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const tenant = String(lic.tenantId);

    if (req.method === 'GET') {
      phase = 'download';
      phase = 'authenticate_employee';
      const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
      if (!bearer) return res.status(401).json({ code: 'EMPLOYEE_SESSION_REQUIRED', error: 'سجّل دخول الموظف قبل تنزيل بيانات المحل.' });
      const tokenHash = createHash('sha256').update(bearer).digest('hex');
      const employee = await getAuthenticatedEmployee(tenant, tokenHash);
      if (!employee) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'جلسة الموظف غير صالحة أو انتهت.' });
      return res.status(200).json({ tenant: lic, docs: await getAll(tenant) });
    }
    if (req.method === 'POST') {
      phase = 'validate_body';
      const body = validateSyncBody(req.body);
      resource = body.resource;
      const { data, baseVersion } = body;
      phase = 'authenticate_employee';
      const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
      if (!bearer) return res.status(401).json({ code: 'EMPLOYEE_SESSION_REQUIRED', error: 'يلزم تسجيل دخول موظف موثق قبل مزامنة التعديلات.' });
      const tokenHash = createHash('sha256').update(bearer).digest('hex');
      const employee = await getAuthenticatedEmployee(tenant, tokenHash);
      if (!employee) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'جلسة الموظف غير صالحة أو انتهت.' });
      const role = String(employee.role || '');
      const p = employee.permissions || {};
      const owner = role === 'مدير عام';
      const allowed = (keys: string[]) => owner || (role === 'محاسب مالي' && keys.includes('canManagePartners')) || keys.some((key) => p[key] === true);
      const policy: Record<string, string[]> = {
        employees: ['canManageSettings'], settings: ['canManageSettings'], partners: ['canManagePartners'], partnerWithdrawals: ['canManagePartners'], partnerExitSettlements: ['canManagePartners'], partnerSettlementPayments: ['canManagePartners'],
        parts: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'], stockLevels: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
        stockBatches: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'], serialUnits: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
        inventoryErrors: ['canManageInventory'], stockTransfers: ['canManageInventory'], warehouses: ['canManageInventory'],
        invoices: ['canSellPos'], salesReturns: ['canSellPos'], loyaltyLedger: ['canSellPos'], customers: ['canSellPos','canManageTreasury'],
        suppliers: ['canManagePurchases','canReceivePurchases','canManageTreasury'], supplierPayments: ['canManagePurchases','canManageTreasury'], supplierPaymentSchedules: ['canManagePurchases','canManageTreasury'],
        purchaseInvoices: ['canManagePurchases','canReceivePurchases'], purchaseReturns: ['canManagePurchases'],
        expenses: ['canManageExpenses','canManageTreasury'], treasury: ['canManageTreasury','canSellPos','canManagePurchases','canManagePartners'],
        bankAccounts: ['canManageTreasury'], cardSettlements: ['canManageTreasury'], bankLedgerEntries: ['canManageTreasury','canManagePartners'],
        shifts: ['canSellPos','canManageTreasury'], stockMovements: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
        auditLog: ['canSellPos','canManageInventory','canManagePurchases','canManageTreasury','canManageSettings','canManagePartners'],
        carModels: ['canManageInventory'], reservations: ['canSellPos'], cheques: ['canManageTreasury'],
      };
      const keys = policy[resource] || ['canManageSettings'];
      if (!allowed(keys)) return res.status(403).json({ code: 'EMPLOYEE_PERMISSION_DENIED', error: 'لا تملك صلاحية مزامنة هذا النوع من البيانات.' });
      phase = 'database_write';
      const v = await putIfVersion(tenant, resource, data, baseVersion);
      if (v === -1) {
        return res.status(409).json({
          conflict: true,
          code: 'DUPLICATE_INVOICE_NUMBER',
          error: 'رقم الفاتورة مستخدم بالفعل على جهاز آخر. احتفظ بالفاتورة محلياً وغيّر رقمها إلى رقم فريد قبل إعادة المزامنة.',
        });
      }
      if (v === null) {
        return res.status(409).json({ conflict: true, code: 'VERSION_CONFLICT', current: await getOne(tenant, resource) });
      }
      return res.status(200).json({ version: v });
    }
    throw new ApiError('METHOD_NOT_ALLOWED');
  } catch (e) {
    console.error('[MALVIA_SYNC_FAILURE]', { phase, resource: resource || undefined, method: req.method, error: e });
    return sendError(res, e);
  }
}
