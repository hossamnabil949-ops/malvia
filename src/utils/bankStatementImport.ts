import * as XLSX from 'xlsx';
import type { BankStatementLine } from './bankReconciliation';

const normalizeHeader = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase().replace(/[\s_\-./:()]+/g, '');
const digits = (value: string): string => value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const pick = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const keys = Object.keys(row);
  const found = keys.find(key => aliases.includes(normalizeHeader(key)));
  return found === undefined ? undefined : row[found];
};

const parseDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return [parsed.y, String(parsed.m).padStart(2, '0'), String(parsed.d).padStart(2, '0')].join('-');
  }
  const text = digits(String(value ?? '').trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return [match[3], match[2].padStart(2, '0'), match[1].padStart(2, '0')].join('-');
  return null;
};

const parseAmount = (value: unknown): number => {
  const text = digits(String(value ?? '')).replace(/ج\.م|EGP|٬|,|\s/gi, '').replace(/٫/g, '.');
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : NaN;
};

const parseDirection = (value: unknown): 'in' | 'out' | null => {
  const text = String(value ?? '').trim().toLocaleLowerCase();
  if (/credit|deposit|incoming|قبض|ايداع|إيداع|دائن|إضافة/.test(text)) return 'in';
  if (/debit|withdraw|outgoing|صرف|سحب|مدين|خصم/.test(text)) return 'out';
  return null;
};

export function parseBankStatementWorkbook(
  data: ArrayBuffer,
  bankAccountId: string,
): { lines: BankStatementLine[]; errors: string[] } {
  if (!bankAccountId) return { lines: [], errors: ['اختر الحساب البنكي أولاً.'] };
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { lines: [], errors: ['الملف لا يحتوي على ورقة بيانات.'] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '', raw: true });
  if (!rows.length) return { lines: [], errors: ['لا توجد صفوف بيانات في الملف.'] };

  const lines: BankStatementLine[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const dateValue = pick(row, ['date', 'transactiondate', 'valuedate', 'التاريخ', 'تاريخالحركة', 'تاريخالعملية']);
    const date = parseDate(dateValue);
    const debit = parseAmount(pick(row, ['debit', 'withdrawal', 'مدين', 'سحب']));
    const credit = parseAmount(pick(row, ['credit', 'deposit', 'دائن', 'ايداع', 'إيداع']));
    const amountValue = pick(row, ['amount', 'transactionamount', 'المبلغ', 'قيمةالحركة', 'قيمة']);
    const amount = amountValue === undefined || amountValue === '' ? NaN : parseAmount(amountValue);
    const directionValue = pick(row, ['direction', 'type', 'transactiontype', 'الاتجاه', 'نوعالحركة', 'الحركة']);
    let direction = parseDirection(directionValue);
    let finalAmount = amount;
    if (Number.isFinite(debit) && debit > 0 && !(Number.isFinite(credit) && credit > 0)) {
      direction = 'out'; finalAmount = debit;
    } else if (Number.isFinite(credit) && credit > 0 && !(Number.isFinite(debit) && debit > 0)) {
      direction = 'in'; finalAmount = credit;
    } else if (Number.isFinite(amount) && amount < 0) {
      direction = 'out'; finalAmount = Math.abs(amount);
    }
    const referenceValue = pick(row, ['reference', 'ref', 'transactionid', 'referencenumber', 'المرجع', 'رقمالمرجع', 'رقمالعملية']);
    const reference = String(referenceValue ?? '').trim();
    if (!date || !direction || !Number.isFinite(finalAmount) || finalAmount <= 0) {
      errors.push('الصف ' + (index + 2) + ': تاريخ أو اتجاه أو مبلغ غير صالح.');
      return;
    }
    lines.push({ id: 'statement-row-' + (index + 2), bankAccountId, direction, amount: finalAmount, date, reference: reference || undefined });
  });
  return { lines, errors };
}
