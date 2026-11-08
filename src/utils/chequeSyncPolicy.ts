/**
 * Server-side collection guard for cheque sync. The legacy sync endpoint writes whole
 * resource arrays, so cashier registration must be append-only and lifecycle edits
 * must be narrowly validated before the database write.
 */
type ChequeRecord = Record<string, any>;
export interface ChequeSyncFailure {
  code: string;
  recordIds: string[];
  relatedGroupIds: string[];
}
const chequeFailure = (detailed: boolean, code: string, records: ChequeRecord[] = []): string | ChequeSyncFailure => detailed ? {
  code,
  recordIds: [...new Set(records.map(item => String(item?.id || '')).filter(Boolean))].slice(0, 100),
  relatedGroupIds: [...new Set(records.flatMap(item => [item?.batchId, item?.referenceId, item?.entityId, item?.settlementId, item?.relatedTransactionId].filter(Boolean).map(String)))].slice(0, 100),
} : code;

const stable = (value: any): any => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
};
const same = (a: any, b: any): boolean => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

const NEXT: Record<string, string[]> = {
  'incoming:في الحافظة': ['مودع بالبنك', 'محصّل', 'مرتد', 'ملغي'],
  'incoming:مودع بالبنك': ['محصّل', 'مرتد'],
  'incoming:محصّل': ['مرتد'],
  'outgoing:صادر': ['مصروف', 'مرتد', 'ملغي'],
  'outgoing:مصروف': ['مرتد'],
};

export function validateChequeCollectionSync(previous: ChequeRecord[], incoming: ChequeRecord[], employee: { name?: string }, permissions: Record<string, unknown>): string | null;
export function validateChequeCollectionSync(previous: ChequeRecord[], incoming: ChequeRecord[], employee: { name?: string }, permissions: Record<string, unknown>, detailed: true): ChequeSyncFailure | null;
export function validateChequeCollectionSync(
  previous: ChequeRecord[], incoming: ChequeRecord[], employee: { name?: string }, permissions: Record<string, unknown>, detailed = false,
): string | ChequeSyncFailure | null {
  const canRegister = permissions.canRegisterCheques === true || permissions.canManageTreasury === true;
  const canManage = permissions.canManageChequeLifecycle === true || permissions.canManageTreasury === true;
  const oldById = new Map(previous.map(item => [String(item.id), item]));
  const newById = new Map(incoming.map(item => [String(item.id), item]));

  // No cheque may be deleted by a staff collection replacement.
  for (const oldItem of previous) {
    if (!newById.has(String(oldItem.id))) return chequeFailure(detailed, 'CHEQUE_DELETE_DENIED', [oldItem]);
  }

  for (const item of incoming) {
    if (!item || typeof item !== 'object' || !String(item.id || '').trim()) return chequeFailure(detailed, 'CHEQUE_INVALID', [item]);
    const oldItem = oldById.get(String(item.id));
    if (!oldItem) {
      if (!canRegister) return chequeFailure(detailed, 'CHEQUE_REGISTER_DENIED', [item]);
      const expectedStatus = item.direction === 'incoming' ? 'في الحافظة' : item.direction === 'outgoing' ? 'صادر' : '';
      if (!expectedStatus || item.status !== expectedStatus || !(Number(item.amount) > 0) ||
          !String(item.number || '').trim() || !String(item.bankName || '').trim() ||
          !String(item.partyId || '').trim() || !Array.isArray(item.history) || item.history.length !== 1 ||
          item.history[0]?.status !== expectedStatus || item.clearedBankAccountId) return chequeFailure(detailed, 'CHEQUE_INVALID', [item]);
      if (employee.name && item.createdBy !== employee.name) return chequeFailure(detailed, 'CHEQUE_ACTOR_MISMATCH', [item]);
      continue;
    }

    if (same(oldItem, item)) continue;
    if (!canManage) return chequeFailure(detailed, 'CHEQUE_LIFECYCLE_DENIED', [item]);

    const oldStatus = String(oldItem.status || '');
    const nextStatus = String(item.status || '');
    if (!(NEXT[`${oldItem.direction}:${oldStatus}`] || []).includes(nextStatus)) return chequeFailure(detailed, 'CHEQUE_TRANSITION_INVALID', [item]);

    const oldImmutable = { ...oldItem };
    const newImmutable = { ...item };
    for (const key of ['status', 'history', 'clearedBankAccountId']) {
      delete oldImmutable[key];
      delete newImmutable[key];
    }
    if (!same(oldImmutable, newImmutable)) return chequeFailure(detailed, 'CHEQUE_IMMUTABLE_FIELDS_CHANGED', [item]);

    const oldHistory = Array.isArray(oldItem.history) ? oldItem.history : [];
    const newHistory = Array.isArray(item.history) ? item.history : [];
    if (newHistory.length !== oldHistory.length + 1 || newHistory[newHistory.length - 1]?.status !== nextStatus) {
      return chequeFailure(detailed, 'CHEQUE_HISTORY_INVALID', [item]);
    }
    if (oldItem.clearedBankAccountId && item.clearedBankAccountId !== oldItem.clearedBankAccountId) {
      return chequeFailure(detailed, 'CHEQUE_BANK_ACCOUNT_IMMUTABLE', [item]);
    }
    if (nextStatus === 'محصّل' || nextStatus === 'مصروف') {
      if (!String(item.clearedBankAccountId || '').trim()) return chequeFailure(detailed, 'CHEQUE_BANK_ACCOUNT_REQUIRED', [item]);
    } else if (nextStatus === 'مرتد' && (oldStatus === 'محصّل' || oldStatus === 'مصروف')) {
      if (!String(item.clearedBankAccountId || '').trim()) return chequeFailure(detailed, 'CHEQUE_BANK_ACCOUNT_REQUIRED', [item]);
    } else if (item.clearedBankAccountId) {
      return chequeFailure(detailed, 'CHEQUE_BANK_ACCOUNT_INVALID', [item]);
    }
  }
  return null;
}

type ChequeAuxiliaryInput = { resource: 'treasury' | 'bankLedgerEntries'; previous: ChequeRecord[]; incoming: ChequeRecord[]; previousCheques: ChequeRecord[]; incomingCheques: ChequeRecord[]; bankAccounts: ChequeRecord[]; employee: { name?: string } };
export function validateChequeAuxiliarySync(input: ChequeAuxiliaryInput): string | null;
export function validateChequeAuxiliarySync(input: ChequeAuxiliaryInput, detailed: true): ChequeSyncFailure | null;
export function validateChequeAuxiliarySync(input: ChequeAuxiliaryInput, detailed = false): string | ChequeSyncFailure | null {
  const oldById = new Map(input.previous.map(item => [String(item.id), item]));
  const newById = new Map(input.incoming.map(item => [String(item.id), item]));
  for (const oldItem of input.previous) {
    const next = newById.get(String(oldItem.id));
    if (!next || !same(oldItem, next)) return chequeFailure(detailed, 'CHEQUE_AUXILIARY_UPDATE_DENIED', [oldItem]);
  }
  const oldCheques = new Map(input.previousCheques.map(item => [String(item.id), item]));
  const newCheques = new Map(input.incomingCheques.map(item => [String(item.id), item]));
  const accounts = new Map(input.bankAccounts.map(item => [String(item.id), item]));
  for (const item of input.incoming) {
    if (oldById.has(String(item.id))) continue;
    const chequeId = input.resource === 'treasury' ? String(item.referenceId || '') : String(item.batchId || '');
    const cheque = newCheques.get(chequeId);
    const previousCheque = oldCheques.get(chequeId);
    if (!cheque || !previousCheque) return chequeFailure(detailed, 'CHEQUE_REFERENCE_INVALID', [item]);
    const expectedStatus = cheque.direction === 'incoming' ? 'محصّل' : 'مصروف';
    const previousClearedStatus = cheque.direction === 'incoming' ? 'محصّل' : 'مصروف';
    const bouncedAfterClear = cheque.status === 'مرتد' && previousCheque.status === previousClearedStatus;
    const oldOpen = cheque.direction === 'incoming'
      ? ['في الحافظة', 'مودع بالبنك'].includes(String(previousCheque.status))
      : previousCheque.status === 'صادر';
    if ((!bouncedAfterClear && (!oldOpen || cheque.status !== expectedStatus)) || !(Number(cheque.amount) > 0)) {
      return chequeFailure(detailed, 'CHEQUE_STATE_INVALID', [item]);
    }
    if (input.resource === 'treasury' && input.employee.name && item.recordedBy !== input.employee.name) return chequeFailure(detailed, 'CHEQUE_ACTOR_MISMATCH', [item]);
    if (input.resource === 'treasury') {
      const expectedType = bouncedAfterClear
        ? (cheque.direction === 'incoming' ? 'صرف' : 'قبض')
        : (cheque.direction === 'incoming' ? 'قبض' : 'صرف');
      const expectedCategory = bouncedAfterClear
        ? (cheque.direction === 'incoming' ? 'ارتداد شيك وارد' : 'ارتداد شيك صادر')
        : (cheque.direction === 'incoming' ? 'تحصيل من عميل / ورشة' : 'سداد دفعة لمورد');
      if (!String(item.id || '').startsWith('TX-CHQ-') || item.type !== expectedType ||
          item.category !== expectedCategory || item.paymentMethod !== 'شيك (حساب بنكي)' ||
          Number(item.amount) !== Number(cheque.amount)) return chequeFailure(detailed, 'CHEQUE_TREASURY_ENTRY_INVALID', [item]);
    } else {
      const account = accounts.get(String(item.bankAccountId || ''));
      if (bouncedAfterClear) {
        const original = input.previous.find(entry => entry.id === 'cheque:' + chequeId);
        if (item.id !== 'cheque-bounce:' + chequeId || item.batchId !== chequeId ||
            item.accountKind !== 'bank' || item.direction !== (cheque.direction === 'incoming' ? 'out' : 'in') ||
            Number(item.amount) !== Number(cheque.amount) ||
            item.bankAccountId !== cheque.clearedBankAccountId || !original ||
            original.bankAccountId !== item.bankAccountId || !account || account.active !== true) {
          return chequeFailure(detailed, 'CHEQUE_BANK_REVERSAL_INVALID', [item]);
        }
      } else if (item.id !== 'cheque:' + chequeId || item.batchId !== chequeId ||
          item.accountKind !== 'bank' || item.direction !== (cheque.direction === 'incoming' ? 'in' : 'out') ||
          Number(item.amount) !== Number(cheque.amount) ||
          item.bankAccountId !== cheque.clearedBankAccountId || !account || account.active !== true) {
        return chequeFailure(detailed, 'CHEQUE_BANK_ENTRY_INVALID', [item]);
      }
    }
  }
  return null;
}

type ChequeAuditInput = { previous: ChequeRecord[]; incoming: ChequeRecord[]; previousCheques: ChequeRecord[]; incomingCheques: ChequeRecord[]; employee: { name?: string } };
export function validateChequeAuditSync(input: ChequeAuditInput): string | null;
export function validateChequeAuditSync(input: ChequeAuditInput, detailed: true): ChequeSyncFailure | null;
export function validateChequeAuditSync(input: ChequeAuditInput, detailed = false): string | ChequeSyncFailure | null {
  const oldById = new Map(input.previous.map(item => [String(item.id), item]));
  const newById = new Map(input.incoming.map(item => [String(item.id), item]));
  for (const oldItem of input.previous) {
    const next = newById.get(String(oldItem.id));
    if (!next || !same(oldItem, next)) return chequeFailure(detailed, 'CHEQUE_AUDIT_UPDATE_DENIED', [oldItem]);
  }
  const oldCheques = new Map(input.previousCheques.map(item => [String(item.id), item]));
  const newCheques = new Map(input.incomingCheques.map(item => [String(item.id), item]));
  for (const item of input.incoming) {
    if (oldById.has(String(item.id))) continue;
    if (input.employee.name && item.userName !== input.employee.name) return chequeFailure(detailed, 'CHEQUE_AUDIT_ACTOR_MISMATCH', [item]);
    const id = String(item.entityId || '');
    const oldCheque = oldCheques.get(id);
    const newCheque = newCheques.get(id);
    if (!newCheque) return chequeFailure(detailed, 'CHEQUE_AUDIT_REFERENCE_INVALID', [item]);
    if (item.action === 'cheque.create') {
      if (oldCheque || newCheque.createdBy !== input.employee.name || newCheque.status !== (newCheque.direction === 'incoming' ? 'في الحافظة' : 'صادر')) {
        return chequeFailure(detailed, 'CHEQUE_AUDIT_CREATE_INVALID', [item]);
      }
    } else if (item.action === 'cheque.action') {
      if (!oldCheque || oldCheque.status === newCheque.status ||
          newCheque.history?.[newCheque.history.length - 1]?.by !== input.employee.name) return chequeFailure(detailed, 'CHEQUE_AUDIT_ACTION_INVALID', [item]);
    } else {
      return chequeFailure(detailed, 'CHEQUE_AUDIT_ACTION_INVALID', [item]);
    }
  }
  return null;
}

type ExpenseOnlyInput = { previousExpenses: ChequeRecord[]; incomingExpenses: ChequeRecord[]; previousTreasury: ChequeRecord[]; incomingTreasury: ChequeRecord[]; employee: { name?: string } };
export function validateExpenseOnlySync(input: ExpenseOnlyInput): string | null;
export function validateExpenseOnlySync(input: ExpenseOnlyInput, detailed: true): ChequeSyncFailure | null;
export function validateExpenseOnlySync(input: ExpenseOnlyInput, detailed = false): string | ChequeSyncFailure | null {
  const expenseHistoryFailure = input.previousExpenses.find(oldItem => {
    const next = input.incomingExpenses.find(item => String(item.id) === String(oldItem.id));
    return !next || !same(oldItem, next);
  });
  if (expenseHistoryFailure) return chequeFailure(detailed, 'EXPENSE_ONLY_UPDATE_DENIED', [expenseHistoryFailure]);
  const treasuryHistoryFailure = input.previousTreasury.find(oldItem => {
    const next = input.incomingTreasury.find(item => String(item.id) === String(oldItem.id));
    return !next || !same(oldItem, next);
  });
  if (treasuryHistoryFailure) return chequeFailure(detailed, 'EXPENSE_ONLY_UPDATE_DENIED', [treasuryHistoryFailure]);

  const oldExpenseIds = new Set(input.previousExpenses.map(item => String(item.id)));
  const newExpenses = input.incomingExpenses.filter(item => !oldExpenseIds.has(String(item.id)));
  const oldTreasuryIds = new Set(input.previousTreasury.map(item => String(item.id)));
  const newTransactions = input.incomingTreasury.filter(item => !oldTreasuryIds.has(String(item.id)));
  if (newExpenses.length !== newTransactions.length) {
    return chequeFailure(detailed, 'EXPENSE_TREASURY_MISMATCH', newExpenses.length > newTransactions.length ? newExpenses : newTransactions);
  }

  for (const expense of newExpenses) {
    const tx = newTransactions.find(item => item.referenceId === expense.id);
    if (!tx || !String(expense.id || '').trim() || !(Number(expense.amount) > 0) ||
        !String(expense.title || '').trim() || !String(expense.date || '').trim() ||
        (input.employee.name && expense.recordedBy !== input.employee.name) ||
        tx.type !== 'صرف' || tx.category !== 'مصروفات تشغيلية' ||
        tx.paymentMethod !== expense.paymentMethod || Number(tx.amount) !== Number(expense.amount) ||
        tx.date !== expense.date || tx.recordedBy !== expense.recordedBy ||
        !String(tx.id || '').startsWith('TX-EXP-')) return chequeFailure(detailed, 'EXPENSE_TREASURY_MISMATCH', tx ? [expense, tx] : [expense]);
  }
  return null;
}

type PurchaseAuditInput = { previousAudit: ChequeRecord[]; incomingAudit: ChequeRecord[]; previousInvoices: ChequeRecord[]; incomingInvoices: ChequeRecord[]; employee: { name?: string } };
export function validatePurchaseAuditSync(input: PurchaseAuditInput): string | null;
export function validatePurchaseAuditSync(input: PurchaseAuditInput, detailed: true): ChequeSyncFailure | null;
export function validatePurchaseAuditSync(input: PurchaseAuditInput, detailed = false): string | ChequeSyncFailure | null {
  const oldById = new Map(input.previousAudit.map(item => [String(item.id), item]));
  const newById = new Map(input.incomingAudit.map(item => [String(item.id), item]));
  for (const oldItem of input.previousAudit) {
    const next = newById.get(String(oldItem.id));
    if (!next || !same(oldItem, next)) return chequeFailure(detailed, 'PURCHASE_AUDIT_UPDATE_DENIED', [oldItem]);
  }
  const oldInvoices = new Map(input.previousInvoices.map(item => [String(item.id), item]));
  const newInvoices = new Map(input.incomingInvoices.map(item => [String(item.id), item]));
  for (const item of input.incomingAudit) {
    if (oldById.has(String(item.id))) continue;
    if (item.action !== 'purchase.create' || (input.employee.name && item.userName !== input.employee.name)) {
      return chequeFailure(detailed, 'PURCHASE_AUDIT_ACTION_INVALID', [item]);
    }
    const id = String(item.entityId || '');
    const invoice = newInvoices.get(id);
    if (!invoice || oldInvoices.has(id) || Number(item.amount) !== Number(invoice.grandTotal)) {
      return chequeFailure(detailed, 'PURCHASE_AUDIT_REFERENCE_INVALID', [item]);
    }
  }
  return null;
}
