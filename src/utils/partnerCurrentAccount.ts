import type {
  Partner,
  PartnerCurrentAccountTransaction,
  PartnerCurrentAccountMovementType,
  TreasuryTransaction,
} from '../types/autoParts';
import type { BankAccount, BankLedgerEntry } from './bankLedger';
import type { OpeningBalanceRecord } from './openingBalanceLogic';
import { paymentAccountOf } from './paymentMethods';

export const PARTNER_CURRENT_ACCOUNT_CATEGORIES: Record<PartnerCurrentAccountMovementType, TreasuryTransaction['category']> = {
  partner_deposit: 'جاري شركاء - إيداع من شريك',
  partner_withdrawal: 'جاري شركاء - سحب شريك',
  partner_repayment: 'جاري شركاء - رد الشريك للمبلغ المسحوب',
  company_repayment: 'جاري شركاء - سداد المنشأة للشريك',
};

export const partnerCurrentAccountCashDirection = (type: PartnerCurrentAccountMovementType): 'in' | 'out' =>
  type === 'partner_deposit' || type === 'partner_repayment' ? 'in' : 'out';

export const partnerCurrentAccountBalanceEffect = (type: PartnerCurrentAccountMovementType): number =>
  type === 'partner_deposit' || type === 'partner_repayment' ? 1 : -1;

export const isPartnerCurrentAccountSettlement = (type: PartnerCurrentAccountMovementType): boolean =>
  type === 'partner_repayment' || type === 'company_repayment';

export const partnerCurrentAccountOpeningId = (partnerId: string): string => `OPENING:${partnerId}`;

export function openingPartnerCurrentAccountBalance(
  partnerId: string,
  openingBalances: OpeningBalanceRecord[] = [],
): number {
  const record = openingBalances.find(item => item.status === 'approved');
  return Number(record?.partners.find(item => item.partnerId === partnerId)?.currentAccountBalance || 0);
}

export function getPartnerCurrentAccountBalance(
  partnerId: string,
  transactions: PartnerCurrentAccountTransaction[] = [],
  openingBalances: OpeningBalanceRecord[] = [],
): number {
  const opening = openingPartnerCurrentAccountBalance(partnerId, openingBalances);
  return Number((opening + transactions
    .filter(item => item.partnerId === partnerId)
    .reduce((sum, item) => sum + item.amount * partnerCurrentAccountBalanceEffect(item.type), 0)).toFixed(2));
}

export interface PartnerCurrentAccountOrigin {
  id: string;
  label: string;
  amount: number;
  remainingAmount: number;
  date: string;
  paymentMethod: string;
  bankAccountId?: string;
}

export function getOpenPartnerCurrentAccountOrigins(
  partnerId: string,
  settlementType: 'partner_repayment' | 'company_repayment',
  transactions: PartnerCurrentAccountTransaction[] = [],
  openingBalances: OpeningBalanceRecord[] = [],
): PartnerCurrentAccountOrigin[] {
  const originType = settlementType === 'partner_repayment' ? 'partner_withdrawal' : 'partner_deposit';
  const origins: PartnerCurrentAccountOrigin[] = transactions
    .filter(item => item.partnerId === partnerId && item.type === originType)
    .map(item => {
      const settled = transactions
        .filter(candidate => candidate.relatedTransactionId === item.id)
        .reduce((sum, candidate) => sum + candidate.amount, 0);
      return {
        id: item.id,
        label: `${item.type === 'partner_withdrawal' ? 'سحب شريك' : 'إيداع شريك'} — ${item.date} — ${item.amount.toLocaleString()} ج.م`,
        amount: item.amount,
        remainingAmount: Math.max(0, Number((item.amount - settled).toFixed(2))),
        date: item.date,
        paymentMethod: String(item.paymentMethod),
        bankAccountId: item.bankAccountId,
      };
    })
    .filter(item => item.remainingAmount > 0.005);

  const opening = openingPartnerCurrentAccountBalance(partnerId, openingBalances);
  const openingMatches = settlementType === 'partner_repayment' ? opening < 0 : opening > 0;
  if (openingMatches) {
    const id = partnerCurrentAccountOpeningId(partnerId);
    const settled = transactions.filter(item => item.relatedTransactionId === id)
      .reduce((sum, item) => sum + item.amount, 0);
    const amount = Math.abs(opening);
    const remainingAmount = Math.max(0, Number((amount - settled).toFixed(2)));
    if (remainingAmount > 0.005) origins.unshift({
      id,
      label: `رصيد جاري افتتاحي — ${amount.toLocaleString()} ج.م`,
      amount,
      remainingAmount,
      date: openingBalances.find(item => item.status === 'approved')?.cutoverDate || '',
      paymentMethod: '',
    });
  }
  return origins;
}

export type PartnerCurrentAccountSyncError =
  | 'PARTNER_CURRENT_ACCOUNT_NOT_ARRAY'
  | 'PARTNER_CURRENT_ACCOUNT_HISTORY_MODIFIED'
  | 'PARTNER_CURRENT_ACCOUNT_ENTRY_INVALID'
  | 'PARTNER_CURRENT_ACCOUNT_PARTNER_INVALID'
  | 'PARTNER_CURRENT_ACCOUNT_METHOD_INVALID'
  | 'PARTNER_CURRENT_ACCOUNT_BANK_INVALID'
  | 'PARTNER_CURRENT_ACCOUNT_TREASURY_MISMATCH'
  | 'PARTNER_CURRENT_ACCOUNT_BANK_MISMATCH'
  | 'PARTNER_CURRENT_ACCOUNT_ORIGIN_INVALID'
  | 'PARTNER_CURRENT_ACCOUNT_OVERPAID';

const validDate = (value: unknown): boolean =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function validatePartnerCurrentAccountSync(input: {
  previous: PartnerCurrentAccountTransaction[];
  incoming: PartnerCurrentAccountTransaction[];
  partners: Partner[];
  bankAccounts: BankAccount[];
  treasury: TreasuryTransaction[];
  bankLedgerEntries: BankLedgerEntry[];
  openingBalances: OpeningBalanceRecord[];
}): PartnerCurrentAccountSyncError | null {
  const { previous, incoming, partners, bankAccounts, treasury, bankLedgerEntries, openingBalances } = input;
  if (!Array.isArray(previous) || !Array.isArray(incoming)) return 'PARTNER_CURRENT_ACCOUNT_NOT_ARRAY';
  const previousById = new Map(previous.map(item => [item.id, item]));
  const incomingById = new Map(incoming.map(item => [item.id, item]));
  if (incomingById.size !== incoming.length) return 'PARTNER_CURRENT_ACCOUNT_ENTRY_INVALID';
  for (const old of previous) {
    const current = incomingById.get(old.id);
    if (!current || !same(current, old)) return 'PARTNER_CURRENT_ACCOUNT_HISTORY_MODIFIED';
  }

  const activeBankIds = new Set(bankAccounts.filter(item => item.active).map(item => item.id));
  const added = incoming.filter(item => !previousById.has(item.id));
  for (const item of added) {
    if (!item.id || !item.partnerId || !item.partnerName?.trim() || !item.treasuryTransactionId
      || !Number.isFinite(item.amount) || item.amount <= 0 || !validDate(item.date)
      || !item.recordedBy?.trim() || !validDate(item.createdAt?.slice(0, 10))) return 'PARTNER_CURRENT_ACCOUNT_ENTRY_INVALID';
    if (!partners.some(partner => partner.id === item.partnerId)) return 'PARTNER_CURRENT_ACCOUNT_PARTNER_INVALID';

    let account: string;
    try { account = paymentAccountOf(String(item.paymentMethod || '')); }
    catch { return 'PARTNER_CURRENT_ACCOUNT_METHOD_INVALID'; }
    if (!['cash', 'bank', 'wallet'].includes(account)) return 'PARTNER_CURRENT_ACCOUNT_METHOD_INVALID';
    if (account === 'bank') {
      if (!item.bankAccountId || !activeBankIds.has(item.bankAccountId)) return 'PARTNER_CURRENT_ACCOUNT_BANK_INVALID';
    } else if (item.bankAccountId) return 'PARTNER_CURRENT_ACCOUNT_BANK_INVALID';

    const expectedType = partnerCurrentAccountCashDirection(item.type) === 'in' ? 'قبض' : 'صرف';
    const expectedCategory = PARTNER_CURRENT_ACCOUNT_CATEGORIES[item.type];
    const cashTx = treasury.find(tx => tx.id === item.treasuryTransactionId);
    if (!cashTx || cashTx.referenceId !== item.id || cashTx.category !== expectedCategory
      || cashTx.type !== expectedType || Number(cashTx.amount) !== Number(item.amount)
      || cashTx.date !== item.date || cashTx.paymentMethod !== item.paymentMethod
      || cashTx.bankAccountId !== item.bankAccountId) return 'PARTNER_CURRENT_ACCOUNT_TREASURY_MISMATCH';

    const bankEntry = bankLedgerEntries.find(entry => entry.id === `partner-current-account:${item.id}`);
    if (account === 'bank') {
      if (!bankEntry || bankEntry.batchId !== item.id || bankEntry.accountKind !== 'bank'
        || bankEntry.bankAccountId !== item.bankAccountId
        || bankEntry.direction !== partnerCurrentAccountCashDirection(item.type)
        || Number(bankEntry.amount) !== Number(item.amount) || bankEntry.date !== item.date) return 'PARTNER_CURRENT_ACCOUNT_BANK_MISMATCH';
    } else if (bankEntry) return 'PARTNER_CURRENT_ACCOUNT_BANK_MISMATCH';

    if (isPartnerCurrentAccountSettlement(item.type) && !item.relatedTransactionId) return 'PARTNER_CURRENT_ACCOUNT_ORIGIN_INVALID';
    if (!isPartnerCurrentAccountSettlement(item.type) && item.relatedTransactionId) return 'PARTNER_CURRENT_ACCOUNT_ORIGIN_INVALID';
  }

  for (const item of added.filter(candidate => isPartnerCurrentAccountSettlement(candidate.type))) {
    const isPartnerRepayment = item.type === 'partner_repayment';
    const expectedOriginType = isPartnerRepayment ? 'partner_withdrawal' : 'partner_deposit';
    let originAmount = 0;
    let originDate = '';
    if (item.relatedTransactionId === partnerCurrentAccountOpeningId(item.partnerId)) {
      const opening = openingPartnerCurrentAccountBalance(item.partnerId, openingBalances);
      if ((isPartnerRepayment && opening >= 0) || (!isPartnerRepayment && opening <= 0)) return 'PARTNER_CURRENT_ACCOUNT_ORIGIN_INVALID';
      originAmount = Math.abs(opening);
      originDate = openingBalances.find(record => record.status === 'approved')?.cutoverDate || '';
    } else {
      const origin = incoming.find(candidate => candidate.id === item.relatedTransactionId);
      if (!origin || origin.partnerId !== item.partnerId || origin.type !== expectedOriginType) return 'PARTNER_CURRENT_ACCOUNT_ORIGIN_INVALID';
      originAmount = origin.amount;
      originDate = origin.date;
    }
    if (originDate && item.date < originDate) return 'PARTNER_CURRENT_ACCOUNT_ORIGIN_INVALID';
    const settled = incoming.filter(candidate => candidate.relatedTransactionId === item.relatedTransactionId)
      .reduce((sum, candidate) => sum + candidate.amount, 0);
    if (settled > originAmount + 0.005) return 'PARTNER_CURRENT_ACCOUNT_OVERPAID';
  }
  return null;
}
