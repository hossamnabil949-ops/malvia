// FIN-18: atomic multi-resource sync. Every resource is validated and committed in one PostgreSQL transaction.
import { commitSyncBatch, getAuthenticatedEmployee, getOne } from './_db.js';
import { validateChequeAuditSync, validateChequeAuxiliarySync, validateChequeCollectionSync, validateExpenseOnlySync } from '../src/utils/chequeSyncPolicy';
import { createHash } from 'node:crypto';
import { ApiError, clientIp, findLicense, rateLimit, sendError } from './_security.js';

const policy: Record<string, string[]> = {
  employees: ['canManageSettings'], settings: ['canManageSettings'], partners: ['canManagePartners'],
  parts: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'], stockLevels: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
  stockBatches: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'], serialUnits: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
  inventoryErrors: ['canManageInventory'], stockTransfers: ['canManageInventory'], warehouses: ['canManageInventory'],
  invoices: ['canSellPos'], salesReturns: ['canSellPos'], loyaltyLedger: ['canSellPos'], customers: ['canSellPos','canManageTreasury'],
  suppliers: ['canManagePurchases','canReceivePurchases','canManageTreasury'], supplierPayments: ['canManagePurchases','canManageTreasury'],
  supplierPaymentSchedules: ['canManagePurchases','canManageTreasury'], purchaseInvoices: ['canManagePurchases','canReceivePurchases'],
  purchaseReturns: ['canManagePurchases'], expenses: ['canManageExpenses','canManageTreasury'],
  treasury: ['canManageTreasury','canSellPos','canManagePurchases','canManageChequeLifecycle','canManageExpenses'], bankAccounts: ['canManageTreasury'], cardSettlements: ['canManageTreasury'], bankLedgerEntries: ['canManageTreasury','canManageChequeLifecycle'],
  shifts: ['canSellPos','canManageTreasury'],
  stockMovements: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
  auditLog: ['canSellPos','canManageInventory','canManagePurchases','canManageTreasury','canManageSettings','canRegisterCheques','canManageChequeLifecycle'],
  carModels: ['canManageInventory'], reservations: ['canSellPos'], cheques: ['canManageTreasury','canRegisterCheques','canManageChequeLifecycle'],
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED');
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) throw new ApiError('LICENSE_REQUIRED');
    const ip = clientIp(req);
    rateLimit(`sync-batch:${ip}`, 120, 60_000);
    const lic = await findLicense(key);
    if (!lic) { rateLimit(`bad-key:${ip}`, 10, 10 * 60_000); throw new ApiError('LICENSE_INVALID'); }
    if (lic.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!bearer) return res.status(401).json({ code: 'EMPLOYEE_SESSION_REQUIRED', error: 'يلزم تسجيل دخول موظف موثق قبل المزامنة.' });
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const tenant = String(lic.tenantId);
    const employee = await getAuthenticatedEmployee(tenant, tokenHash);
    if (!employee) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'جلسة الموظف غير صالحة أو انتهت.' });
    const operations = req.body?.operations;
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 40 ||
        !/^[A-Za-z0-9:_-]{12,160}$/.test(idempotencyKey) ||
        operations.some((op: any) => !op || typeof op.resource !== 'string' ||
          !Object.prototype.hasOwnProperty.call(policy, op.resource) ||
          !Number.isSafeInteger(op.baseVersion) || op.baseVersion < 0 ||
          !Object.prototype.hasOwnProperty.call(op, 'data'))) {
      return res.status(400).json({ code: 'SYNC_BATCH_INVALID', error: 'بيانات دفعة المزامنة غير صالحة.' });
    }
    if (new Set(operations.map((op: any) => op.resource)).size !== operations.length) {
      return res.status(400).json({ code: 'SYNC_BATCH_DUPLICATE_RESOURCE', error: 'لا يمكن تكرار المورد داخل دفعة واحدة.' });
    }
    const role = String(employee.role || '');
    const permissions = employee.permissions || {};
    const owner = role === 'مدير عام';
    for (const op of operations) {
      const allowed = owner || policy[op.resource].some((permission) => permissions[permission] === true);
      if (!allowed) return res.status(403).json({ code: 'EMPLOYEE_PERMISSION_DENIED', resource: op.resource, error: 'لا تملك صلاحية مزامنة أحد عناصر الدفعة.' });
    }

    if (!owner && operations.some((op: any) => ['cheques', 'treasury', 'bankLedgerEntries', 'expenses', 'auditLog'].includes(op.resource)) &&
        permissions.canManageTreasury !== true) {
      const operationMap = new Map(operations.map((op: any) => [op.resource, op]));
      const loadArray = async (resource: string): Promise<any[]> => {
        const row = await getOne(tenant, resource);
        return Array.isArray(row?.data) ? row.data as any[] : [];
      };
      const chequeOperation: any = operationMap.get('cheques');
      const previousCheques = await loadArray('cheques');
      const incomingCheques = chequeOperation ? chequeOperation.data : previousCheques;
      if (chequeOperation) {
        const chequeError = validateChequeCollectionSync(previousCheques, incomingCheques, employee, permissions);
        if (chequeError) return res.status(403).json({ code: chequeError, resource: 'cheques', error: 'تعديل الشيكات غير مسموح بهذه الصلاحية.' });
      }
      const auditOperation: any = operationMap.get('auditLog');
      const hasOtherAuditPermission = ['canSellPos', 'canManageInventory', 'canManagePurchases', 'canManageTreasury', 'canManageSettings']
        .some(permission => permissions[permission] === true);
      if (auditOperation && !hasOtherAuditPermission) {
        if (!chequeOperation) return res.status(403).json({ code: 'CHEQUE_AUDIT_STATE_REQUIRED', resource: 'auditLog', error: 'سجل التدقيق يحتاج إلى حالة الشيك المرتبطة به.' });
        const previousAudit = await loadArray('auditLog');
        const auditError = validateChequeAuditSync({
          previous: previousAudit,
          incoming: auditOperation.data,
          previousCheques,
          incomingCheques,
          employee,
        });
        if (auditError) return res.status(403).json({ code: auditError, resource: 'auditLog', error: 'تعديل سجل الشيكات غير مسموح.' });
      }

      if (permissions.canManageExpenses === true && permissions.canManageTreasury !== true &&
          permissions.canSellPos !== true && permissions.canManagePurchases !== true) {
        const expenseOperation: any = operationMap.get('expenses');
        const treasuryOperation: any = operationMap.get('treasury');
        if (expenseOperation || treasuryOperation) {
          if (!expenseOperation || !treasuryOperation) {
            return res.status(403).json({ code: 'EXPENSE_TREASURY_MISMATCH', resource: 'expenses', error: 'يجب حفظ المصروف وحركته المالية معاً.' });
          }
          const previousExpenses = await loadArray('expenses');
          const previousTreasury = await loadArray('treasury');
          const expenseError = validateExpenseOnlySync({
            previousExpenses,
            incomingExpenses: expenseOperation.data,
            previousTreasury,
            incomingTreasury: treasuryOperation.data,
            employee,
          });
          if (expenseError) return res.status(403).json({ code: expenseError, resource: 'expenses', error: 'يمكنك إضافة مصروف تشغيلي فقط دون تعديل الحركات المالية السابقة.' });
        }
      }
      for (const resource of ['treasury', 'bankLedgerEntries']) {
        const operation: any = operationMap.get(resource);
        if (!operation || permissions.canManageChequeLifecycle !== true) continue;
        // POS/purchase operators already have the legacy workflow permission for treasury writes;
        // apply the narrow cheque-only rule only to lifecycle-only staff.
        if (resource === 'treasury' && (permissions.canSellPos === true || permissions.canManagePurchases === true)) continue;
        if (!chequeOperation) return res.status(403).json({ code: 'CHEQUE_STATE_REQUIRED', resource, error: 'يجب مزامنة حالة الشيك المرتبطة بالحركة البنكية.' });
        const previous = await loadArray(resource);
        const bankAccounts = resource === 'bankLedgerEntries' ? await loadArray('bankAccounts') : [];
        const error = validateChequeAuxiliarySync({
          resource: resource as 'treasury' | 'bankLedgerEntries',
          previous,
          incoming: operation.data,
          previousCheques,
          incomingCheques,
          bankAccounts,
          employee,
        });
        if (error) return res.status(403).json({ code: error, resource, error: 'حركة الشيك البنكية غير مطابقة أو غير مسموح بها.' });
      }
    }
    const serialized = JSON.stringify(operations);
    if (serialized.length > 5_000_000) return res.status(413).json({ code: 'SYNC_BATCH_TOO_LARGE', error: 'حجم دفعة المزامنة أكبر من الحد المسموح.' });
    const requestHash = createHash('sha256').update(serialized).digest('hex');
    const result = await commitSyncBatch(tenant, idempotencyKey, requestHash, operations);
    if (result?.conflict) return res.status(409).json(result);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}
