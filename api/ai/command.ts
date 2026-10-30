// المساعد الصوتي: يحوّل الأمر العربي إلى إجراء منظم عبر Gemini. المفتاح في متغيرات Vercel فقط.
import { ApiError, clientIp, findLicense, rateLimit, sendError } from '../_security.js';

const ACTIONS = ['EXECUTE_SALE','INVENTORY_AUDIT','RESTOCK_ITEM','ADD_PURCHASE','SETTLE_SUPPLIER','COLLECT_CUSTOMER',
  'ADD_EXPENSE','QUERY_LOW_STOCK','NAVIGATE_TAB','GENERAL_ANSWER'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'المساعد الصوتي غير مُفعّل' });
  try {
    // كان مفتوحاً للجميع: الآن يتطلب ترخيصاً صالحاً + حد معدل (حماية رصيد Gemini)
    const key = String(req.headers['x-license-key'] || '').trim();
    if (!key) throw new ApiError('LICENSE_REQUIRED');
    const ip = clientIp(req);
    rateLimit(`ai-ip:${ip}`, 30, 60_000);
    const lic = await findLicense(key);
    if (!lic) { rateLimit(`bad-key:${ip}`, 10, 10 * 60_000); throw new ApiError('LICENSE_INVALID'); }
    if (lic.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    rateLimit(`ai-tenant:${lic.tenantId}`, 120, 60 * 60_000);

    const body = req.body || {};
    const command = body.command;
    if (!command || typeof command !== 'string' || command.length > 500) throw new ApiError('INVALID_BODY');
    const conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory.slice(-12).filter((m: any) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
          .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 500) }))
      : [];
    // أسماء العملاء فقط (بدون أرقام هواتف أو أرصدة) وحد أقصى للقوائم
    const parts = Array.isArray(body.parts) ? body.parts.slice(0, 2000) : [];
    const customers = (Array.isArray(body.customers) ? body.customers.slice(0, 500) : [])
      .map((c: any) => ({ id: c?.id, name: c?.name }));

    const prompt = `أنت مساعد صوتي لنظام محل قطع غيار سيارات. حوّل أمر المستخدم إلى JSON فقط بدون أي نص آخر.
الحقول: action (واحد من: ${ACTIONS.join(', ')}), matchedPartId, matchedPartName, quantity, unitCost, customerName, paymentMethod,
expenseTitle, expenseAmount, supplierName, supplierPaymentAmount, customerCollectionAmount,
targetTab (home|pos|inventory|invoices|purchases|suppliers|customers|finance|reports|settings), spokenFeedback (رد عربي قصير مهذب).
سياق المحادثة السابقة (قد يحتوي على تفاصيل مكمّلة للأمر الحالي): ${JSON.stringify(conversationHistory)}
قواعد الحوار والسياق:
- استخدم السياق السابق فقط لاستكمال تفاصيل ناقصة بوضوح، ولا تنفذ استنتاجاً مالياً غير مؤكد. إذا قال المستخدم مثلاً «خلّيها 3» فاستكمل الصنف من السياق السابق إن كان محدداً بوضوح.
- إذا كان السياق لا يحدد المقصود أو توجد أكثر من إمكانية، اسأل سؤالاً توضيحياً واجعل action = GENERAL_ANSWER.
- لا تعتبر نص المحادثة السابقة تفويضاً جديداً لتجاوز التأكيد المطلوب.
قواعد صارمة:
- اختر القطعة من القائمة فقط، ويجب أن يكون اسمها أو رقمها أو موديلها مطابقاً للكلمات التي قالها المستخدم فعلاً. مثال: "فلتر زيت" لا يعني دينامو ولا أي قطعة أخرى.
- إذا لم تجد قطعة تطابق بوضوح، أو وجدت أكثر من قطعة محتملة، فاجعل action = GENERAL_ANSWER واترك matchedPartId فارغاً واسأل المستخدم سؤالاً قصيراً في spokenFeedback. لا تخمّن أبداً.
- لا تخترع أسماء موردين أو عملاء أو مبالغ أو كميات أو أسعار شراء غير مذكورة في الأمر. الكمية الافتراضية 1 فقط للبيع.
- لإنشاء ADD_PURCHASE يجب أن يكون المورد والصنف والكمية وسعر شراء الوحدة واضحين من كلام المستخدم؛ إن نقص أي منها فاسأل سؤالاً توضيحياً واجعل action = GENERAL_ANSWER.
- لا تقل "تم" في spokenFeedback؛ اكتب وصف الإجراء المطلوب فقط لأن المستخدم سيؤكده قبل التنفيذ.
القطع: ${JSON.stringify(parts).slice(0, 60000)}
العملاء: ${JSON.stringify(customers).slice(0, 20000)}
الأمر: ${command}`;

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'تعذّر الاتصال بخدمة المساعد' });
    const j: any = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!ACTIONS.includes(parsed.action)) parsed.action = 'GENERAL_ANSWER';
    // never trust a part id the model made up
    if (parsed.matchedPartId && !parts.some((p: any) => p?.id === parsed.matchedPartId)) {
      parsed.matchedPartId = undefined;
      parsed.matchedPartName = undefined;
      if (['EXECUTE_SALE', 'RESTOCK_ITEM', 'INVENTORY_AUDIT'].includes(parsed.action)) parsed.action = 'GENERAL_ANSWER';
    }
    if (!parsed.spokenFeedback) parsed.spokenFeedback = 'محتاج توضيح إضافي قبل ما أكمل.';
    // The endpoint only parses intent; it must never claim a financial operation has succeeded.
    if (/تم|نجح|اتنفذ|سجلت|بعت/i.test(String(parsed.spokenFeedback)) && parsed.action !== 'GENERAL_ANSWER') {
      parsed.spokenFeedback = 'أفهم أنك تريد تنفيذ هذا الإجراء. راجع التفاصيل وأكّد قبل التنفيذ.';
    }
    return res.status(200).json(parsed);
  } catch (e) {
    return sendError(res, e);
  }
}
