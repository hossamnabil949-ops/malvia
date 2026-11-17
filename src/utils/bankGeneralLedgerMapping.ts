import type { AccountingContext, LedgerAccount } from './accountingCore';
import type { BankAccount } from './bankLedger';

export interface BankGeneralLedgerMapping extends AccountingContext {
  bankAccountId: string;
  ledgerAccountId: string;
}

export type BankMappingError =
  | 'BANK_ACCOUNT_NOT_FOUND'
  | 'BANK_ACCOUNT_INACTIVE'
  | 'BANK_GL_MAPPING_MISSING'
  | 'BANK_GL_MAPPING_AMBIGUOUS'
  | 'BANK_GL_ACCOUNT_NOT_FOUND'
  | 'BANK_GL_ACCOUNT_INACTIVE'
  | 'BANK_GL_ACCOUNT_NOT_ASSET';

export type BankMappingResult =
  | { accountId: string; error: null }
  | { accountId: null; error: BankMappingError };

/**
 * Resolve a bank subledger to exactly one tenant/branch/currency-scoped GL asset.
 * Display names are never used as mapping keys.
 */
export function resolveBankGeneralLedgerAccount(
  bankAccountId: string,
  context: AccountingContext,
  bankAccounts: BankAccount[],
  mappings: BankGeneralLedgerMapping[],
  ledgerAccounts: LedgerAccount[],
): BankMappingResult {
  const bank = bankAccounts.find(item => item.id === bankAccountId);
  if (!bank) return { accountId: null, error: 'BANK_ACCOUNT_NOT_FOUND' };
  if (!bank.active) return { accountId: null, error: 'BANK_ACCOUNT_INACTIVE' };

  const scoped = mappings.filter(item =>
    item.bankAccountId === bankAccountId
    && item.tenantId === context.tenantId
    && item.branchId === context.branchId
    && item.currency.toUpperCase() === context.currency.toUpperCase()
  );
  if (!scoped.length) return { accountId: null, error: 'BANK_GL_MAPPING_MISSING' };
  if (scoped.length !== 1) return { accountId: null, error: 'BANK_GL_MAPPING_AMBIGUOUS' };

  const account = ledgerAccounts.find(item =>
    item.id === scoped[0].ledgerAccountId
    && item.tenantId === context.tenantId
    && item.branchId === context.branchId
    && item.currency.toUpperCase() === context.currency.toUpperCase()
  );
  if (!account) return { accountId: null, error: 'BANK_GL_ACCOUNT_NOT_FOUND' };
  if (!account.active) return { accountId: null, error: 'BANK_GL_ACCOUNT_INACTIVE' };
  if (account.type !== 'asset') return { accountId: null, error: 'BANK_GL_ACCOUNT_NOT_ASSET' };
  return { accountId: account.id, error: null };
}
