import type { BankLedgerEntry } from './bankLedger';

export interface BankStatementLine {
  id: string;
  bankAccountId: string;
  direction: 'in' | 'out';
  amount: number;
  date: string;
  reference?: string;
}

export type BankReconciliationMatch =
  | { statementLineId: string; status: 'matched_reference' | 'matched_amount_date'; ledgerEntryId: string }
  | { statementLineId: string; status: 'unmatched_statement' | 'ambiguous_statement' | 'duplicate_statement'; candidateLedgerEntryIds: string[] };

export interface BankReconciliationResult {
  matches: BankReconciliationMatch[];
  unmatchedLedgerEntryIds: string[];
  matchedCount: number;
  unmatchedStatementCount: number;
  ambiguousCount: number;
  duplicateStatementCount: number;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const validDate = (value: string): boolean => {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const normalizeReference = (value: string): string => value.trim().toLocaleLowerCase().replace(/[\\s\\-_/]+/g, '');

export function reconcileBankStatement(
  bankAccountId: string,
  statementLines: BankStatementLine[],
  ledgerEntries: BankLedgerEntry[],
): BankReconciliationResult {
  const eligibleLedger = ledgerEntries.filter(entry =>
    entry.accountKind === 'bank' && entry.bankAccountId === bankAccountId);
  const usedLedger = new Set<string>();
  const seenStatement = new Set<string>();
  const matches: BankReconciliationMatch[] = [];

  for (const line of statementLines) {
    if (!line.id?.trim() || !line.bankAccountId || line.bankAccountId !== bankAccountId
      || !validDate(line.date) || !Number.isFinite(line.amount) || line.amount <= 0
      || !['in', 'out'].includes(line.direction)) {
      matches.push({ statementLineId: line.id || '', status: 'unmatched_statement', candidateLedgerEntryIds: [] });
      continue;
    }

    const fingerprint = [line.bankAccountId, line.direction, round2(line.amount), line.date,
      normalizeReference(line.reference || '')].join('|');
    if (seenStatement.has(fingerprint)) {
      matches.push({ statementLineId: line.id, status: 'duplicate_statement', candidateLedgerEntryIds: [] });
      continue;
    }
    seenStatement.add(fingerprint);

    const candidates = eligibleLedger.filter(entry => !usedLedger.has(entry.id)
      && entry.direction === line.direction
      && round2(entry.amount) === round2(line.amount)
      && entry.date === line.date);
    if (!candidates.length) {
      matches.push({ statementLineId: line.id, status: 'unmatched_statement', candidateLedgerEntryIds: [] });
      continue;
    }

    const reference = normalizeReference(line.reference || '');
    const exactReference = reference
      ? candidates.filter(entry => normalizeReference(entry.reference || '') === reference)
      : [];
    if (exactReference.length === 1) {
      usedLedger.add(exactReference[0].id);
      matches.push({ statementLineId: line.id, status: 'matched_reference', ledgerEntryId: exactReference[0].id });
      continue;
    }
    if (exactReference.length > 1) {
      matches.push({ statementLineId: line.id, status: 'ambiguous_statement', candidateLedgerEntryIds: exactReference.map(entry => entry.id) });
      continue;
    }
    if (candidates.length === 1) {
      usedLedger.add(candidates[0].id);
      matches.push({ statementLineId: line.id, status: 'matched_amount_date', ledgerEntryId: candidates[0].id });
      continue;
    }
    matches.push({ statementLineId: line.id, status: 'ambiguous_statement', candidateLedgerEntryIds: candidates.map(entry => entry.id) });
  }

  const matchedCount = matches.filter(match => match.status === 'matched_reference' || match.status === 'matched_amount_date').length;
  const unmatchedStatementCount = matches.filter(match => match.status === 'unmatched_statement').length;
  const ambiguousCount = matches.filter(match => match.status === 'ambiguous_statement').length;
  const duplicateStatementCount = matches.filter(match => match.status === 'duplicate_statement').length;
  return {
    matches,
    unmatchedLedgerEntryIds: eligibleLedger.filter(entry => !usedLedger.has(entry.id)).map(entry => entry.id),
    matchedCount, unmatchedStatementCount, ambiguousCount, duplicateStatementCount,
  };
}
