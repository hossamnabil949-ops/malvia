/**
 * Opening balance reconciliation for businesses migrating to MALVIA after trading has begun.
 * Historical partner capital and the cut-over balance sheet are intentionally separate.
 */
export type OpeningBalanceCategory =
  | 'inventory' | 'cash' | 'bank' | 'fixed_asset' | 'prepaid'
  | 'customer_receivable' | 'other_asset' | 'supplier_payable' | 'loan' | 'other_liability';

export interface OpeningBalanceLine {
  id: string;
  category: OpeningBalanceCategory;
  label: string;
  amount: number;
  partId?: string;
  quantity?: number;
  unitCost?: number;
  bankAccountId?: string;
}

export interface OpeningPartnerCapital {
  partnerId: string;
  partnerName: string;
  originalContribution: number;
  ownershipPercentage: number;
}

export interface OpeningBalanceRecord {
  id: string;
  status: 'draft' | 'approved';
  cutoverDate: string;
  originalOpeningDate?: string;
  originalCapital: number;
  partners: OpeningPartnerCapital[];
  lines: OpeningBalanceLine[];
  notes?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  createdBy: string;
}

export interface OpeningBalanceSummary {
  assets: number;
  liabilities: number;
  netAssets: number;
  partnerCapital: number;
  reconciliationDifference: number;
  assetBreakdown: Record<'inventory' | 'cash' | 'bank' | 'fixed_asset' | 'prepaid' | 'customer_receivable' | 'other_asset', number>;
  liabilityBreakdown: Record<'supplier_payable' | 'loan' | 'other_liability', number>;
}

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ASSET_CATEGORIES = new Set<OpeningBalanceCategory>([
  'inventory', 'cash', 'bank', 'fixed_asset', 'prepaid', 'customer_receivable', 'other_asset',
]);

export function summarizeOpeningBalances(record: Pick<OpeningBalanceRecord, 'partners' | 'lines'>): OpeningBalanceSummary {
  const assetBreakdown: OpeningBalanceSummary['assetBreakdown'] = {
    inventory: 0, cash: 0, bank: 0, fixed_asset: 0, prepaid: 0, customer_receivable: 0, other_asset: 0,
  };
  const liabilityBreakdown: OpeningBalanceSummary['liabilityBreakdown'] = {
    supplier_payable: 0, loan: 0, other_liability: 0,
  };
  for (const line of record.lines) {
    if (ASSET_CATEGORIES.has(line.category)) {
      assetBreakdown[line.category as keyof typeof assetBreakdown] += line.amount;
    } else {
      liabilityBreakdown[line.category as keyof typeof liabilityBreakdown] += line.amount;
    }
  }
  const assets = roundMoney(Object.values(assetBreakdown).reduce((a, b) => a + b, 0));
  const liabilities = roundMoney(Object.values(liabilityBreakdown).reduce((a, b) => a + b, 0));
  const partnerCapital = roundMoney(record.partners.reduce((sum, p) => sum + p.originalContribution, 0));
  const netAssets = roundMoney(assets - liabilities);
  return {
    assets, liabilities, netAssets, partnerCapital,
    reconciliationDifference: roundMoney(netAssets - partnerCapital),
    assetBreakdown, liabilityBreakdown,
  };
}

export type OpeningBalanceValidationError =
  | 'INVALID_DATE' | 'INVALID_AMOUNT' | 'INVALID_PARTNER' | 'INVALID_SHARE_TOTAL'
  | 'INVALID_LINE' | 'INVENTORY_LINE_INVALID' | 'BANK_ACCOUNT_REQUIRED'
  | 'DUPLICATE_LINE' | 'APPROVED_RECORD_IMMUTABLE';

export function validateOpeningBalanceRecord(
  record: OpeningBalanceRecord,
  options: { activeBankAccountIds?: string[]; existingRecord?: OpeningBalanceRecord | null } = {},
): OpeningBalanceValidationError | null {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(record.cutoverDate)) return 'INVALID_DATE';
  const date = new Date(record.cutoverDate + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== record.cutoverDate) return 'INVALID_DATE';
  if (!Number.isFinite(record.originalCapital) || record.originalCapital < 0) return 'INVALID_AMOUNT';
  if (options.existingRecord?.status === 'approved') return 'APPROVED_RECORD_IMMUTABLE';
  const ids = new Set<string>();
  for (const line of record.lines) {
    if (!line.id || ids.has(line.id)) return 'DUPLICATE_LINE';
    ids.add(line.id);
    if (!line.label.trim() || !Number.isFinite(line.amount) || line.amount < 0) return 'INVALID_LINE';
    if (line.category === 'inventory') {
      if (!line.partId || !Number.isFinite(line.quantity) || (line.quantity || 0) <= 0 ||
          !Number.isFinite(line.unitCost) || (line.unitCost || 0) < 0 ||
          roundMoney((line.quantity || 0) * (line.unitCost || 0)) !== roundMoney(line.amount)) return 'INVENTORY_LINE_INVALID';
    }
    if (line.category === 'bank' &&
        (!line.bankAccountId || !options.activeBankAccountIds?.includes(line.bankAccountId))) return 'BANK_ACCOUNT_REQUIRED';
  }
  for (const partner of record.partners) {
    if (!partner.partnerId || !partner.partnerName.trim() ||
        !Number.isFinite(partner.originalContribution) || partner.originalContribution < 0 ||
        !Number.isFinite(partner.ownershipPercentage) || partner.ownershipPercentage < 0 || partner.ownershipPercentage > 100) return 'INVALID_PARTNER';
  }
  const shares = record.partners.reduce((sum, p) => sum + p.ownershipPercentage, 0);
  if (record.partners.length && Math.abs(shares - 100) > 0.01) return 'INVALID_SHARE_TOTAL';
  return null;
}

/** A positive difference is unexplained net assets; a negative one is an opening deficit.
 * Neither is automatically classified as profit, loss, or new partner capital.
 */
export function openingDifferenceLabel(difference: number): 'unexplained_surplus' | 'opening_deficit' | 'balanced' {
  if (difference > 0.009) return 'unexplained_surplus';
  if (difference < -0.009) return 'opening_deficit';
  return 'balanced';
}
