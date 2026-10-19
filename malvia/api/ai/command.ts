// المساعد الصوتي: يحوّل الأمر العربي إلى إجراء منظم عبر Gemini. المفتاح في متغيرات Vercel فقط.
const ACTIONS = ['EXECUTE_SALE','INVENTORY_AUDIT','RESTOCK_ITEM','ADD_PURCHASE','SETTLE_SUPPLIER','COLLECT_CUSTOMER',
  'ADD_EXPENSE','QUERY_LOW_STOCK','NAVIGATE_TAB','GENERAL_ANSWER'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY غير مضبوط' });
  try {
    const { command, parts = [], customers = [] } = req.body || {};
    if (!command || typeof command !== 'string') return res.status(400).json({ error: 'command مطلوب' });

    const prompt = `أنت مساعد صوتي لنظام محل قطع غيار سيارات. حوّل أمر المستخدم إلى JSON فقط بدون أي نص آخر.
الحقول: action (واحد من: ${ACTIONS.join(', ')}), matchedPartId, matchedPartName, quantity, customerName, paymentMethod,
expenseTitle, expenseAmount, supplierName, supplierPaymentAmount, customerCollectionAmount,
targetTab (home|pos|inventory|invoices|purchases|suppliers|customers|finance|reports|settings), spokenFeedback (رد عربي قصير مهذب).
قواعد صارمة:
- اختر القطعة من القائمة فقط، ويجب أن يكون اسمها أو رقمها أو موديلها مطابقاً للكلمات التي قالها المستخدم فعلاً. مثال: "فلتر زيت" لا يعني دينامو ولا أي قطعة أخرى.
- إذا لم تجد قطعة تطابق بوضوح، أو وجدت أكثر من قطعة محتملة، فاجعل action = GENERAL_ANSWER واترك matchedPartId فارغاً واسأل المستخدم سؤالاً قصيراً في spokenFeedback. لا تخمّن أبداً.
- لا تخترع أسماء موردين أو عملاء أو مبالغ أو كميات غير مذكورة في الأمر. الكمية الافتراضية 1 فقط للبيع.
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
    if (!r.ok) return res.status(502).json({ error: `Gemini ${r.status}` });
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
    if (!parsed.spokenFeedback) parsed.spokenFeedback = 'تم.';
    return res.status(200).json(parsed);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
