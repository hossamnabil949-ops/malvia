import { AutoPart, Customer } from '../types/autoParts';
import { loadDeviceLicenseKey } from './tenantService';

export type AIActionType = 
  | 'EXECUTE_SALE' 
  | 'INVENTORY_AUDIT' 
  | 'RESTOCK_ITEM' 
  | 'ADD_PURCHASE'
  | 'SETTLE_SUPPLIER'
  | 'COLLECT_CUSTOMER'
  | 'ADD_EXPENSE' 
  | 'QUERY_LOW_STOCK' 
  | 'NAVIGATE_TAB' 
  | 'GENERAL_ANSWER';

export interface AICommandResult {
  action: AIActionType;
  matchedPartId?: string;
  matchedPartName?: string;
  quantity?: number;
  unitCost?: number;
  customerName?: string;
  paymentMethod?: string;
  expenseTitle?: string;
  expenseAmount?: number;
  supplierName?: string;
  supplierPaymentAmount?: number;
  customerCollectionAmount?: number;
  targetTab?: 'home' | 'pos' | 'inventory' | 'invoices' | 'purchases' | 'suppliers' | 'customers' | 'finance' | 'reports' | 'settings';
  spokenFeedback: string;
  timestamp?: string;
}

export async function sendVoiceCommandToServer(
  command: string,
  parts: AutoPart[],
  customers: Customer[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<AICommandResult> {
  try {
    const response = await fetch('/api/ai/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-license-key': loadDeviceLicenseKey(),
      },
      body: JSON.stringify({
        command,
        conversationHistory: conversationHistory.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 500) })),
        parts: parts.map((p) => ({
          id: p.id,
          partNumber: p.partNumber,
          name: p.name,
          brand: p.brand,
          compatibleModels: p.compatibleModels,
          category: p.category,
          shelfLocation: p.shelfLocation,
          salePrice: p.salePrice,
          stockQuantity: p.stockQuantity,
          unit: p.unit,
        })), // لا نرسل سعر التكلفة لطرف ثالث
        customers: customers.map((c) => ({
          id: c.id,
          name: c.name,
        })), // الاسم فقط (بدون رصيد أو هاتف)
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data: AICommandResult = await response.json();
    return verifyCommandResult(
      {
        ...data,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      },
      command,
      parts,
      customers
    );
  } catch (error) {
    // Fail closed: do not execute a financial/inventory action from a client-side guess
    // when the authenticated AI endpoint is unavailable.
    console.error('AI endpoint unavailable; command was not executed:', error);
    throw new Error('تعذر الاتصال بالمساعد الآمن. لم يتم تنفيذ الأمر. تحقق من الاتصال وحاول مرة أخرى.');
  }
}

/* ------------------------------------------------------------------ */
/* Part matching (shared by the server result check and the fallback)  */
/* ------------------------------------------------------------------ */

export function normalizeArabic(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\u0621-\u064Aa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RAW_STOP_WORDS = [
  'بعت', 'بيع', 'بايع', 'بعنا', 'اصرف', 'خرجت', 'خرج', 'سجل', 'ضيف', 'جرد', 'شوفلي', 'شوف', 'مكان', 'مخزون', 'رصيد',
  'كم', 'باقي', 'عايز', 'عاوز', 'عايزه', 'عاوزه', 'اريد', 'ابغي', 'ممكن', 'لو', 'سمحت', 'من', 'في', 'علي', 'الي',
  'الى', 'ده', 'دي', 'دا', 'نقدي', 'نقدا', 'كاش', 'اجل', 'آجل', 'فيزا', 'ورشه', 'ورشة', 'عميل', 'للعميل', 'للورشه',
  'حبه', 'حبة', 'حبتين', 'حبات', 'قطعه', 'قطعة', 'قطعتين', 'قطع', 'طقم', 'طقمين', 'لتر', 'واحد', 'واحده', 'اتنين',
  'اثنين', 'تلاته', 'ثلاثه', 'اربعه', 'خمسه', 'عشره', 'عدد', 'كميه', 'صنف', 'سعر', 'جنيه', 'فاتوره', 'مع', 'ب', 'و',
  'ال', 'لل', 'بتاع', 'بتاعه', 'بتاعة', 'تبع', 'للسياره', 'الرف', 'بالرف',
];

const SYNONYMS: Record<string, string> = {
  فحمات: 'تيل', فحمه: 'تيل', اقمشه: 'تيل', قماش: 'تيل',
  بواجي: 'بوجيه', بوجيهات: 'بوجيه', بوجي: 'بوجيه', شمعات: 'بوجيه', شمعه: 'بوجيه',
  دينمو: 'دينامو', دينامو: 'دينامو', مولد: 'دينامو', الترنيتر: 'دينامو',
  مساعدين: 'مساعد', ممتص: 'مساعد',
  كاوتش: 'اطار', تاير: 'اطار', اطارات: 'اطار',
};

// Arabic spellings of common brands -> the Latin spelling used in part records
const BRAND_MAP: Record<string, string> = {
  بوش: 'bosch', مان: 'mann', دينسو: 'denso', تويوتا: 'toyota', هيونداي: 'hyundai', نيسان: 'nissan', كيا: 'kia',
  شيفروليه: 'chevrolet', ميتسوبيشي: 'mitsubishi', هوندا: 'honda', مازدا: 'mazda', سوزوكي: 'suzuki', فورد: 'ford',
  بيجو: 'peugeot', رينو: 'renault', مرسيدس: 'mercedes', بي: 'bmw', اودي: 'audi', فولكس: 'volkswagen',
  كي: 'kyb', تي: 'trw', سكف: 'skf', فاليو: 'valeo', ليمفوردر: 'lemforder', ميشلان: 'michelin',
};

const STOP_WORDS = new Set(RAW_STOP_WORDS.map(w => normalizeArabic(w)).filter(Boolean));

function tokenize(text: string, dropStopWords: boolean): string[] {
  const out: string[] = [];
  for (let t of normalizeArabic(text).split(' ')) {
    if (!t) continue;
    if (/^\d+$/.test(t)) continue; // quantities / amounts are not part names
    if (t.length > 3 && t.startsWith('ال')) t = t.slice(2);
    if (SYNONYMS[t]) t = SYNONYMS[t];
    if (BRAND_MAP[t]) t = BRAND_MAP[t];
    if (dropStopWords && STOP_WORDS.has(t)) continue;
    if (t.length < 2) continue;
    out.push(t);
  }
  return out;
}

function tokenMatches(q: string, p: string): boolean {
  if (q === p) return true;
  return q.length >= 3 && p.length >= 3 && (p.startsWith(q) || q.startsWith(p));
}

export interface PartMatch {
  part: AutoPart;
  coverage: number; // share of the spoken words found in this part (0..1)
  nameHits: number;
}

export function rankParts(command: string, parts: AutoPart[]): PartMatch[] {
  const q = tokenize(command, true);
  if (q.length === 0) return [];
  const ranked: PartMatch[] = [];
  for (const part of parts) {
    const nameTokens = tokenize(part.name, false);
    const otherTokens = tokenize(
      [part.brand, part.partNumber, part.compatibleModels, part.category].filter(Boolean).join(' '),
      false
    );
    let hits = 0;
    let nameHits = 0;
    for (const t of q) {
      if (nameTokens.some(p => tokenMatches(t, p))) {
        hits++;
        nameHits++;
      } else if (otherTokens.some(p => tokenMatches(t, p))) {
        hits++;
      }
    }
    if (hits > 0) ranked.push({ part, coverage: hits / q.length, nameHits });
  }
  ranked.sort((a, b) => b.coverage - a.coverage || b.nameHits - a.nameHits);
  return ranked;
}

export type PartResolution =
  | { status: 'ok'; part: AutoPart }
  | { status: 'ambiguous'; candidates: AutoPart[] }
  | { status: 'none' };

/**
 * Decides which part the user really meant. A part is accepted only if the
 * words the user said actually appear in it; it never falls back to "the
 * first part in the list".
 */
export function resolvePart(command: string, parts: AutoPart[], suggestedId?: string): PartResolution {
  const ranked = rankParts(command, parts);
  if (ranked.length === 0 || ranked[0].coverage < 0.5) return { status: 'none' };

  const top = ranked[0];
  if (suggestedId) {
    const suggested = ranked.find(r => r.part.id === suggestedId);
    // accept the AI's choice only if it is as good as the best textual match
    if (suggested && suggested.coverage >= 0.5 && suggested.coverage >= top.coverage - 0.001) {
      return { status: 'ok', part: suggested.part };
    }
  }

  const tied = ranked.filter(r => r.coverage >= top.coverage - 0.001 && r.nameHits === top.nameHits);
  if (tied.length === 1) return { status: 'ok', part: top.part };
  return { status: 'ambiguous', candidates: tied.slice(0, 4).map(r => r.part) };
}

function findCustomer(command: string, customers: Customer[]): Customer | undefined {
  const q = tokenize(command, true);
  if (q.length === 0) return undefined;
  let best: { c: Customer; score: number } | undefined;
  for (const c of customers) {
    const nt = tokenize(c.name, true);
    const hits = nt.filter(p => q.some(t => tokenMatches(t, p))).length;
    if (hits > 0 && (!best || hits > best.score)) best = { c, score: hits };
  }
  return best?.c;
}

function firstAmount(text: string): number | undefined {
  const m = normalizeArabic(text).match(/\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const QTY_WORDS: [RegExp, number][] = [
  [/(^|\s)(حبتين|قطعتين|طقمين|اتنين|اثنين)(\s|$)/, 2],
  [/(^|\s)(تلاته|ثلاثه|ثلاث)(\s|$)/, 3],
  [/(^|\s)(اربعه|اربع)(\s|$)/, 4],
  [/(^|\s)(خمسه|خمس)(\s|$)/, 5],
  [/(^|\s)(عشره|عشر)(\s|$)/, 10],
];

function extractQuantity(command: string): number {
  const n = normalizeArabic(command);
  for (const [re, v] of QTY_WORDS) if (re.test(n)) return v;
  const m = n.match(/(^|\s)(\d{1,3})(\s|$)/);
  if (m) {
    const v = parseInt(m[2], 10);
    if (v >= 1) return v;
  }
  return 1;
}

function clarify(text: string, time: string): AICommandResult {
  return { action: 'GENERAL_ANSWER', spokenFeedback: text, timestamp: time };
}

function describeResolution(res: PartResolution, command: string, time: string): AICommandResult | null {
  if (res.status === 'ok') return null;
  if (res.status === 'ambiguous') {
    const names = res.candidates.map(p => `${p.name} (${p.brand}${p.partNumber ? ' - ' + p.partNumber : ''})`).join(' / ');
    return clarify(`وجدت أكثر من صنف مناسب: ${names}. من فضلك حدد الصنف أو الماركة بدقة أكثر.`, time);
  }
  return clarify(`لم أجد في المخزون صنفاً يطابق "${command}". جرّب ذكر اسم الصنف كما هو مسجل، ولم أنفذ أي شيء.`, time);
}

/**
 * Safety net applied to EVERY result (server or fallback) before the UI acts on it:
 * wrong part picks, missing amounts or made-up names are turned into a question.
 */
export function verifyCommandResult(
  result: AICommandResult,
  command: string,
  parts: AutoPart[],
  customers: Customer[]
): AICommandResult {
  const time = result.timestamp || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (result.action === 'EXECUTE_SALE' || result.action === 'RESTOCK_ITEM' || result.action === 'INVENTORY_AUDIT') {
    const res = resolvePart(command, parts, result.matchedPartId);
    const problem = describeResolution(res, command, time);
    if (problem) return problem;
    if (res.status === 'ok') {
      const rawQty = Number(result.quantity);
      const quantity = Number.isInteger(rawQty) && rawQty >= 1 && rawQty <= 1000 ? rawQty : extractQuantity(command);
      return { ...result, matchedPartId: res.part.id, matchedPartName: res.part.name, quantity };
    }
  }

  if (result.action === 'ADD_EXPENSE') {
    const amount = Number(result.expenseAmount) > 0 ? Number(result.expenseAmount) : firstAmount(command);
    if (!amount) return clarify('كم مبلغ المصروف؟ لم أسجل شيئاً.', time);
    return { ...result, expenseAmount: amount };
  }

  if (result.action === 'COLLECT_CUSTOMER') {
    const amount = Number(result.customerCollectionAmount) > 0 ? Number(result.customerCollectionAmount) : firstAmount(command);
    const cust = findCustomer(`${result.customerName || ''} ${command}`, customers);
    if (!cust || !amount) {
      return clarify('حدد اسم العميل أو الورشة والمبلغ بوضوح. لم أنفذ أي شيء.', time);
    }
    return { ...result, customerName: cust.name, customerCollectionAmount: amount };
  }

  if (result.action === 'SETTLE_SUPPLIER' || result.action === 'ADD_PURCHASE') {
    if (!result.supplierName) {
      return clarify('حدد اسم المورد والمبلغ بوضوح. لم أنفذ أي شيء.', time);
    }
  }

  return result;
}

function getClientFallbackResult(command: string, parts: AutoPart[], customers: Customer[]): AICommandResult {
  const cmd = normalizeArabic(command);
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const amount = firstAmount(command);

  // ---- money operations: no guessing of names or amounts ----
  if (/(^|\s)(سدد|ادفع|سداد)/.test(cmd) && /مورد/.test(cmd)) {
    return clarify('لتسجيل سداد مورد افتح صفحة الموردين واختر المورد. لم أنفذ أي شيء.', time);
  }
  if (/حصلت|استلمت|قبضت|تحصيل/.test(cmd)) {
    const cust = findCustomer(command, customers);
    if (!cust || !amount) return clarify('حدد اسم العميل أو الورشة والمبلغ بوضوح. لم أنفذ أي شيء.', time);
    return {
      action: 'COLLECT_CUSTOMER',
      customerName: cust.name,
      customerCollectionAmount: amount,
      paymentMethod: 'نقدي',
      spokenFeedback: `تحصيل ${amount} جنيه من ${cust.name}.`,
      timestamp: time,
    };
  }
  if (/فاتوره شراء|فاتوره توريد|مشتريات|اشتريت من|توريد من/.test(cmd)) {
    return { action: 'NAVIGATE_TAB', targetTab: 'purchases', spokenFeedback: 'جاري فتح فواتير المشتريات.', timestamp: time };
  }
  if (/مصروف|مصاريف|كهرباء|ايجار|بوفيه|ضيافه|شحن/.test(cmd)) {
    if (!amount) return clarify('كم مبلغ المصروف؟ لم أسجل شيئاً.', time);
    let title = 'مصروفات ونثريات';
    if (/كهرباء/.test(cmd)) title = 'فاتورة كهرباء';
    else if (/ايجار/.test(cmd)) title = 'إيجار';
    else if (/شحن|نقل/.test(cmd)) title = 'أجور شحن ونقل';
    else if (/بوفيه|ضيافه|شاي/.test(cmd)) title = 'ضيافة وبوفيه';
    return {
      action: 'ADD_EXPENSE',
      expenseTitle: title,
      expenseAmount: amount,
      spokenFeedback: `تسجيل مصروف ${amount} جنيه: ${title}.`,
      timestamp: time,
    };
  }

  // ---- navigation ----
  if (/موردين/.test(cmd)) return { action: 'NAVIGATE_TAB', targetTab: 'suppliers', spokenFeedback: 'جاري فتح الموردين.', timestamp: time };
  if (/تقارير|اكسيل|اكسل/.test(cmd)) return { action: 'NAVIGATE_TAB', targetTab: 'reports', spokenFeedback: 'جاري فتح التقارير.', timestamp: time };
  if (/اعدادات|موظفين|شعار/.test(cmd)) return { action: 'NAVIGATE_TAB', targetTab: 'settings', spokenFeedback: 'جاري فتح الإعدادات.', timestamp: time };
  if (/ناقص|نواقص|الناقصه/.test(cmd)) return { action: 'QUERY_LOW_STOCK', spokenFeedback: 'عرض نواقص المخزون.', timestamp: time };

  // ---- parts: sale / audit ----
  const isSale = /بعت|بيع|اصرف|خرجت|بعنا/.test(cmd);
  const isAudit = /جرد|شوفلي|مكان|مخزون|رصيد|كم باقي|باقي/.test(cmd);
  if (isSale || isAudit) {
    const res = resolvePart(command, parts);
    const problem = describeResolution(res, command, time);
    if (problem) return problem;
    if (res.status === 'ok') {
      const part = res.part;
      if (isSale) {
        const quantity = extractQuantity(command);
        return {
          action: 'EXECUTE_SALE',
          matchedPartId: part.id,
          matchedPartName: part.name,
          quantity,
          customerName: 'عميل نقدي',
          paymentMethod: 'نقدي',
          spokenFeedback: `بيع ${quantity} ${part.unit} من ${part.name}.`,
          timestamp: time,
        };
      }
      return {
        action: 'INVENTORY_AUDIT',
        matchedPartId: part.id,
        matchedPartName: part.name,
        spokenFeedback: `${part.name}: الرصيد ${part.stockQuantity} ${part.unit} على ${part.shelfLocation}، سعر البيع ${part.salePrice} جنيه.`,
        timestamp: time,
      };
    }
  }

  return clarify(
    'لم أفهم الأمر بدقة. جرّب: "بعت 2 فلتر زيت"، "جرد تيل فرامل"، "سجل مصروف 200 كهرباء".',
    time
  );
}

export function speakArabic(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find((v) => v.lang.startsWith('ar') || v.name.includes('Arabic') || v.name.includes('Tarek') || v.name.includes('Laila'));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
    if (onEnd) onEnd();
  }
}

export function stopArabicSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
