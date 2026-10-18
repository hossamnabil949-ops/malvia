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
اختر القطعة من القائمة فقط بالمطابقة على الاسم/الرقم/الموديل، ولا تخترع معرفات.
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
    if (!parsed.spokenFeedback) parsed.spokenFeedback = 'تم.';
    return res.status(200).json(parsed);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
