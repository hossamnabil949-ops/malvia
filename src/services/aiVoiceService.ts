import { AutoPart, Customer, Invoice, Supplier } from '../types/autoParts';
import { loadDeviceLicenseKey } from './tenantService';
import { cairoDateKey, netSales } from '../utils/reportsLogic';

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
  shopName?: string,
  supplierPaymentSchedules: Array<{ id: string; supplierId: string; supplierName: string; amount: number; amountPaid: number; dueDate: string; status: string; notes?: string }> = []
) {
  const today = cairoDateKey(new Date());
  const month = today.slice(0, 7);
  const live = invoices.filter((i) => i.status !== 'ملغاة');
  const sum = (list: Invoice[]) => list.reduce((t, i) => t + netSales(i), 0);
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
    supplierPaymentSchedules: supplierPaymentSchedules.map(p => ({ ...p })),
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

/**
 * MALVIA Internal AI Router — deterministic answers from the shop snapshot.
 * These intents are answered locally and never call Gemini or an external agent.
 */
function answerInternalShopQuery(command: string, parts: AutoPart[], customers: Customer[], suppliers: Supplier[], shop?: ReturnType<typeof buildShopSnapshot>, uiLang: 'ar' | 'en' = 'ar'): AICommandResult | null {
  const lang: 'ar' | 'en' = hasArabic(command) ? 'ar' : (/[a-z]/i.test(command) ? 'en' : uiLang);
  const time = new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const q = normalizeArabic(command);
  const answer = (spokenFeedback: string, extra: Partial<AICommandResult> = {}): AICommandResult => ({ action: 'GENERAL_ANSWER', spokenFeedback, timestamp: time, lang, ...extra });

  // Supplier installment questions are answered locally from the tenant's saved schedule.
  const scheduleIntent = /(دفعة|الدفعات|الدفعة|ميعاد الدف|موعد الدف|القادمه|الجايه|متاخره|المتأخره)/.test(q);
  if (scheduleIntent) {
    const rows = (shop as any)?.supplierPaymentSchedules as Array<{supplierId:string;supplierName:string;amount:number;amountPaid:number;dueDate:string;status:string}> | undefined;
    if (!rows || rows.length === 0) return answer('لا توجد دفعات موردين مجدولة في النظام حتى الآن.');
    const supplierTerms = suppliers.map(x => ({ supplier:x, tokens: normalizeArabic(x.name).split(' ').filter(w => w.length > 2) }));
    const spoken = q.split(' ').filter(w => w.length > 2 && !['دفعة','الدفعات','الدفعة','القادمة','القادمه','الجاية','الجايه','مورد','المورد','ميعاد','موعد','كام','امتى'].includes(w));
    const matched = supplierTerms.map(x => ({...x, score: spoken.filter(w => x.tokens.includes(w)).length})).filter(x => x.score > 0).sort((a,b)=>b.score-a.score);
    if (spoken.length && (!matched.length || (matched[1] && matched[1].score === matched[0].score))) return answer('لم أستطع تحديد المورد بشكل فريد. اذكر اسم المورد كما هو مسجل.');
    const selected = matched[0]?.supplier;
    const today = cairoDateKey(new Date());
    const pending = rows.filter(x => x.status === 'scheduled' && x.amount > x.amountPaid && (!selected || x.supplierId === selected.id)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    if (!pending.length) return answer(selected ? 'لا توجد دفعات مجدولة متبقية للمورد ' + selected.name + '.' : 'لا توجد دفعات مجدولة متبقية.');
    const overdue = pending.filter(x => x.dueDate < today);
    if (/(متاخره|المتأخره)/.test(q)) {
      const list = overdue.slice(0,8).map(x => x.supplierName + ': ' + (x.amount-x.amountPaid).toLocaleString('ar-EG') + ' جنيه، ' + x.dueDate).join('؛ ');
      return answer(list || 'لا توجد دفعات متأخرة.');
    }
    const next = pending[0];
    return answer('الدفعة القادمة للمورد ' + next.supplierName + ': ' + (next.amount-next.amountPaid).toLocaleString('ar-EG') + ' جنيه، وموعدها ' + next.dueDate + (next.dueDate < today ? ' (متأخرة)' : '') + '.');
  }

  // Local inventory lookup: no network or model call.
  if (/(كم|باقي|فاضل|متبقي|رصيد|مخزون|عندنا|الموجود|جرد|شوفلي)/.test(q)) {
    const match = resolvePart(command, parts);
    if (match.status === 'ok') {
      const p = match.part;
      return answer(lang === 'ar'
        ? `المتبقي من ${p.name}: ${p.stockQuantity} ${p.unit || 'قطعة'}، ومكانه ${p.shelfLocation || 'غير محدد'}.`
        : `${p.name}: ${p.stockQuantity} ${p.unit || 'units'} in stock. Location: ${p.shelfLocation || 'not specified'}.`,
        { action: 'INVENTORY_AUDIT', matchedPartId: p.id, matchedPartName: p.name, partConfidence: 'high' });
    }
    if (match.status === 'ambiguous') {
      const names = match.candidates.slice(0, 4).map(p => p.name).join(' / ');
      return answer(lang === 'ar' ? `وجدت أكثر من صنف محتمل: ${names}. حدد الصنف أو الماركة.` : `Multiple possible parts: ${names}. Please specify the part or brand.`);
    }
  }

  const summary: any = shop?.summary || {};

  // Customer balance questions are strictly local. Never forward a customer name/balance query externally.
  const exactCustomerMatch = customers
    .map((customer) => ({ customer, normalizedName: normalizeArabic(customer.name) }))
    .filter(({ normalizedName }) => normalizedName.length > 2 && q.includes(normalizedName))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length)[0]?.customer;
  // Fallback for names with extra descriptors (e.g. "مركز الأمانة - فرع ...").
  const queryTokens = q.split(' ').filter(token => token.length > 1 && !['رصيد','مديون','عليه','حساب','باقي','مستحق','العميل','للعميل','عميل','ورشه'].includes(token));
  const rankedCustomers = customers.map(customer => {
    const nameTokens = normalizeArabic(customer.name).split(' ').filter(token => token.length > 1);
    const hits = nameTokens.filter(token => queryTokens.some(queryToken => queryToken === token || (queryToken.length >= 4 && token.startsWith(queryToken)) || (token.length >= 4 && queryToken.startsWith(token)))).length;
    return { customer, hits, nameTokenCount: nameTokens.length };
  }).sort((a, b) => b.hits - a.hits);
  const fuzzyTop = rankedCustomers[0];
  const fuzzyCustomerMatch = fuzzyTop && fuzzyTop.hits >= 2 ? fuzzyTop.customer : undefined;
  const customerMatch = exactCustomerMatch || fuzzyCustomerMatch;
  const customerBalanceIntent = /(رصيد|مديون|عليه|حساب|باقي|مستحق)/.test(q) && (/(عميل|للعميل|العميل|حساب|ورشه|ورشة|مركز)/.test(q) || !!customerMatch);

  if (customerBalanceIntent) {
    if (customerMatch) {
      const balance = Number(customerMatch.balance);
      return answer(lang === 'ar'
        ? `رصيد العميل ${customerMatch.name}: ${Number.isFinite(balance) ? balance.toLocaleString('ar-EG') : 'غير متاح'} جنيه.`
        : `Customer ${customerMatch.name} balance: ${Number.isFinite(balance) ? balance.toLocaleString() : 'unavailable'}.`);
    }
    const requestedName = q
      .replace(/رصيد|مديون|عليه|حساب|باقي|مستحق|العميل|للعميل|عميل/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return answer(lang === 'ar'
      ? (requestedName ? `لم أجد عميلاً باسم "${requestedName}" في بيانات المحل الحالية.` : 'من فضلك اذكر اسم العميل لمعرفة رصيده.')
      : (requestedName ? `I could not find a customer named "${requestedName}" in this shop data.` : 'Please provide the customer name to check the balance.'));
  }
  const supplierBalances = suppliers.filter((supplier) => Number(supplier.balance) > 0).map((supplier) => ({ name: supplier.name, balance: Number(supplier.balance) || 0 }));
  const supplierMatch = supplierBalances.find((supplier) => {
    const name = normalizeArabic(supplier.name);
    return name.length > 1 && q.includes(name);
  });
  if (supplierMatch && /(رصيد|مديون|عليه|حساب|باقي|مستحق|للمورد)/.test(q)) {
    return answer(lang === 'ar'
      ? `المستحق للمورد ${supplierMatch.name}: ${Number(supplierMatch.balance || 0).toLocaleString('ar-EG')} جنيه.`
      : `Amount payable to ${supplierMatch.name}: ${Number(supplierMatch.balance || 0).toLocaleString()}.`);
  }
  if (/(اجمالي مديونيه العملاء|مديونيات العملاء|ارصده العملاء|مستحقات العملاء|customer receivables)/.test(q)) {
    return answer(lang === 'ar'
      ? `إجمالي مديونيات العملاء ${customers.reduce((total, customer) => total + Math.max(0, Number(customer.balance) || 0), 0).toLocaleString('ar-EG')} جنيه، وعدد العملاء أصحاب الأرصدة ${customers.filter((customer) => Number(customer.balance) > 0).length}.`
      : `Customer receivables total ${Number(summary.customerReceivables || 0).toLocaleString()} across ${Number(summary.customersWithBalances || 0)} customers.`);
  }
  if (/(اجمالي مديونيه الموردين|مستحقات الموردين|حسابات الموردين|supplier payables)/.test(q)) {
    return answer(lang === 'ar'
      ? `إجمالي المستحق للموردين ${suppliers.reduce((total, supplier) => total + Math.max(0, Number(supplier.balance) || 0), 0).toLocaleString('ar-EG')} جنيه، وعدد الموردين أصحاب الأرصدة ${suppliers.filter((supplier) => Number(supplier.balance) > 0).length}.`
      : `Supplier payables total ${Number(summary.supplierPayables || 0).toLocaleString()} across ${Number(summary.suppliersWithBalances || 0)} suppliers.`);
  }
  if (/(مبيعات اليوم|بيع اليوم|حصيله اليوم|اجمالي اليوم|today sales)/.test(q) && Number.isFinite(Number(summary.todaySales))) {
    return answer(lang === 'ar'
      ? `إجمالي مبيعات اليوم ${Number(summary.todaySales).toLocaleString('ar-EG')} جنيه من ${Number(summary.todayInvoices || 0)} فاتورة.`
      : `Today's sales are ${Number(summary.todaySales).toLocaleString()} across ${Number(summary.todayInvoices || 0)} invoices.`);
  }
  if (/(مبيعات الشهر|بيع الشهر|اجمالي الشهر|الشهر الحالي|month sales)/.test(q) && Number.isFinite(Number(summary.monthSales))) {
    return answer(lang === 'ar'
      ? `إجمالي مبيعات الشهر ${Number(summary.monthSales).toLocaleString('ar-EG')} جنيه من ${Number(summary.monthInvoices || 0)} فاتورة.`
      : `This month's sales are ${Number(summary.monthSales).toLocaleString()} across ${Number(summary.monthInvoices || 0)} invoices.`);
  }
  if (/(اصناف ناقصه|الاصناف الناقصه|نواقص المخزون|المخزون الناقص|out of stock)/.test(q)) {
    const names = Array.isArray(summary.outOfStock) ? summary.outOfStock : [];
    return answer(lang === 'ar'
      ? (names.length ? `الأصناف النافدة (${summary.outOfStockCount ?? names.length}): ${names.join('، ')}.` : 'لا توجد أصناف نافدة حسب بيانات المخزون الحالية.')
      : (names.length ? `Out of stock (${summary.outOfStockCount ?? names.length}): ${names.join(', ')}.` : 'There are no out-of-stock items in the current inventory data.'));
  }
  return null;
}

/**
 * Fail-closed local route for customer balance lookups.
 * These requests must never be sent to an external AI, even when customer data
 * has not loaded yet or a customer name cannot be matched.
 */
export function answerCustomerBalanceLookup(
  command: string, customers: Customer[] | undefined, uiLang: 'ar' | 'en', suppliers: Supplier[] | undefined = []
): AICommandResult | null {
  const q = normalizeArabic(command);
  const supplierWords = new Set(['مورد', 'المورد', 'للمورد', 'موردين', 'الموردين']);
  const customerWords = new Set(['عميل', 'العميل', 'للعميل', 'عملاء', 'العملاء', 'ورشه', 'الورشه', 'ورشة', 'الورشة', 'مركز', 'المركز']);
  const words = q.split(' ').filter(Boolean);
  const hasSupplier = words.some(w => supplierWords.has(w));
  const hasCustomer = words.some(w => customerWords.has(w));
  const balanceIntent = /(رصيد|ارصده|مديونيه|مديون|مستحق|مستحقات|حساب|باقي)/.test(q);
  if (!balanceIntent) return null;

  // Aggregate questions belong to reports, not an individual-record lookup.
  const aggregateIntent = /(اجمالي|مجموع|كل|عام|ارصده العملاء|ارصده الموردين|مديونيه العملاء|مديونيه الموردين|حسابات العملاء|حسابات الموردين)/.test(q);
  if (aggregateIntent) return null;

  const lang: 'ar' | 'en' = hasArabic(command) ? 'ar' : uiLang;
  const now = new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const answer = (spokenFeedback: string): AICommandResult => ({ action: 'GENERAL_ANSWER', spokenFeedback, timestamp: now, lang });
  const clarify = lang === 'ar'
    ? 'هل تقصد رصيد عميل/ورشة أم مستحقات مورد؟ من فضلك حدد النوع والاسم.'
    : 'Do you mean a customer/workshop balance or a supplier balance? Please specify the type and name.';

  if (hasSupplier && hasCustomer) return answer(clarify);

  const stop = new Set([
    'رصيد','ارصده','مديونيه','مديون','عليه','حساب','باقي','مستحق','مستحقات',
    ...supplierWords, ...customerWords,
    'كم','ما','هو','هي','من','فضلك','لو','سمحت','عايز','عاوزه','عاوز','اريد','اعرف',
    'لدي','عند','جنيه','اجمالي','مجموع','كل'
  ]);
  const requestedTokens = words.filter(t => t.length > 1 && !stop.has(t));
  const requestedName = requestedTokens.join(' ').trim();
  const explicitType = hasSupplier || hasCustomer;
  if (!requestedName) {
    return answer(lang === 'ar'
      ? (hasSupplier ? 'من فضلك اذكر اسم المورد.' : hasCustomer ? 'من فضلك اذكر اسم العميل أو الورشة.' : clarify)
      : (hasSupplier ? 'Please provide the supplier name.' : hasCustomer ? 'Please provide the customer or workshop name.' : clarify));
  }

  const descriptorWords = new Set(['ورشه','مركز','المركز','الاسطى','الاسطي','الاستاذ','استاذ','المعلم','معلم','مورد','المورد','عميل','العميل']);
  const cleanTokens = (value: string) => normalizeArabic(value).split(' ').filter(Boolean)
    .filter(token => !descriptorWords.has(token));
  const queryTokens = cleanTokens(requestedName);
  if (!queryTokens.length) return answer(clarify);

  const rank = (source: Customer[] | Supplier[] | undefined) => (Array.isArray(source) ? source : [])
    .map(record => {
      const nameTokens = cleanTokens(record.name || '');
      const matched = queryTokens.filter(token => nameTokens.some(nameToken =>
        token === nameToken || (token.length >= 5 && nameToken.length >= 5 &&
          (token.startsWith(nameToken) || nameToken.startsWith(token)))
      )).length;
      const exact = queryTokens.length === nameTokens.length &&
        queryTokens.every(token => nameTokens.includes(token));
      return { record, matched, exact, score: matched / Math.max(queryTokens.length, nameTokens.length, 1) };
    })
    .filter(item => item.matched > 0)
    .sort((a,b) => Number(b.exact) - Number(a.exact) || b.score - a.score || b.matched - a.matched);

  const customerMatches = rank(customers);
  const supplierMatches = rank(suppliers);

  if (!explicitType && customerMatches[0] && supplierMatches[0]) return answer(clarify);

  const matches = hasSupplier ? supplierMatches : hasCustomer ? customerMatches
    : customerMatches.length ? customerMatches : supplierMatches;
  const kindIsSupplier = hasSupplier || (!hasCustomer && !customerMatches.length && !!supplierMatches.length);
  const kind = kindIsSupplier ? 'المورد' : 'العميل أو الورشة';
  const top = matches[0];
  const second = matches[1];
  // Accept a shortened registered name when every spoken token matches
  // exactly one supplier/customer record (e.g. "مؤسسة الأهرام").
  const uniqueCompleteTokenMatch = !!top && top.matched === queryTokens.length &&
    matches.filter(item => item.matched === queryTokens.length).length === 1;
  const uniqueSingleTokenMatch = queryTokens.length === 1 && !!top && top.matched === 1 &&
    matches.filter(item => item.matched === 1).length === 1;
  if (!top || (!top.exact && !uniqueCompleteTokenMatch && !uniqueSingleTokenMatch &&
    (top.matched < queryTokens.length || top.score < 0.75))) {
    return answer(lang === 'ar'
      ? 'لم أجد ' + kind + ' بمطابقة مؤكدة للاسم "' + requestedName + '". من فضلك اكتب الاسم كما هو مسجل. لم يتم إرسال الطلب إلى خدمة خارجية.'
      : 'No confident ' + (hasSupplier ? 'supplier' : 'customer') + ' match was found. Please enter the registered name. This request was not sent externally.');
  }
  // Never choose between close candidates, even if one ranks marginally higher.
  if (second && (second.exact || top.exact || top.score - second.score < 0.20)) {
    return answer(lang === 'ar'
      ? 'وجدت أكثر من سجل قريب من "' + requestedName + '". من فضلك اكتب الاسم الكامل لتمييز السجل.'
      : 'More than one record closely matches "' + requestedName + '". Please provide the full name.');
  }

  const balance = Number(top.record.balance);
  return answer(lang === 'ar'
    ? (kindIsSupplier ? 'المستحق للمورد ' : 'رصيد العميل ') + top.record.name + ': ' + (Number.isFinite(balance) ? balance.toLocaleString('ar-EG') : 'غير متاح') + ' جنيه.'
    : (kindIsSupplier ? 'Amount payable to ' : 'Customer balance for ') + top.record.name + ': ' + (Number.isFinite(balance) ? balance.toLocaleString() : 'unavailable') + '.');
}

export async function sendVoiceCommandToServer(
  command: string,
  parts: AutoPart[],
  customers: Customer[],
  suppliers: Supplier[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  shop?: ReturnType<typeof buildShopSnapshot>,
  uiLang: 'ar' | 'en' = 'ar'
): Promise<AICommandResult> {
  const customerBalanceAnswer = answerCustomerBalanceLookup(command, customers, uiLang, suppliers);
  if (customerBalanceAnswer) return customerBalanceAnswer;

  const internalAnswer = answerInternalShopQuery(command, parts, customers || [], suppliers || [], shop, uiLang);
  if (internalAnswer) return internalAnswer;
  // Financial installment records are local-only; never include them in the external AI payload.
  const { supplierPaymentSchedules: _privateSchedules, ...externalShop } = shop || {};
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
        shop: externalShop,
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
  // Remove occasional model/debug suffixes (for example "(index):1") from user-facing speech.
  const cleanReply = String(data.reply || data.spokenFeedback || '').replace(/\\s*\\(index\\)\\s*:?\\s*\\d*\\s*$/i, '').trim();
  if (!cleanReply) throw new Error(lang === 'ar' ? 'وصل رد غير مكتمل من المساعد. أعد صياغة الأمر؛ لم يتم تنفيذ أي شيء.' : 'The assistant returned an incomplete reply. Please rephrase; nothing was executed.');
  const context = conversationHistory.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  return verifyCommandResult(
    {
      ...data,
      lang,
      spokenFeedback: cleanReply,
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
