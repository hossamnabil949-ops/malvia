// FIN-18: atomic multi-resource sync. Every resource is validated and committed in one PostgreSQL transaction.

const policy: Record<string, string[]> = {
  employees: ['canManageSettings'], settings: ['canManageSettings'], partners: ['canManagePartners'], partnerWithdrawals: ['canManagePartners'], partnerCurrentAccountTransactions: ['canManagePartners','canManageTreasury'], partnerExitSettlements: ['canManagePartners'], partnerSettlementPayments: ['canManagePartners'], openingBalances: [],
  parts: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'], stockLevels: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
  stockBatches: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'], serialUnits: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
  inventoryErrors: ['canManageInventory'], stockTransfers: ['canManageInventory'], warehouses: ['canManageInventory'],
  invoices: ['canSellPos'], salesReturns: ['canSellPos'], loyaltyLedger: ['canSellPos'], customers: ['canSellPos','canManageTreasury'],
  suppliers: ['canManagePurchases','canReceivePurchases','canManageTreasury'], supplierPayments: ['canManagePurchases','canManageTreasury'],
  supplierPaymentSchedules: ['canManagePurchases','canManageTreasury'], purchaseInvoices: ['canManagePurchases','canReceivePurchases'],
  purchaseReturns: ['canManagePurchases'], expenses: ['canManageExpenses','canManageTreasury'],
  treasury: ['canManageTreasury','canSellPos','canManagePurchases','canManageChequeLifecycle','canManageExpenses','canManagePartners'], bankAccounts: ['canManageTreasury'], cardSettlements: ['canManageTreasury'], bankLedgerEntries: ['canManageTreasury','canManageChequeLifecycle','canSellPos','canManagePurchases','canManageExpenses','canManagePartners'],
  shifts: ['canSellPos','canManageTreasury'],
  stockMovements: ['canManageInventory','canManagePurchases','canReceivePurchases','canSellPos'],
  auditLog: ['canSellPos','canManageInventory','canManagePurchases','canManageTreasury','canManageSettings','canRegisterCheques','canManageChequeLifecycle','canReceivePurchases','canManageExpenses','canManagePartners'],
  carModels: ['canManageInventory'], reservations: ['canSellPos'], cheques: ['canManageTreasury','canRegisterCheques','canManageChequeLifecycle'],
};

export default async function handler(req: any, res: any) {
  let phase = 'start';
  let resource = '';
  let operationResources: string[] = [];
  let ApiErrorClass: any = null;
  let sendErrorFn: any = null;
  const traceId = String(req.headers['x-vercel-id'] || req.headers['x-request-id'] || 'unavailable').slice(0, 160);
  try {
    // Keep the function entrypoint dependency-light. If a server-only module fails
    // during initialization, catch it here and return a safe JSON diagnostic.
    phase = 'request_validation';
    if (req.method !== 'POST') {
      return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
    }

    phase = 'module_loading';
    const [db, security, crypto, chequePolicy, bankPolicy, partnerPolicy] = await Promise.all([
      import('./_db.js'),
      import('./_security.js'),
      import('node:crypto'),
      import('../src/utils/chequeSyncPolicy.js'),
      import('../src/utils/bankLedgerSyncPolicy.js'),
      import('../src/utils/partnerCurrentAccount.js'),
    ]);
    ApiErrorClass = security.ApiError;
    sendErrorFn = security.sendError;
    const { commitSyncBatch, getAuthenticatedEmployee, getOne } = db;
    const { clientIp, findLicense, rateLimit } = security;
    const { createHash } = crypto;
    const {
      validateChequeAuditSync, validateChequeAuxiliarySync,
      validateChequeCollectionSync, validateExpenseOnlySync, validatePurchaseAuditSync,
    } = chequePolicy;
    const { validateBankLedgerSync } = bankPolicy;
    const { validatePartnerCurrentAccountSync } = partnerPolicy;

    phase = 'request_validation';
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) throw new ApiErrorClass('LICENSE_REQUIRED');
    const ip = clientIp(req);
    rateLimit(`sync-batch:${ip}`, 120, 60_000);
    phase = 'license_lookup';
    const lic = await findLicense(key);
    if (!lic) { rateLimit(`bad-key:${ip}`, 10, 10 * 60_000); throw new ApiErrorClass('LICENSE_INVALID'); }
    if (lic.status === 'معلق مؤقتاً') throw new ApiErrorClass('LICENSE_SUSPENDED');
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!bearer) return res.status(401).json({ code: 'EMPLOYEE_SESSION_REQUIRED', error: 'يلزم تسجيل دخول موظف موثق قبل المزامنة.' });
    const tokenHash = createHash('sha256').update(bearer).digest('hex');
    const tenant = String(lic.tenantId);
    phase = 'employee_authentication';
    const employee = await getAuthenticatedEmployee(tenant, tokenHash);
    if (!employee) return res.status(401).json({ code: 'EMPLOYEE_SESSION_INVALID', error: 'جلسة الموظف غير صالحة أو انتهت.' });
    phase = 'payload_validation';
    let operations = req.body?.operations;
    const syncWarnings: any[] = [];
    const rejectedResources = new Set<string>();
    const rejectedResourceData: Record<string, any> = {};
    const rejectedResourceVersions: Record<string, number> = {};
    const actorName = String(employee?.name || employee?.employeeName || employee?.username || employee?.id || 'موظف غير محدد').slice(0, 120);
    const rejectResourceGroup = async (
      resourceNames: string[], code: string, message: string,
      explicitRecordIds: string[] = [], explicitGroupIds: string[] = [],
    ) => {
      const operationMap = new Map(operations.map((op: any) => [op.resource, op]));
      const primaryName = resourceNames[0];
      const primaryOp: any = operationMap.get(primaryName);
      if (!primaryOp) return;
      const primaryRow = await getOne(tenant, primaryName);
      if (primaryRow && !Object.prototype.hasOwnProperty.call(primaryRow, 'data')) throw new Error('SYNC_REJECTION_SNAPSHOT_UNAVAILABLE');
      const primaryPrevious = primaryRow?.data ?? [];
      const primaryOldRows = Array.isArray(primaryPrevious) ? primaryPrevious : [];
      const primaryIncomingRows = Array.isArray(primaryOp.data) ? primaryOp.data : [];
      const primaryOldById = new Map<string, any>(primaryOldRows.filter((x: any) => x?.id != null).map((x: any): [string, any] => [String(x.id), x]));
      const primaryNewById = new Map<string, any>(primaryIncomingRows.filter((x: any) => x?.id != null).map((x: any): [string, any] => [String(x.id), x]));
      const primaryAffectedIds = new Set<string>(explicitRecordIds.map(String));
      if (!primaryAffectedIds.size) {
        for (const [id, item] of primaryNewById) {
          const old = primaryOldById.get(id);
          if (!old || JSON.stringify(old) !== JSON.stringify(item)) primaryAffectedIds.add(id);
        }
        for (const id of primaryOldById.keys()) if (!primaryNewById.has(id)) primaryAffectedIds.add(id);
      }
      const groupIds = new Set<string>([...explicitGroupIds, ...primaryAffectedIds]);
      const linkKeys = ['batchId', 'referenceId', 'treasuryTransactionId', 'relatedTransactionId', 'settlementId', 'txNumber', 'entityId', 'invoiceId', 'purchaseInvoiceId', 'supplierPaymentId', 'chequeId', 'sourceId'];
      for (const id of primaryAffectedIds) {
        const item: any = primaryNewById.get(id) || primaryOldById.get(id);
        for (const key of linkKeys) if (item?.[key] != null && String(item[key]).trim()) groupIds.add(String(item[key]).slice(0, 160));
      }
      const matchesGroup = (item: any) => {
        if (!item || typeof item !== 'object') return false;
        if (item.id != null && groupIds.has(String(item.id))) return true;
        return linkKeys.some(key => item[key] != null && groupIds.has(String(item[key])));
      };
      for (const name of resourceNames) {
        const op: any = operationMap.get(name);
        if (!op || rejectedResources.has(name)) continue;
        const row = name === primaryName ? primaryRow : await getOne(tenant, name);
        if (row && !Object.prototype.hasOwnProperty.call(row, 'data')) throw new Error('SYNC_REJECTION_SNAPSHOT_UNAVAILABLE');
        const previous = row?.data ?? [];
        const oldRows = Array.isArray(previous) ? previous : [];
        const incomingRows = Array.isArray(op.data) ? op.data : [];
        const oldById = new Map<string, any>(oldRows.filter((x: any) => x?.id != null).map((x: any): [string, any] => [String(x.id), x]));
        const newById = new Map<string, any>(incomingRows.filter((x: any) => x?.id != null).map((x: any): [string, any] => [String(x.id), x]));
        const affectedIds = new Set<string>();
        if (name === primaryName) {
          for (const id of primaryAffectedIds) affectedIds.add(id);
          // If the validator cannot identify a row, fail closed for this primary resource only.
          if (!affectedIds.size) {
            for (const item of incomingRows) if (item?.id != null) affectedIds.add(String(item.id));
            for (const item of oldRows) if (item?.id != null) affectedIds.add(String(item.id));
          }
        } else {
          for (const item of incomingRows) if (matchesGroup(item) && item?.id != null) affectedIds.add(String(item.id));
          for (const item of oldRows) if (matchesGroup(item) && item?.id != null) affectedIds.add(String(item.id));
        }
        if (name !== primaryName && affectedIds.size === 0) continue;
        const rejectedSet = new Set(affectedIds);
        const keptIncoming = incomingRows.filter((item: any) => item?.id == null || !rejectedSet.has(String(item.id)));
        const restoredRows = oldRows.filter((item: any) => item?.id != null && rejectedSet.has(String(item.id)));
        const nextData = [...keptIncoming, ...restoredRows];
        op.data = Array.isArray(previous) ? nextData : previous;
        rejectedResources.add(name);
        rejectedResourceData[name] = op.data;
        rejectedResourceVersions[name] = Number(row?.version || 0);
        syncWarnings.push({
          code, resource: name,
          actor: { employeeId: String(employee.id || '').slice(0,120), employeeName: actorName, username: String(employee.username || '').slice(0,80), role: String(employee.role || '').slice(0,80) },
          affectedRecordIds: [...affectedIds].slice(0,100),
          relatedGroupIds: [...groupIds].slice(0,100),
          traceId, message
        });
      }
    };
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 40 ||
        !/^[A-Za-z0-9:_-]{12,160}$/.test(idempotencyKey) ||
        operations.some((op: any) => !op || typeof op.resource !== 'string' ||
          !Object.prototype.hasOwnProperty.call(policy, op.resource) ||
          !Number.isSafeInteger(op.baseVersion) || op.baseVersion < 0 ||
          !Object.prototype.hasOwnProperty.call(op, 'data'))) {
      return res.status(400).json({ code: 'SYNC_BATCH_INVALID', error: 'بيانات دفعة المزامنة غير صالحة.', diagnostic: { traceId, phase, resource: 'unknown', operationCount: Array.isArray(operations) ? operations.length : 0, errorName: 'SyncValidationError', errorCode: 'SYNC_BATCH_INVALID' } });
    }
    operationResources = operations.map((op: any) => String(op.resource));
    if (new Set(operations.map((op: any) => op.resource)).size !== operations.length) {
      return res.status(400).json({ code: 'SYNC_BATCH_DUPLICATE_RESOURCE', error: 'لا يمكن تكرار المورد داخل دفعة واحدة.', diagnostic: { traceId, phase, resource: operationResources.join(','), operationCount: operationResources.length, errorName: 'SyncValidationError', errorCode: 'SYNC_BATCH_DUPLICATE_RESOURCE' } });
    }
    phase = 'permission_validation';
    const role = String(employee.role || '').trim();
    // Support both legacy array permissions (including ["*"]) and the current
    // permission map. Some existing tenant admin records use role "ADMIN".
    const permissionList = Array.isArray(employee.permissions) ? employee.permissions.map((value: any) => String(value)) : [];
    const permissions = employee.permissions && typeof employee.permissions === 'object' && !Array.isArray(employee.permissions) ? employee.permissions : {};
    const normalizedRole = role.toUpperCase();
    const owner = ['مدير عام', 'ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(normalizedRole)
      || String(employee.username || '').trim().toLowerCase() === 'admin'
      || permissionList.includes('*') || permissions['*'] === true;
    const hasPermission = (permission: string) => owner || permissionList.includes('*') || permissionList.includes(permission) || permissions[permission] === true || permissions['*'] === true;
    for (const op of operations) {
      const allowed = owner || (role === 'محاسب مالي' && policy[op.resource].includes('canManagePartners')) || policy[op.resource].some(hasPermission);
      if (!allowed) {
        // Safe server-side diagnostics: never log employee identity, credentials, or payload.
        console.warn('[MALVIA_PERMISSION_DIAGNOSTIC]', {
          traceId,
          resource: op.resource,
          role,
          normalizedRole,
          permissionsShape: Array.isArray(employee.permissions) ? 'array' : (employee.permissions && typeof employee.permissions === 'object' ? 'object' : typeof employee.permissions),
          permissionKeys: Object.keys(permissions).filter((key) => typeof key === 'string').slice(0, 80),
          permissionListHasWildcard: permissionList.includes('*'),
          settingsPermission: permissions.canManageSettings === true || permissionList.includes('canManageSettings'),
          wildcardPermission: permissions['*'] === true || permissionList.includes('*'),
          usernameIsAdmin: String(employee.username || '').trim().toLowerCase() === 'admin',
          operationCount: operationResources.length,
        });
        return res.status(403).json({ code: 'EMPLOYEE_PERMISSION_DENIED', resource: op.resource, error: 'لا تملك صلاحية مزامنة أحد عناصر الدفعة.', diagnostic: { traceId, phase, resource: op.resource, operationCount: operationResources.length, errorName: 'PermissionError', errorCode: 'EMPLOYEE_PERMISSION_DENIED' } });
      }
    }
    if (!owner && operations.some((op: any) => op.resource === 'partnerCurrentAccountTransactions')
      && !(role === 'محاسب مالي' || (permissions.canManagePartners === true && permissions.canManageTreasury === true))) {
      return res.status(403).json({ code: 'PARTNER_CURRENT_ACCOUNT_PERMISSION_DENIED', resource: 'partnerCurrentAccountTransactions', error: 'حساب جاري الشركاء يتطلب صلاحية إدارة الشركاء والخزينة معاً.', diagnostic: { traceId, phase, resource: 'partnerCurrentAccountTransactions', operationCount: operationResources.length, errorName: 'PermissionError', errorCode: 'PARTNER_CURRENT_ACCOUNT_PERMISSION_DENIED' } });
    }

    phase = 'bank_ledger_validation';
    if (operations.some((op: any) => op.resource === 'bankLedgerEntries')) {
      const operationMap = new Map(operations.map((op: any) => [op.resource, op]));
      const loadArray = async (resource: string): Promise<any[]> => {
        const row = await getOne(tenant, resource);
        return Array.isArray(row?.data) ? row.data as any[] : [];
      };
      const currentArray = async (resource: string): Promise<any[]> => {
        const operation: any = operationMap.get(resource);
        return operation ? operation.data : loadArray(resource);
      };
      const bankOperation: any = operationMap.get('bankLedgerEntries');
      const previousBankEntries = await loadArray('bankLedgerEntries');
      const bankError = validateBankLedgerSync({
        previous: previousBankEntries,
        incoming: bankOperation.data,
        bankAccounts: await currentArray('bankAccounts') as any[],
        invoices: await currentArray('invoices'),
        supplierPayments: await currentArray('supplierPayments'),
        purchaseInvoices: await currentArray('purchaseInvoices'),
        expenses: await currentArray('expenses'),
        treasury: await currentArray('treasury'),
        partners: await currentArray('partners'),
        partnerWithdrawals: await currentArray('partnerWithdrawals'),
        partnerCurrentAccountTransactions: await currentArray('partnerCurrentAccountTransactions'),
        partnerSettlementPayments: await currentArray('partnerSettlementPayments'),
        partnerExitSettlements: await currentArray('partnerExitSettlements'),
        cardSettlements: await currentArray('cardSettlements'),
        cheques: await currentArray('cheques'),
      }, true);
      if (bankError) await rejectResourceGroup(
        ['bankLedgerEntries', 'treasury', 'partnerCurrentAccountTransactions', 'cheques', 'auditLog', 'invoices', 'supplierPayments', 'purchaseInvoices', 'expenses', 'partnerWithdrawals', 'partnerSettlementPayments', 'partnerExitSettlements', 'cardSettlements', 'partners'],
        bankError.code,
        'تم عزل الحركة البنكية والسجلات المرتبطة بها بسبب عدم تطابقها، مع استمرار الحركات المستقلة.',
        bankError.recordIds,
        bankError.relatedGroupIds,
      );
    }

    phase = 'partner_current_account_validation';
    const partnerCurrentAccountOperation: any = operations.find((op: any) => op.resource === 'partnerCurrentAccountTransactions');
    if (partnerCurrentAccountOperation) {
      const previousRow = await getOne(tenant, 'partnerCurrentAccountTransactions');
      const previous = Array.isArray(previousRow?.data) ? previousRow.data as any[] : [];
      const operationMap = new Map(operations.map((op: any) => [op.resource, op]));
      const loadArray = async (resource: string): Promise<any[]> => {
        const row = await getOne(tenant, resource);
        return Array.isArray(row?.data) ? row.data as any[] : [];
      };
      const currentArray = async (resource: string): Promise<any[]> => {
        const operation: any = operationMap.get(resource);
        return operation ? operation.data : loadArray(resource);
      };
      const currentAccountError = validatePartnerCurrentAccountSync({
        previous,
        incoming: partnerCurrentAccountOperation.data,
        partners: await currentArray('partners') as any[],
        bankAccounts: await currentArray('bankAccounts') as any[],
        treasury: await currentArray('treasury') as any[],
        bankLedgerEntries: await currentArray('bankLedgerEntries') as any[],
        openingBalances: await currentArray('openingBalances') as any[],
      });
      if (currentAccountError === 'PARTNER_CURRENT_ACCOUNT_HISTORY_MODIFIED') {
        // A historical partner-current-account entry is immutable. Repair only the
        // protected historical rows from the server copy, then continue validating
        // and committing unrelated resources in this same sync batch.
        const incomingPca = Array.isArray(partnerCurrentAccountOperation.data) ? partnerCurrentAccountOperation.data : [];
        const previousById = new Map(previous.map((item: any) => [String(item.id), item]));
        const incomingById = new Map(incomingPca.map((item: any) => [String(item?.id), item]));
        const affected = previous.filter((old: any) => {
          const current: any = incomingById.get(String(old.id));
          return !current || JSON.stringify(current) !== JSON.stringify(old);
        });
        const affectedIds = new Set(affected.map((item: any) => String(item.id)));
        const protectedTreasuryIds = new Set(affected.map((item: any) => String(item.treasuryTransactionId || '')).filter(Boolean));
        const previousTreasury = await loadArray('treasury');
        const previousBankEntries = await loadArray('bankLedgerEntries');

        // Restore old PCA rows and reject deletion/modification, while preserving
        // newly-created rows so valid new movements can still be accepted.
        partnerCurrentAccountOperation.data = [
          ...incomingPca.filter((item: any) => !previousById.has(String(item?.id))),
          ...previous,
        ];

        const treasuryOperation: any = operationMap.get('treasury');
        if (treasuryOperation && Array.isArray(treasuryOperation.data)) {
          const protectedRows = previousTreasury.filter((item: any) =>
            protectedTreasuryIds.has(String(item.id)) || affectedIds.has(String(item.referenceId)));
          const protectedIds = new Set(protectedRows.map((item: any) => String(item.id)));
          treasuryOperation.data = [
            ...treasuryOperation.data.filter((item: any) =>
              !protectedIds.has(String(item?.id)) && !affectedIds.has(String(item?.referenceId))),
            ...protectedRows,
          ];
        }

        const bankOperation: any = operationMap.get('bankLedgerEntries');
        if (bankOperation && Array.isArray(bankOperation.data)) {
          const protectedRows = previousBankEntries.filter((item: any) =>
            affectedIds.has(String(item.batchId)) || affectedIds.has(String(item.reference)));
          const protectedIds = new Set(protectedRows.map((item: any) => String(item.id)));
          bankOperation.data = [
            ...bankOperation.data.filter((item: any) =>
              !protectedIds.has(String(item?.id))
              && !affectedIds.has(String(item?.batchId))
              && !affectedIds.has(String(item?.reference))),
            ...protectedRows,
          ];
        }

        const repairedCurrentAccountError = validatePartnerCurrentAccountSync({
          previous,
          incoming: partnerCurrentAccountOperation.data,
          partners: await currentArray('partners') as any[],
          bankAccounts: await currentArray('bankAccounts') as any[],
          treasury: await currentArray('treasury') as any[],
          bankLedgerEntries: await currentArray('bankLedgerEntries') as any[],
          openingBalances: await currentArray('openingBalances') as any[],
        });
        if (repairedCurrentAccountError) await rejectResourceGroup(['partnerCurrentAccountTransactions', 'treasury', 'bankLedgerEntries'], repairedCurrentAccountError, 'تم عزل مجموعة جاري الشريك والحركات المرتبطة بها بعد فشل التحقق من الحركة الجديدة.');

        const actorName = String(employee.name || employee.employeeName || employee.username || employee.id || 'موظف غير محدد').slice(0, 120);
        const warning = {
          code: currentAccountError,
          resource: 'partnerCurrentAccountTransactions',
          actor: { employeeId: String(employee.id || '').slice(0, 120), employeeName: actorName, username: String(employee.username || '').slice(0, 80), role: String(employee.role || '').slice(0, 80) },
          affectedRecordIds: [...affectedIds].slice(0, 50),
          traceId,
          message: 'تم رفض تعديل/حذف حركة تاريخية في جاري الشريك واستعادة النسخة المعتمدة من الخادم. استمرت مزامنة باقي البيانات.',
        };
        syncWarnings.push(warning);
        console.warn('[MALVIA_LEDGER_HISTORY_RESTORED]', warning);
      } else if (currentAccountError) await rejectResourceGroup(['partnerCurrentAccountTransactions', 'treasury', 'bankLedgerEntries'], currentAccountError, 'تم عزل مجموعة جاري الشريك والخزينة والبنك المرتبطة لعدم تطابقها، واستمرت مزامنة الموارد المستقلة.');
    }

    phase = 'opening_balance_validation';
    const openingOperation: any = operations.find((op: any) => op.resource === 'openingBalances');
    if (openingOperation) openingValidation: {
      if (!owner) return res.status(403).json({ code: 'OPENING_BALANCE_OWNER_ONLY', resource: 'openingBalances', error: 'تهيئة الأرصدة الافتتاحية متاحة للمالك فقط.', diagnostic: { traceId, phase, resource: 'openingBalances', operationCount: operationResources.length, errorName: 'PermissionError', errorCode: 'OPENING_BALANCE_OWNER_ONLY' } });
      const previousRow = await getOne(tenant, 'openingBalances');
      const previous = Array.isArray(previousRow?.data) ? previousRow.data as any[] : [];
      const incoming = openingOperation.data;
      if (!Array.isArray(incoming) || incoming.length > 1 || (previous.length > 0 && JSON.stringify(previous) !== JSON.stringify(incoming))) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_IMMUTABLE', 'سجل الأرصدة الافتتاحية موجود بالفعل ولا يسمح باستبداله أو حذفه.'); break openingValidation; }
      if (incoming.length === 1) {
        const record = incoming[0];
        if (!record || record.status !== 'approved' || !record.id || String(record.cutoverDate || '').length !== 10 || String(record.cutoverDate)[4] !== '-' || String(record.cutoverDate)[7] !== '-' || !Number.isFinite(record.originalCapital) || record.originalCapital < 0 || !Array.isArray(record.lines) || !Array.isArray(record.partners)) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_INVALID', 'بيانات الأرصدة الافتتاحية غير صالحة.'); break openingValidation; }
        const lineIds = new Set<string>();
        for (const line of record.lines) {
          if (!line || !line.id || lineIds.has(String(line.id)) || !String(line.label || '').trim() || !Number.isFinite(line.amount) || line.amount < 0) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_LINE_INVALID', 'أحد بنود الأرصدة الافتتاحية غير صالح أو مكرر.'); break openingValidation; }
          lineIds.add(String(line.id));
          if (line.category === 'bank') { const row = await getOne(tenant, 'bankAccounts'); const accounts = Array.isArray(row?.data) ? row.data as any[] : []; if (!line.bankAccountId || !accounts.some((a: any) => a.id === line.bankAccountId && a.active === true)) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_BANK_INVALID', 'الحساب البنكي غير موجود أو غير نشط.'); break openingValidation; } }
          if (line.category === 'inventory' && (line.partId !== undefined || line.quantity !== undefined || line.unitCost !== undefined)) { const partsRow = await getOne(tenant, 'parts'); const currentParts = Array.isArray(partsRow?.data) ? partsRow.data as any[] : []; if (!line.partId || !currentParts.some((part: any) => part.id === line.partId)) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_PART_MISSING', 'صنف المخزون التفصيلي غير موجود.'); break openingValidation; } }
          if (line.category === 'customer_receivable' || line.category === 'supplier_payable') { const resource = line.category === 'customer_receivable' ? 'customers' : 'suppliers'; const row = await getOne(tenant, resource); const list = Array.isArray(row?.data) ? row.data as any[] : []; if (!line.entityId || !list.some((item: any) => item.id === line.entityId)) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_ENTITY_INVALID', 'العميل أو المورد المرتبط غير موجود.'); break openingValidation; } }
          const hasInventoryDetail = line.partId !== undefined || line.quantity !== undefined || line.unitCost !== undefined;
          if (line.category === 'inventory' && hasInventoryDetail && (!line.partId || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost) || line.unitCost < 0 || Math.round(line.quantity * line.unitCost * 100) !== Math.round(line.amount * 100))) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_INVENTORY_INVALID', 'بيانات صنف المخزون الافتتاحي غير صالحة.'); break openingValidation; }
        }
        const shares = record.partners.reduce((sum: number, p: any) => sum + (Number.isFinite(p?.ownershipPercentage) ? p.ownershipPercentage : NaN), 0);
        if (record.partners.some((p: any) => !p.partnerId || !String(p.partnerName || '').trim() || !Number.isFinite(p.originalContribution) || p.originalContribution < 0 || !Number.isFinite(p.ownershipPercentage) || p.ownershipPercentage < 0 || p.ownershipPercentage > 100 || (p.currentAccountBalance !== undefined && !Number.isFinite(p.currentAccountBalance))) || (record.partners.length > 0 && Math.abs(shares - 100) > 0.01)) { await rejectResourceGroup(['openingBalances'], 'OPENING_BALANCE_PARTNERS_INVALID', 'بيانات الشركاء أو مجموع نسب الملكية غير صالحة.'); break openingValidation; }
      }
    }
    phase = 'finance_policy_validation';
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
        if (chequeError) await rejectResourceGroup(['cheques', 'treasury', 'bankLedgerEntries', 'auditLog'], chequeError, 'تم عزل مجموعة الشيك والحركات المرتبطة بها بسبب فشل التحقق.');
      }
      const auditOperation: any = operationMap.get('auditLog');
      const hasOtherAuditPermission = ['canSellPos', 'canManageInventory', 'canManagePurchases', 'canManageTreasury', 'canManageSettings', 'canManageExpenses', 'canManagePartners']
        .some(permission => permissions[permission] === true);
      if (auditOperation && !hasOtherAuditPermission &&
          (permissions.canRegisterCheques === true || permissions.canManageChequeLifecycle === true)) {
        if (!chequeOperation) { await rejectResourceGroup(['auditLog', 'cheques', 'treasury', 'bankLedgerEntries'], 'CHEQUE_AUDIT_STATE_REQUIRED', 'تم عزل سجل تدقيق الشيك لعدم وجود حالة الشيك المرتبطة به.'); }
        const previousAudit = await loadArray('auditLog');
        const auditError = validateChequeAuditSync({
          previous: previousAudit,
          incoming: auditOperation.data,
          previousCheques,
          incomingCheques,
          employee,
        });
        if (auditError) await rejectResourceGroup(['auditLog', 'cheques', 'treasury', 'bankLedgerEntries'], auditError, 'تم عزل سجل تدقيق الشيك والحالة المرتبطة به بسبب فشل التحقق.');
      }
      if (auditOperation && permissions.canReceivePurchases === true &&
          permissions.canManagePurchases !== true && !hasOtherAuditPermission) {
        const purchaseOperation: any = operationMap.get('purchaseInvoices');
        if (!purchaseOperation) {
          await rejectResourceGroup(['auditLog', 'purchaseInvoices', 'supplierPayments', 'treasury', 'bankLedgerEntries', 'parts', 'stockMovements'], 'PURCHASE_AUDIT_STATE_REQUIRED', 'تم عزل سجل استلام المشتريات لعدم وجود الفاتورة المرتبطة به.');
        } else {
          const previousAudit = await loadArray('auditLog');
          const previousInvoices = await loadArray('purchaseInvoices');
          const purchaseAuditError = validatePurchaseAuditSync({
            previousAudit,
            incomingAudit: auditOperation.data,
            previousInvoices,
            incomingInvoices: purchaseOperation.data,
            employee,
          });
          if (purchaseAuditError) await rejectResourceGroup(['auditLog', 'purchaseInvoices', 'supplierPayments', 'treasury', 'bankLedgerEntries', 'parts', 'stockMovements'], purchaseAuditError, 'تم عزل مجموعة استلام المشتريات وسجل التدقيق والمخزون المرتبط بها بسبب فشل التحقق.');
        }
      }

      if (permissions.canManageExpenses === true && permissions.canManageTreasury !== true &&
          permissions.canSellPos !== true && permissions.canManagePurchases !== true && permissions.canManagePartners !== true) {
        const expenseOperation: any = operationMap.get('expenses');
        const treasuryOperation: any = operationMap.get('treasury');
        if (expenseOperation || treasuryOperation) {
          if (!expenseOperation || !treasuryOperation) {
            await rejectResourceGroup(['expenses', 'treasury', 'bankLedgerEntries'], 'EXPENSE_TREASURY_MISMATCH', 'تم عزل المصروف والحركات المالية المرتبطة به لعدم اكتمال المجموعة.');
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
          if (expenseError) await rejectResourceGroup(['expenses', 'treasury', 'bankLedgerEntries'], expenseError, 'تم عزل مجموعة المصروف والحركات المالية المرتبطة بها بسبب فشل التحقق.');
        }
      }
      for (const resource of ['treasury', 'bankLedgerEntries']) {
        const operation: any = operationMap.get(resource);
        if (!operation || permissions.canManageChequeLifecycle !== true) continue;
        if (resource === 'bankLedgerEntries' && (permissions.canSellPos === true || permissions.canManagePurchases === true
          || permissions.canManageExpenses === true || permissions.canManagePartners === true)) continue;
        // POS/purchase operators already have the legacy workflow permission for treasury writes;
        // apply the narrow cheque-only rule only to lifecycle-only staff.
        if (resource === 'treasury' && (permissions.canSellPos === true || permissions.canManagePurchases === true)) continue;
        if (!chequeOperation) { await rejectResourceGroup([resource, 'cheques', 'treasury', 'bankLedgerEntries', 'auditLog'], 'CHEQUE_STATE_REQUIRED', 'تم عزل الحركة البنكية لعدم وجود حالة الشيك المرتبطة بها.'); continue; }
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
        if (error) await rejectResourceGroup(['cheques', resource, 'treasury', 'bankLedgerEntries', 'auditLog'], error, 'تم عزل مجموعة الشيك والحركة البنكية المرتبطة بها بسبب فشل التحقق.');
      }
    }
    phase = 'batch_size_and_hash';
    const serialized = JSON.stringify(req.body.operations);
    if (serialized.length > 5_000_000) return res.status(413).json({ code: 'SYNC_BATCH_TOO_LARGE', error: 'حجم دفعة المزامنة أكبر من الحد المسموح.' });
    const requestHash = createHash('sha256').update(serialized).digest('hex');
    phase = 'database_commit';
    resource = operationResources.join(',');
    const acceptedOperations = operations.filter((op: any) => !rejectedResources.has(op.resource));
    const reconciled = Object.fromEntries([...rejectedResources].map(name => [name, rejectedResourceData[name]]));
    for (const op of operations) if (['partnerCurrentAccountTransactions', 'treasury', 'bankLedgerEntries'].includes(op.resource)) reconciled[op.resource] = op.data;
    const durableRejections = syncWarnings.map((warning: any, index: number) => ({
      traceId: warning.traceId || traceId, actor: warning.actor || {}, resource: warning.resource || 'unknown',
      recordIds: Array.isArray(warning.affectedRecordIds) ? warning.affectedRecordIds : [],
      relatedGroupIds: Array.isArray(warning.relatedGroupIds) ? warning.relatedGroupIds : [],
      code: warning.code || 'SYNC_RECORD_REJECTED', message: warning.message || 'تم رفض حركة أثناء المزامنة.',
      warning,
      ...(Object.prototype.hasOwnProperty.call(rejectedResourceVersions, warning.resource) ? { version: rejectedResourceVersions[warning.resource] } : {}),
      ...(index === 0 ? { reconciled } : {}),
    }));
    const result = await commitSyncBatch(tenant, idempotencyKey, requestHash, acceptedOperations, durableRejections);
    if (result?.conflict) return res.status(409).json(result);
    return res.status(200).json({ ...result, ...(result?.warnings ? {} : syncWarnings.length ? { warnings: syncWarnings } : {}), ...(result?.reconciled ? {} : Object.keys(reconciled).length ? { reconciled } : {}) });
  } catch (error: any) {
    const errorName = error instanceof Error ? error.name : typeof error;
    const errorCode = typeof error?.code === 'string' || typeof error?.code === 'number' ? String(error.code).slice(0, 80) : undefined;
    // Never log request bodies, employee records, credentials, session tokens, or database values.
    console.error('[MALVIA_SYNC_BATCH_DIAGNOSTIC]', {
      traceId,
      phase,
      resource: resource || operationResources.join(',') || undefined,
      operationCount: operationResources.length,
      method: String(req.method || '').slice(0, 12),
      errorName,
      errorCode,
    });
    res.setHeader?.('x-malvia-trace-id', traceId);
    if (ApiErrorClass && error instanceof ApiErrorClass && sendErrorFn) {
      return sendErrorFn(res, error);
    }
    return res.status(500).json({
      error: 'خطأ داخلي في الخادم',
      code: 'INTERNAL',
      diagnostic: {
        traceId,
        phase,
        resource: resource || operationResources.join(',') || 'unknown',
        operationCount: operationResources.length,
        errorName,
        errorCode: errorCode || 'NO_CODE',
      },
    });
  }
}
