import { paymentAccountOf } from './paymentMethods';
import type { BankAccount, BankLedgerEntry } from './bankLedger';
import type { PartnerCurrentAccountTransaction } from '../types/autoParts';
import { partnerCurrentAccountCashDirection } from './partnerCurrentAccount';

export type BankLedgerSyncError =
  | 'BANK_LEDGER_NOT_ARRAY'
  | 'BANK_LEDGER_HISTORY_MODIFIED'
  | 'BANK_LEDGER_ENTRY_INVALID'
  | 'BANK_LEDGER_ACCOUNT_INVALID'
  | 'BANK_LEDGER_SOURCE_MISSING'
  | 'BANK_LEDGER_TRANSFER_UNBALANCED';

const validDate = (value: unknown): boolean => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Bank ledger is append-only; new entries must reference an active account and a matching business document. */
export function validateBankLedgerSync(input: {
  previous: BankLedgerEntry[];
  incoming: BankLedgerEntry[];
  bankAccounts: BankAccount[];
  invoices?: any[];
  supplierPayments?: any[];
  purchaseInvoices?: any[];
  expenses?: any[];
  treasury?: any[];
  partners?: any[];
  partnerWithdrawals?: any[];
  partnerCurrentAccountTransactions?: PartnerCurrentAccountTransaction[];
  partnerSettlementPayments?: any[];
  partnerExitSettlements?: any[];
  cardSettlements?: any[];
  cheques?: any[];
}): BankLedgerSyncError | null {
  const { previous, incoming, bankAccounts } = input;
  if (!Array.isArray(previous) || !Array.isArray(incoming)) return 'BANK_LEDGER_NOT_ARRAY';
  const previousById = new Map(previous.map(entry => [entry.id, entry]));
  const incomingById = new Map(incoming.map(entry => [entry.id, entry]));
  if (incomingById.size !== incoming.length) return 'BANK_LEDGER_ENTRY_INVALID';
  for (const oldEntry of previous) {
    const current = incomingById.get(oldEntry.id);
    if (!current || !same(current, oldEntry)) return 'BANK_LEDGER_HISTORY_MODIFIED';
  }
  const added = incoming.filter(entry => !previousById.has(entry.id));
  const activeAccounts = new Set(bankAccounts.filter(account => account.active).map(account => account.id));
  const invoices = input.invoices || [];
  const supplierPayments = input.supplierPayments || [];
  const purchaseInvoices = input.purchaseInvoices || [];
  const expenses = input.expenses || [];
  const treasury = input.treasury || [];
  const partners = input.partners || [];
  const partnerWithdrawals = input.partnerWithdrawals || [];
  const partnerCurrentAccountTransactions = input.partnerCurrentAccountTransactions || [];
  const partnerSettlementPayments = input.partnerSettlementPayments || [];
  const partnerExitSettlements = input.partnerExitSettlements || [];
  const cardSettlements = input.cardSettlements || [];
  const cheques = input.cheques || [];
  const directBank = (method: unknown) => ['bank', 'visa'].includes(paymentAccountOf(String(method || '')));

  for (const entry of added) {
    if (!entry.id || !entry.batchId || !['in', 'out'].includes(entry.direction)
      || !Number.isFinite(entry.amount) || entry.amount <= 0 || !validDate(entry.date)
      || !entry.reference || !entry.description) return 'BANK_LEDGER_ENTRY_INVALID';
    if (entry.accountKind === 'bank' && (!entry.bankAccountId || !activeAccounts.has(entry.bankAccountId))) return 'BANK_LEDGER_ACCOUNT_INVALID';

    let matched = false;
    if (entry.id.startsWith('pos-payment:')) {
      const invoice = invoices.find(item => item.id === entry.batchId);
      matched = Boolean(invoice && (invoice.payments || []).some((payment: any) =>
        directBank(payment.method) && payment.bankAccountId === entry.bankAccountId
        && Number(payment.amount) === Number(entry.amount))
        && entry.direction === 'in' && entry.date === invoice.date && entry.reference === invoice.invoiceNumber);
    } else if (entry.id.startsWith('customer-collection:')) {
      matched = treasury.some(tx => tx.txNumber === entry.batchId && tx.category === 'تحصيل من عميل / ورشة'
        && tx.bankAccountId === entry.bankAccountId && Number(tx.amount) === Number(entry.amount)
        && tx.type === 'قبض' && tx.date === entry.date);
    } else if (entry.id.startsWith('supplier-payment:')) {
      const payment = supplierPayments.find(item => item.id === entry.batchId);
      matched = Boolean(payment && directBank(payment.paymentMethod) && payment.bankAccountId === entry.bankAccountId
        && Number(payment.amount) === Number(entry.amount) && payment.paymentDate === entry.date && entry.direction === 'out');
    } else if (entry.id.startsWith('purchase:')) {
      const invoice = purchaseInvoices.find(item => item.id === entry.batchId);
      matched = Boolean(invoice && directBank(invoice.paymentMethod) && invoice.bankAccountId === entry.bankAccountId
        && Number(invoice.amountPaid) === Number(entry.amount) && invoice.date === entry.date && entry.direction === 'out');
    } else if (entry.id.startsWith('expense:')) {
      const expense = expenses.find(item => item.id === entry.batchId);
      matched = Boolean(expense && directBank(expense.paymentMethod) && expense.bankAccountId === entry.bankAccountId
        && Number(expense.amount) === Number(entry.amount) && expense.date === entry.date && entry.direction === 'out');
    } else if (entry.id.startsWith('partner-capital:')) {
      const tx = treasury.find(item => (item.id === entry.batchId || item.referenceId === entry.batchId)
        && item.category === 'ضخ رأس مال من شريك');
      matched = Boolean(tx && directBank(tx.paymentMethod) && tx.bankAccountId === entry.bankAccountId
        && Number(tx.amount) === Number(entry.amount) && tx.date === entry.date && tx.type === 'قبض'
        && partners.some(partner => partner.id === tx.referenceId));
    } else if (entry.id.startsWith('partner-withdrawal:')) {
      const withdrawal = partnerWithdrawals.find(item => item.id === entry.batchId);
      matched = Boolean(withdrawal && directBank(withdrawal.paymentMethod) && withdrawal.bankAccountId === entry.bankAccountId
        && Number(withdrawal.amount) === Number(entry.amount) && withdrawal.date === entry.date && entry.direction === 'out'
        && partners.some(partner => partner.id === withdrawal.partnerId));
    } else if (entry.id.startsWith('partner-current-account:')) {
      const movement = partnerCurrentAccountTransactions.find(item => item.id === entry.batchId);
      matched = Boolean(movement && directBank(movement.paymentMethod) && movement.bankAccountId === entry.bankAccountId
        && Number(movement.amount) === Number(entry.amount) && movement.date === entry.date
        && entry.direction === partnerCurrentAccountCashDirection(movement.type));
    } else if (entry.id.startsWith('partner-exit-payment:')) {
      const payment = partnerSettlementPayments.find(item => item.id === entry.batchId);
      const settlement = payment && partnerExitSettlements.find(item => item.id === payment.settlementId);
      matched = Boolean(payment && settlement && directBank(payment.paymentMethod) && payment.bankAccountId === entry.bankAccountId
        && Number(payment.amount) === Number(entry.amount) && payment.date === entry.date && entry.direction === 'out'
        && settlement.partnerId === payment.partnerId);
    } else if (entry.id.startsWith('distribution:')) {
      const tx = treasury.find(item => item.id === entry.batchId && item.category === 'توزيع أرباح');
      matched = Boolean(tx && directBank(tx.paymentMethod) && tx.bankAccountId === entry.bankAccountId
        && Number(tx.amount) === Number(entry.amount) && tx.date === entry.date && tx.type === 'صرف' && entry.direction === 'out');
    } else if (entry.id.startsWith('bank-transfer:')) {
      matched = true;
    } else {
      const settlement = cardSettlements.find(batch => batch.id === entry.batchId);
      if (settlement) {
        matched = (entry.id === `${settlement.id}:bank` && entry.accountKind === 'bank'
          && entry.bankAccountId === settlement.bankAccountId && Number(entry.amount) === Number(settlement.netAmount) && entry.direction === 'in')
          || (entry.id === `${settlement.id}:visa-clearing` && entry.accountKind === 'visa-clearing'
            && Number(entry.amount) === Number(settlement.grossAmount) && entry.direction === 'out')
          || (entry.id === `${settlement.id}:fee` && entry.accountKind === 'bank-fees'
            && Number(entry.amount) === Number(settlement.feeAmount) && entry.direction === 'out');
        matched = matched && entry.date === settlement.settlementDate;
      } else if (entry.id.startsWith('cheque:') || entry.id.startsWith('cheque-bounce:')) {
        matched = cheques.some(cheque => cheque.id === entry.batchId
          && (cheque.clearedBankAccountId === entry.bankAccountId || cheque.bankAccountId === entry.bankAccountId)
          && Number(cheque.amount) === Number(entry.amount));
      }
    }
    if (!matched) return 'BANK_LEDGER_SOURCE_MISSING';
  }

  const transferGroups = new Map<string, BankLedgerEntry[]>();
  for (const entry of added.filter(item => item.id.startsWith('bank-transfer:'))) {
    const group = transferGroups.get(entry.batchId) || [];
    group.push(entry);
    transferGroups.set(entry.batchId, group);
  }
  for (const group of transferGroups.values()) {
    if (group.length !== 2 || group.filter(item => item.direction === 'out').length !== 1
      || group.filter(item => item.direction === 'in').length !== 1
      || group[0].amount !== group[1].amount || group[0].date !== group[1].date
      || group[0].bankAccountId === group[1].bankAccountId) return 'BANK_LEDGER_TRANSFER_UNBALANCED';
  }
  return null;
}
