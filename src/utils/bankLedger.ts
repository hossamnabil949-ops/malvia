/**
 * MALVIA bank ledger primitives.
 *
 * This module is deliberately pure: it validates bank accounts and card settlement
 * batches and produces idempotent, balanced postings. UI/storage integration is
 * performed by the application layer; legacy treasury history is never rewritten.
 */

export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountLast4?: string;
  openingBalance: number;
  openingDate: string;
  active: boolean;
}

export type LedgerAccountKind = 'bank' | 'visa-clearing' | 'bank-fees';

export interface BankLedgerEntry {
  id: string;
  batchId: string;
  accountKind: LedgerAccountKind;
  bankAccountId?: string;
  direction: 'in' | 'out';
  amount: number;
  date: string;
  reference: string;
  description: string;
}

export interface CardSettlementBatch {
  id: string;
  processor: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  settlementDate: string;
  bankAccountId: string;
  reference: string;
}

export type BankLedgerError =
  | 'BANK_ACCOUNT_REQUIRED'
  | 'BANK_ACCOUNT_DUPLICATE'
  | 'BANK_ACCOUNT_INVALID'
  | 'BANK_ACCOUNT_INACTIVE'
  | 'SETTLEMENT_ID_REQUIRED'
  | 'SETTLEMENT_DUPLICATE'
  | 'SETTLEMENT_REFERENCE_REQUIRED'
  | 'SETTLEMENT_DATE_INVALID'
  | 'SETTLEMENT_AMOUNT_INVALID'
  | 'SETTLEMENT_FEE_INVALID'
  | 'SETTLEMENT_BANK_REQUIRED';

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function validateBankAccount(
  account: BankAccount,
  existing: BankAccount[] = [],
): BankLedgerError | null {
  if (!account.id.trim() || !account.name.trim() || !account.bankName.trim()) return 'BANK_ACCOUNT_REQUIRED';
  if (!Number.isFinite(account.openingBalance) || !validDate(account.openingDate)) return 'BANK_ACCOUNT_INVALID';
  if (existing.some(item => item.id === account.id)) return 'BANK_ACCOUNT_DUPLICATE';
  return null;
}

export function validateCardSettlement(
  batch: CardSettlementBatch,
  accounts: BankAccount[],
  existing: CardSettlementBatch[] = [],
): BankLedgerError | null {
  if (!batch.id.trim()) return 'SETTLEMENT_ID_REQUIRED';
  if (existing.some(item => item.id === batch.id)) return 'SETTLEMENT_DUPLICATE';
  if (!batch.reference.trim() || !batch.processor.trim()) return 'SETTLEMENT_REFERENCE_REQUIRED';
  if (!validDate(batch.settlementDate)) return 'SETTLEMENT_DATE_INVALID';
  if (!Number.isFinite(batch.grossAmount) || batch.grossAmount <= 0) return 'SETTLEMENT_AMOUNT_INVALID';
  if (!Number.isFinite(batch.feeAmount) || batch.feeAmount < 0 || batch.feeAmount >= batch.grossAmount) return 'SETTLEMENT_FEE_INVALID';
  if (!batch.bankAccountId) return 'SETTLEMENT_BANK_REQUIRED';
  const account = accounts.find(item => item.id === batch.bankAccountId);
  if (!account) return 'SETTLEMENT_BANK_REQUIRED';
  if (!account.active) return 'BANK_ACCOUNT_INACTIVE';
  if (roundMoney(batch.netAmount) !== roundMoney(batch.grossAmount - batch.feeAmount)) return 'SETTLEMENT_AMOUNT_INVALID';
  return null;
}

/**
 * Creates the three accounting legs for a settled card batch:
 * 1) reduce Visa clearing by gross, 2) increase the selected bank by net,
 * 3) record the processor fee as an expense.
 * No entry is created for an unsettled batch.
 */
export function createCardSettlementEntries(
  batch: CardSettlementBatch,
  accounts: BankAccount[],
  existing: CardSettlementBatch[] = [],
): { entries: BankLedgerEntry[]; error: BankLedgerError | null } {
  const error = validateCardSettlement(batch, accounts, existing);
  if (error) return { entries: [], error };

  const common = {
    batchId: batch.id,
    date: batch.settlementDate,
    reference: batch.reference.trim(),
  };
  const entries: BankLedgerEntry[] = [
    {
      ...common,
      id: `${batch.id}:visa-clearing`,
      accountKind: 'visa-clearing',
      direction: 'out',
      amount: roundMoney(batch.grossAmount),
      description: `تسوية مستحقات الفيزا — ${batch.processor}`,
    },
    {
      ...common,
      id: `${batch.id}:bank`,
      accountKind: 'bank',
      bankAccountId: batch.bankAccountId,
      direction: 'in',
      amount: roundMoney(batch.netAmount),
      description: `صافي تسوية الفيزا إلى البنك — ${batch.processor}`,
    },
    ...(batch.feeAmount > 0 ? [{
      ...common,
      id: `${batch.id}:fee`,
      accountKind: 'bank-fees' as const,
      direction: 'out' as const,
      amount: roundMoney(batch.feeAmount),
      description: `عمولة تحصيل الفيزا — ${batch.processor}`,
    }] : []),
  ];
  return { entries, error: null };
}

export function summarizeBankAccount(
  account: BankAccount,
  entries: BankLedgerEntry[],
): number {
  return roundMoney(entries.reduce((balance, entry) => {
    if (entry.accountKind !== 'bank' || entry.bankAccountId !== account.id) return balance;
    return balance + (entry.direction === 'in' ? entry.amount : -entry.amount);
  }, account.openingBalance));
}
