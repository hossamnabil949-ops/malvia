import { AutoPart, Customer, Invoice, Supplier } from '../types/autoParts';
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
  targetTab?: 'home' | 'pos' | 'shifts' | 'inventory' | 'lowstock' | 'warehouses' | 'tracking' | 'invoices' | 'purchases' | 'suppliers' | 'customers' | 'finance' | 'cheques' | 'reports' | 'settings';
  partConfidence?: 'high' | 'medium' | 'low';
  lang?: 'ar' | 'en';
  spokenFeedback: string;
  timestamp?: string;
}

export const hasArabic = (text: string): boolean => /[\u0600-\u06FF]/.test(text || '');
export const detectLang = (text: string, fallback: 'ar' | 'en' = 'ar'): 'ar' | 'en' =>
  hasArabic(text) ? 'ar' : /[a-z]/i.test(text || '') ? 'en' : fallback;

/** ملخص آمن للمحل يُرسل للمساعد ليناقش به (بدون أسعار تكلفة ولا هواتف ولا أرصدة). */
export function buildShopSnapshot(
  parts: AutoPart[],
  invoices: Invoice[],
  suppliers: Supplier[],
  session?: { employeeName?: string; role?: string },
  shopName?: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const live = invoices.filter((i) => i.status !== 'ملغاة');
  const sum = (list: Invoice[]) => list.reduce((t, i) => t + (i.grandTotal - (i.returnedAmount || 0)), 0);
  const todayInv = live.filter((i) => i.date === today);
  const monthInv = live.filter((i) => (i.date || '').startsWith(month));
  const sold = new Map<string, { name: string; qty: number }>();
  for (const inv of monthInv) {
    for (const it of inv.items || []) {
      const k = it.partId || it.partNumber;
      const cur = sold.get(k) || { name: it.partName, qty: 0 };
      cur.qty += it.quantity - (it.returnedQuantity || 0);
      sold.set(k, cur);
    }
  }
  const topSellers = [...sold.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  const out = parts.filter((p) => p.stockQuantity <= 0);
  const critical = parts.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minAlertStock);
  return {
    name: shopName,
    userName: session?.employeeName,
    role: session?.role,
    suppliers: suppliers.map((s) => s.name).slice(0, 200),
    summary: {
      partsCount: parts.length,
      outOfStockCount: out.length,
      outOfStock: out.slice(0, 25).map((p) => p.name),
      criticalCount: critical.length,
      critical: critical.slice(0, 25).map((p) => `${p.name} (${p.stockQuantity}/${p.minAlertStock})`),
      todaySales: Math.round(sum(todayInv)),
      todayInvoices: todayInv.length,
      monthSales: Math.round(sum(monthInv)),
      monthInvoices: monthInv.length,
      topSellersThisMonth: topSellers,
    },
  };
}

export async function sendVoiceCommandToServer(
  command: string,
  parts: AutoPart[],
  customers: Customer[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  shop?: ReturnType<typeof buildShopSnapshot>,
  uiLang: 'ar' | 'en' = 'ar'
): Promise<AICommandResult> {
  let response: Response;
  try {
    response = await fetch('/api/ai/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-license-key': loadDeviceLicenseKey(),
      },
      body: JSON.stringify({
        command,
        uiLang,
        shop,
        conversationHistory: conversationHistory.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 600) })),
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
        customers: customers.map((c) => ({ id: c.id, name: c.name })), // الاسم فقط (بدون رصيد أو هاتف)
      }),
    });
  } catch (error) {
    console.error('AI endpoint unreachable:', error);
    throw new Error(detectLang(command) === 'ar'
      ? 'تعذر الاتصال بالمساعد. تأكد من الإنترنت وحاول مرة أخرى. لم يتم تنفيذ أي شيء.'
      : 'Could not reach the assistant. Check your connection and try again. Nothing was executed.');
  }

  if (!response.ok) {
    // نعرض سبب الخطأ الحقيقي من الخادم (مفتاح Gemini ناقص، حد الاستخدام...) بدل رسالة عامة
    const err = await response.json().catch(() => ({} as any));
    throw new Error(String(err?.error || `تعذر الاتصال بالمساعد (${response.status}). لم يتم تنفيذ أي شيء.`));
  }

  const data: AICommandResult & { reply?: string } = await response.json();
  const lang = data.lang || detectLang(command, uiLang);
  const context = conversationHistory.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  return verifyCommandResult(
    {
      ...data,
      lang,
      spokenFeedback: data.reply || data.spokenFeedback,
      timestamp: new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    },
    command,
    parts,
    customers,
    context
  );
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
  customers: Customer[],
  context = ''
): AICommandResult {
  const lang = result.lang || detectLang(command);
  const ar = lang === 'ar';
  const time = result.timestamp || new Date().toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ask = (arText: string, enText: string): AICommandResult => ({ action: 'GENERAL_ANSWER', spokenFeedback: ar ? arText : enText, timestamp: time, lang });

  if (result.action === 'EXECUTE_SALE' || result.action === 'RESTOCK_ITEM' || result.action === 'INVENTORY_AUDIT' || result.action === 'ADD_PURCHASE') {
    // 1) مطابقة نصية على كلام المستخدم، 2) مع سياق المحادثة (للمتابعات مثل «خليها 3»)
    let res = resolvePart(command, parts, result.matchedPartId);
    if (res.status !== 'ok' && context) res = resolvePart(`${context} ${command}`, parts, result.matchedPartId);
    let chosen: AutoPart | undefined = res.status === 'ok' ? res.part : undefined;
    // 3) كلام بلغة مختلفة عن اسم الصنف (مثلاً «oil filter» لصنف «فلتر زيت»): نقبل اختيار Gemini
    //    فقط لو كان واثقاً جداً والصنف موجود فعلاً؛ والتنفيذ لا يتم إلا بعد تأكيد المستخدم لما سيظهر له.
    if (!chosen && result.matchedPartId && result.partConfidence === 'high') {
      chosen = parts.find((p) => p.id === result.matchedPartId);
    }
    if (!chosen) {
      if (res.status === 'ambiguous') {
        const names = res.candidates.map((p) => `${p.name} (${p.brand}${p.partNumber ? ' - ' + p.partNumber : ''})`).join(' / ');
        return ask(`وجدت أكثر من صنف مناسب: ${names}. حدد الصنف أو الماركة بدقة أكثر.`, `I found several matching parts: ${names}. Please specify the part or brand.`);
      }
      // الرد الحواري من Gemini غالباً يحتوي سؤالاً توضيحياً مفيداً
      if (result.spokenFeedback && result.action !== 'ADD_PURCHASE') return { ...result, action: 'GENERAL_ANSWER', matchedPartId: undefined, timestamp: time, lang };
      return ask(`لم أجد في المخزون صنفاً يطابق كلامك. اذكر اسم الصنف كما هو مسجل. لم أنفذ أي شيء.`, `I couldn't find a matching part in stock. Please say the part name as registered. Nothing was executed.`);
    }
    if (result.action === 'ADD_PURCHASE' && (!result.supplierName || !(Number(result.unitCost) > 0))) {
      return ask('لفاتورة التوريد قل اسم المورد والكمية وسعر الشراء للوحدة. لم أسجل شيئاً.', 'For a purchase invoice please tell me the supplier, quantity and unit cost. Nothing was recorded.');
    }
    const rawQty = Number(result.quantity);
    const quantity = Number.isInteger(rawQty) && rawQty >= 1 && rawQty <= 1000 ? rawQty : extractQuantity(command);
    return { ...result, matchedPartId: chosen.id, matchedPartName: chosen.name, quantity, lang };
  }

  if (result.action === 'ADD_EXPENSE') {
    const amount = Number(result.expenseAmount) > 0 ? Number(result.expenseAmount) : firstAmount(command);
    if (!amount) return ask('كم مبلغ المصروف؟ لم أسجل شيئاً.', 'What is the expense amount? Nothing was recorded.');
    return { ...result, expenseAmount: amount, lang };
  }

  if (result.action === 'COLLECT_CUSTOMER') {
    const amount = Number(result.customerCollectionAmount) > 0 ? Number(result.customerCollectionAmount) : firstAmount(command);
    const cust = findCustomer(`${result.customerName || ''} ${command}`, customers);
    if (!cust || !amount) return ask('حدد اسم العميل أو الورشة والمبلغ بوضوح. لم أنفذ أي شيء.', 'Please state the customer name and the amount clearly. Nothing was executed.');
    return { ...result, customerName: cust.name, customerCollectionAmount: amount, lang };
  }

  if (result.action === 'SETTLE_SUPPLIER') {
    const amount = Number(result.supplierPaymentAmount) > 0 ? Number(result.supplierPaymentAmount) : firstAmount(command);
    if (!result.supplierName || !amount) return ask('حدد اسم المورد والمبلغ بوضوح. لم أنفذ أي شيء.', 'Please state the supplier name and the amount clearly. Nothing was executed.');
    return { ...result, supplierPaymentAmount: amount, lang };
  }

  return { ...result, lang };
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
  if (/حرج|الحرجه|الحد الادني|قربت تخلص|اوشك/.test(cmd)) return { action: 'NAVIGATE_TAB', targetTab: 'lowstock', spokenFeedback: 'جاري فتح صفحة المخزون الحرج.', timestamp: time };
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

    const ar = hasArabic(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ar ? 'ar-SA' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const voice = ar
      ? voices.find((v) => v.lang.startsWith('ar') || v.name.includes('Arabic') || v.name.includes('Tarek') || v.name.includes('Laila'))
      : voices.find((v) => v.lang.startsWith('en'));
    if (voice) {
      utterance.voice = voice;
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
