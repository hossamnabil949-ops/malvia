/**
 * Server-side collection guard for cheque sync. The legacy sync endpoint writes whole
 * resource arrays, so cashier registration must be append-only and lifecycle edits
 * must be narrowly validated before the database write.
 */
type ChequeRecord = Record<string, any>;

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
  'outgoing:صادر': ['مصروف', 'مرتد', 'ملغي'],
};

export function validateChequeCollectionSync(
  previous: ChequeRecord[],
  incoming: ChequeRecord[],
  employee: { name?: string },
  permissions: Record<string, unknown>,
): string | null {
  const canRegister = permissions.canRegisterCheques === true || permissions.canManageTreasury === true;
  const canManage = permissions.canManageChequeLifecycle === true || permissions.canManageTreasury === true;
  const oldById = new Map(previous.map(item => [String(item.id), item]));
  const newById = new Map(incoming.map(item => [String(item.id), item]));

  // No cheque may be deleted by a staff collection replacement.
  for (const oldItem of previous) {
    if (!newById.has(String(oldItem.id))) return 'CHEQUE_DELETE_DENIED';
  }

  for (const item of incoming) {
    if (!item || typeof item !== 'object' || !String(item.id || '').trim()) return 'CHEQUE_INVALID';
    const oldItem = oldById.get(String(item.id));
    if (!oldItem) {
      if (!canRegister) return 'CHEQUE_REGISTER_DENIED';
      const expectedStatus = item.direction === 'incoming' ? 'في الحافظة' : item.direction === 'outgoing' ? 'صادر' : '';
      if (!expectedStatus || item.status !== expectedStatus || !(Number(item.amount) > 0) ||
          !String(item.number || '').trim() || !String(item.bankName || '').trim() ||
          !String(item.partyId || '').trim() || !Array.isArray(item.history) || item.history.length !== 1 ||
          item.history[0]?.status !== expectedStatus || item.clearedBankAccountId) return 'CHEQUE_INVALID';
      if (employee.name && item.createdBy !== employee.name) return 'CHEQUE_ACTOR_MISMATCH';
      continue;
    }

    if (same(oldItem, item)) continue;
    if (!canManage) return 'CHEQUE_LIFECYCLE_DENIED';

    const oldStatus = String(oldItem.status || '');
    const nextStatus = String(item.status || '');
    if (!(NEXT[`${oldItem.direction}:${oldStatus}`] || []).includes(nextStatus)) return 'CHEQUE_TRANSITION_INVALID';

    const oldImmutable = { ...oldItem };
    const newImmutable = { ...item };
    for (const key of ['status', 'history', 'clearedBankAccountId']) {
      delete oldImmutable[key];
      delete newImmutable[key];
    }
    if (!same(oldImmutable, newImmutable)) return 'CHEQUE_IMMUTABLE_FIELDS_CHANGED';

    const oldHistory = Array.isArray(oldItem.history) ? oldItem.history : [];
    const newHistory = Array.isArray(item.history) ? item.history : [];
    if (newHistory.length !== oldHistory.length + 1 || newHistory[newHistory.length - 1]?.status !== nextStatus) {
      return 'CHEQUE_HISTORY_INVALID';
    }
    if (nextStatus === 'محصّل' || nextStatus === 'مصروف') {
      if (!String(item.clearedBankAccountId || '').trim()) return 'CHEQUE_BANK_ACCOUNT_REQUIRED';
    } else if (item.clearedBankAccountId) {
      return 'CHEQUE_BANK_ACCOUNT_INVALID';
    }
  }
  return null;
}
