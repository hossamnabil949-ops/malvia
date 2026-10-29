import { computeTotals, validateSale, deductStock, refundForLine, SaleError } from '../src/utils/saleLogic.ts';
import assert from 'node:assert/strict';

const line = { partId: 'p1', qty: 2, unitPrice: 100, unitCost: 60 };
const t = computeTotals([line], 20, 14, true);            // 200 - 20 = 180 + 14% = 25.2 => 205.20
assert.deepEqual(t, { subtotal: 20000, discount: 2000, tax: 2520, grandTotal: 20520 });

const ok = [{ method: 'كاش' as const, amount: 100 }, { method: 'فيزا' as const, amount: 105.2 }];
validateSale([line], [{ id: 'p1', stockQuantity: 2 }], t, ok, { allowBelowCost: false });   // يمر

const code = (fn: () => void) => { try { fn(); } catch (e) { return (e as SaleError).code; } return 'NO_ERROR'; };
assert.equal(code(() => validateSale([line], [{ id: 'p1', stockQuantity: 1 }], t, ok, { allowBelowCost: false })), 'OUT_OF_STOCK');
assert.equal(code(() => validateSale([line], [{ id: 'p1', stockQuantity: 5 }], t, [{ method: 'كاش', amount: 100 }], { allowBelowCost: false })), 'PAYMENT_MISMATCH');
assert.equal(code(() => validateSale([{ ...line, unitPrice: 50 }], [{ id: 'p1', stockQuantity: 5 }], computeTotals([{ ...line, unitPrice: 50 }], 0, 14, false), [{ method: 'كاش', amount: 100 }], { allowBelowCost: false })), 'PRICE_BELOW_COST');
assert.equal(code(() => validateSale([line], [{ id: 'p1', stockQuantity: 5 }], t, [{ method: 'آجل', amount: 205.2 }], { allowBelowCost: false })), 'CREDIT_REQUIRES_CUSTOMER');
assert.equal(code(() => computeTotals([line], 999, 14, true)), 'DISCOUNT_EXCEEDS_SUBTOTAL');
assert.equal(code(() => deductStock([{ id: 'p1', stockQuantity: 1 }], [line])), 'OUT_OF_STOCK');
assert.equal(deductStock([{ id: 'p1', stockQuantity: 5 }], [line])[0].stockQuantity, 3);

// مرتجع: سطر إجماليه 205.20 لكمية 2 => رجوع قطعة = 102.60 (وليس 100 = سعر الوحدة)
assert.equal(refundForLine(205.2, 2, 1, 0), 102.6);
assert.equal(code(() => { refundForLine(205.2, 2, 2, 1); }), 'INVALID_QTY');

// ---------- سياسة الخصم (10% كحد أقصى، ولا أقل من التكلفة) ----------
import { validateDiscountPolicy } from '../src/utils/saleLogic.ts';
{
  const L = { qty: 2, listPrice: 100, unitPrice: 100, unitCost: 60 };
  validateDiscountPolicy([L], 0);                                              // بدون خصم
  validateDiscountPolicy([L], 20);                                             // 10% بالضبط مقبول
  validateDiscountPolicy([{ ...L, unitPrice: 90 }], 0);                        // سعر الصنف -10% مقبول
  assert.equal(code(() => validateDiscountPolicy([L], 20.01)), 'DISCOUNT_OVER_LIMIT');
  assert.equal(code(() => validateDiscountPolicy([{ ...L, unitPrice: 89 }], 0)), 'DISCOUNT_OVER_LIMIT');
  assert.equal(code(() => validateDiscountPolicy([{ ...L, unitPrice: 90 }], 10)), 'DISCOUNT_OVER_LIMIT'); // تراكم تعديل السعر + خصم الفاتورة
  assert.equal(code(() => validateDiscountPolicy([{ ...L, unitCost: 95, unitPrice: 100 }], 15)), 'PRICE_BELOW_COST'); // الصافي أقل من التكلفة
  assert.equal(code(() => validateDiscountPolicy([{ ...L, unitCost: 100, unitPrice: 99 }], 0)), 'PRICE_BELOW_COST');
  validateDiscountPolicy([{ ...L, unitPrice: 120 }], 0);                       // رفع السعر مسموح (للمالك فقط عبر الباسورد)
}

// ---------- حد الائتمان ----------
{
  const L = { partId: 'p1', qty: 1, unitPrice: 100, unitCost: 60 };
  const tt = computeTotals([L], 0, 0, false);
  const stock = [{ id: 'p1', stockQuantity: 5 }];
  const credit = [{ method: 'آجل', amount: 100 }];
  const base = { allowBelowCost: false, customerId: 'c1' };
  validateSale([L], stock, tt, credit, { ...base, customerBalance: 400, customerCreditLimit: 500 });                 // 400+100 = الحد بالضبط: مقبول
  assert.equal(code(() => validateSale([L], stock, tt, credit, { ...base, customerBalance: 401, customerCreditLimit: 500 })), 'CREDIT_LIMIT_EXCEEDED');
  validateSale([L], stock, tt, credit, { ...base, customerBalance: 99999, customerCreditLimit: 0 });                 // بدون حد = غير محدود
  validateSale([L], stock, tt, [{ method: 'كاش', amount: 100 }], { ...base, customerBalance: 99999, customerCreditLimit: 500 }); // الدفع النقدي لا يتأثر
}

// ---------- المخازن والفروع ----------
import { availableIn, adjustLevel, adjustLevels, validateTransfer, applyTransfer, TransferError, MAIN_WAREHOUSE_ID } from '../src/utils/warehouseLogic.ts';
{
  const tcode = (fn: () => void) => { try { fn(); } catch (e) { return (e as TransferError).code; } return 'NO_ERROR'; };
  const parts = [{ id: 'p1', stockQuantity: 10 }, { id: 'p2', stockQuantity: 4 }];
  let lv: any[] = [];
  assert.equal(availableIn(10, lv, 'p1', 'main'), 10);                                 // بدون مخازن: الكل في الرئيسي
  validateTransfer('main', 'w1', [{ partId: 'p1', qty: 6 }], parts, lv);
  lv = applyTransfer(lv, 'main', 'w1', [{ partId: 'p1', qty: 6 }]);
  assert.equal(availableIn(10, lv, 'p1', 'w1'), 6);
  assert.equal(availableIn(10, lv, 'p1', 'main'), 4);                                  // الرئيسي = 10 - 6
  assert.equal(availableIn(4, lv, 'p2', 'w1'), 0);                                     // صنف لم يُحوَّل
  assert.equal(tcode(() => validateTransfer('main', 'w1', [{ partId: 'p1', qty: 5 }], parts, lv)), 'INSUFFICIENT_STOCK'); // الرئيسي فيه 4 فقط
  assert.equal(tcode(() => validateTransfer('w1', 'w2', [{ partId: 'p1', qty: 7 }], parts, lv)), 'INSUFFICIENT_STOCK');
  assert.equal(tcode(() => validateTransfer('w1', 'w1', [{ partId: 'p1', qty: 1 }], parts, lv)), 'SAME_WAREHOUSE');
  assert.equal(tcode(() => validateTransfer(undefined, MAIN_WAREHOUSE_ID, [{ partId: 'p1', qty: 1 }], parts, lv)), 'SAME_WAREHOUSE');
  assert.equal(tcode(() => validateTransfer('main', 'w1', [], parts, lv)), 'EMPTY');
  assert.equal(tcode(() => validateTransfer('main', 'w1', [{ partId: 'p1', qty: 0 }], parts, lv)), 'INVALID_QTY');
  assert.equal(tcode(() => validateTransfer('main', 'w1', [{ partId: 'p1', qty: 1.5 }], parts, lv)), 'INVALID_QTY');
  assert.equal(tcode(() => validateTransfer('main', 'w1', [{ partId: 'p1', qty: 3 }, { partId: 'p1', qty: 2 }], parts, lv)), 'INSUFFICIENT_STOCK'); // تجميع نفس الصنف
  // فرع ← فرع: الإجمالي لا يتغير
  lv = applyTransfer(lv, 'w1', 'w2', [{ partId: 'p1', qty: 2 }]);
  assert.equal(availableIn(10, lv, 'p1', 'w1'), 4);
  assert.equal(availableIn(10, lv, 'p1', 'w2'), 2);
  assert.equal(availableIn(10, lv, 'p1', 'main'), 4);
  // فرع ← رئيسي
  lv = applyTransfer(lv, 'w1', 'main', [{ partId: 'p1', qty: 4 }]);
  assert.equal(availableIn(10, lv, 'p1', 'main'), 8);
  // بيع 3 من فرع w2 (الإجمالي ينقص 3 عبر المسار القديم + رصيد الفرع ينقص 3) => الرئيسي لا يتأثر
  const after = adjustLevel(lv, 'p1', 'w2', -2);
  assert.equal(availableIn(7, after, 'p1', 'w2'), 0);
  assert.equal(availableIn(8, after, 'p1', 'main'), 8);
  // استلام مشتريات في فرع جديد ثم عكسها
  const recv = adjustLevels([], 'w9', [{ partId: 'p2', qty: 5 }], 1);
  assert.equal(availableIn(9, recv, 'p2', 'w9'), 5);
  assert.equal(availableIn(9, adjustLevels(recv, 'w9', [{ partId: 'p2', qty: 5 }], -1), 'p2', 'w9'), 0);
  assert.deepEqual(adjustLevel([], 'p1', 'main', 5), []);                              // الرئيسي مشتق: لا سطور
}

// ---------- برنامج الولاء ----------
import { earnedPoints, pointsValue, maxRedeemablePoints, loyaltyAfterReturn, resolveLoyalty } from '../src/utils/loyaltyLogic.ts';
{
  assert.equal(earnedPoints(1000, 10), 100);
  assert.equal(earnedPoints(99.99, 10), 9);                       // تقريب لأسفل
  assert.equal(earnedPoints(0, 10), 0);
  assert.equal(earnedPoints(-5, 10), 0);
  assert.equal(earnedPoints(100, 0), 0);                          // إعداد غير صالح لا يكسر
  assert.equal(pointsValue(100, 0.5), 50);
  assert.equal(pointsValue(3, 0.1), 0.3);                         // لا كسور عائمة
  // أقصى استبدال: رصيد 500 نقطة، قيمة النقطة 0.5، سقف الخصم 40 ج => 80 نقطة
  assert.equal(maxRedeemablePoints({ balance: 500, pointValueEgp: 0.5, minRedeemPoints: 50, capEgp: 40 }), 80);
  assert.equal(maxRedeemablePoints({ balance: 60, pointValueEgp: 0.5, minRedeemPoints: 50, capEgp: 1000 }), 60);   // الرصيد هو القيد
  assert.equal(maxRedeemablePoints({ balance: 40, pointValueEgp: 0.5, minRedeemPoints: 50, capEgp: 1000 }), 0);    // أقل من الحد الأدنى
  assert.equal(maxRedeemablePoints({ balance: 500, pointValueEgp: 0.5, minRedeemPoints: 50, capEgp: 10 }), 0);     // السقف يسمح بـ20 فقط (< الحد الأدنى)
  assert.equal(maxRedeemablePoints({ balance: 500, pointValueEgp: 0.5, minRedeemPoints: 50, capEgp: 0 }), 0);
  // مرتجع: نقاط الفاتورة 100، إجمالي 1000، مرتجع 250 => يبقى 75
  assert.equal(loyaltyAfterReturn(100, 1000, 250), 75);
  assert.equal(loyaltyAfterReturn(100, 1000, 0), 100);
  assert.equal(loyaltyAfterReturn(100, 1000, 1000), 0);
  assert.equal(loyaltyAfterReturn(100, 1000, 5000), 0);           // مرتجع أكبر من الفاتورة لا يعطي سالب
  assert.equal(loyaltyAfterReturn(0, 1000, 100), 0);
  // مرتجعان متتاليان = نفس نتيجة مرتجع واحد بمجموعهما (لا انحراف تراكمي)
  const step = (loyaltyAfterReturn(100, 1000, 0) - loyaltyAfterReturn(100, 1000, 250)) + (loyaltyAfterReturn(100, 1000, 250) - loyaltyAfterReturn(100, 1000, 600));
  assert.equal(step, 100 - loyaltyAfterReturn(100, 1000, 600));
  // الإعدادات الافتراضية: مغلق
  assert.equal(resolveLoyalty(undefined).enabled, false);
  assert.equal(resolveLoyalty({ enabled: true, egpPerPoint: -1 }).egpPerPoint, 10);
}

// ---------- سجل النقاط وصلاحيتها ----------
import { analyzeLoyalty, pendingExpiryEntries, availableBalances, withRunningBalance, addMonths } from '../src/utils/loyaltyLogic.ts';
{
  const E = (id: string, at: string, points: number, extra: any = {}) => ({ id, at, customerId: 'c1', customerName: 'عميل', type: points > 0 ? 'earn' : 'redeem', points, userName: 'u', ...extra });
  assert.equal(addMonths('2026-01-31T00:00:00.000Z', 1), '2026-02-28T00:00:00.000Z');          // قص نهاية الشهر
  assert.equal(addMonths('2026-03-15T10:00:00.000Z', 12), '2027-03-15T10:00:00.000Z');
  // بدون انتهاء: الرصيد = المجموع
  let es: any[] = [E('a', '2026-01-01T00:00:00.000Z', 100), E('b', '2026-01-02T00:00:00.000Z', -30)];
  assert.equal(analyzeLoyalty(es, '2030-01-01T00:00:00.000Z').available, 70);
  // دفعتان بتواريخ انتهاء: الاستبدال يستهلك الأقرب انتهاءً أولاً
  es = [
    E('l1', '2026-01-01T00:00:00.000Z', 100, { expiresAt: '2026-07-01T00:00:00.000Z' }),
    E('l2', '2026-03-01T00:00:00.000Z', 100, { expiresAt: '2026-09-01T00:00:00.000Z' }),
    E('r1', '2026-04-01T00:00:00.000Z', -60),                                                 // يخصم من l1
  ];
  let an = analyzeLoyalty(es, '2026-05-01T00:00:00.000Z');
  assert.equal(an.available, 140);
  assert.equal(an.pendingExpiry.length, 0);
  assert.equal(an.nextExpiryAt, '2026-07-01T00:00:00.000Z');
  assert.equal(an.expiringWithin(70), 40);                                                    // l1 المتبقي 40 خلال 61 يوماً
  // بعد انتهاء l1: المتبقي منها (40) ينتهي، ولا يمكن استبداله ولو لم يُسجَّل انتهاؤه بعد
  an = analyzeLoyalty(es, '2026-07-02T00:00:00.000Z');
  assert.equal(an.available, 100);
  assert.deepEqual(an.pendingExpiry.map(p => [p.lotId, p.points]), [['l1', 40]]);
  const exp = pendingExpiryEntries(es, '2026-07-02T00:00:00.000Z');
  assert.equal(exp.length, 1);
  assert.equal(exp[0].id, 'LYE-l1');                                                          // رقم ثابت
  assert.equal(exp[0].at, '2026-07-01T00:00:00.000Z');                                        // وقت الانتهاء نفسه
  assert.equal(exp[0].points, -40);
  // بعد تسجيل حركة الانتهاء: لا حركات مستحقة جديدة (لا تكرار) والرصيد ثابت
  const es2 = [...es, exp[0]];
  assert.equal(pendingExpiryEntries(es2, '2026-07-02T00:00:00.000Z').length, 0);
  assert.equal(analyzeLoyalty(es2, '2026-07-02T00:00:00.000Z').available, 100);
  assert.equal(analyzeLoyalty(es2, '2026-07-02T00:00:00.000Z').balance, 100);
  // استبدال بعد انتهاء دفعة مسجّلة لا يلمسها: يستهلك l2 فقط
  const es3 = [...es2, E('r2', '2026-08-01T00:00:00.000Z', -30)];
  assert.equal(analyzeLoyalty(es3, '2026-08-02T00:00:00.000Z').available, 70);
  // استبدال في الفترة بين الانتهاء والتسجيل لا يستهلك الدفعة المنتهية
  const es4 = [...es, E('r3', '2026-07-05T00:00:00.000Z', -30)];
  an = analyzeLoyalty(es4, '2026-07-06T00:00:00.000Z');
  assert.equal(an.available, 70);                                                             // l2: 100-30
  assert.deepEqual(an.pendingExpiry.map(p => p.points), [40]);
  // رصيد لكل عميل + رصيد جارٍ مرتب زمنياً
  const two = [E('x', '2026-01-01T00:00:00.000Z', 50), { ...E('y', '2026-01-01T00:00:00.000Z', 20), customerId: 'c2' }];
  const bal = availableBalances(two as any, '2026-02-01T00:00:00.000Z');
  assert.equal(bal.get('c1'), 50); assert.equal(bal.get('c2'), 20);
  assert.deepEqual(withRunningBalance([E('b', '2026-01-02T00:00:00.000Z', -30), E('a', '2026-01-01T00:00:00.000Z', 100)] as any).map(e => e.balanceAfter), [100, 70]);
  // الإعداد الافتراضي: بدون انتهاء
  assert.equal(resolveLoyalty({ enabled: true }).expiryMonths, 0);
  assert.equal(resolveLoyalty({ enabled: true, expiryMonths: 12.7 }).expiryMonths, 12);
}

// ---------- ترتيب حركات نفس الفاتورة (استبدال ثم اكتساب بفارق مللي ثانية) ----------
{
  const E2 = (id: string, at: string, points: number, extra: any = {}) => ({ id, at, customerId: 'c1', customerName: 'ع', type: points > 0 ? 'earn' : 'redeem', points, userName: 'u', ...extra });
  const old = E2('old', '2026-01-01T00:00:00.000Z', 50, { expiresAt: '2026-06-01T00:00:00.000Z' });
  const redeem = E2('r', '2026-05-01T00:00:00.000Z', -40);
  const earn = E2('n', '2026-05-01T00:00:00.001Z', 18, { expiresAt: '2027-05-01T00:00:00.000Z' });
  const an = analyzeLoyalty([earn, redeem, old] as any, '2026-05-02T00:00:00.000Z');         // الترتيب في المصفوفة لا يهم
  assert.equal(an.available, 28);                                                            // 50-40+18
  assert.equal(an.expiringWithin(40), 10);                                                   // المتبقي من القديمة فقط (الاستبدال لم يلمس الجديدة)
}

// ---------- ترتيب كارت الصنف وسطور السداد ----------
import { compareMovements, timestampFromId } from '../src/utils/stockCardOrder.ts';
import { paymentLines, isSplitInvoice } from '../src/utils/paymentLines.ts';
{
  const mv = (kind: any, date: string, doc: string, id?: string) => ({ date, kind, doc, ts: timestampFromId(id) });
  const sorted = [
    mv('sales_return', '2026-10-22', 'RET', 'ret-1761100005000'),
    mv('sale', '2026-10-22', 'INV', 'inv-1761100000000'),
    mv('purchase', '2026-10-22', 'PUR', 'pur-1761099000000'),
    mv('sale', '2026-10-21', 'OLD'),
    mv('sale', '2026-10-22', 'INV2', 'inv-1761100002000'),
  ].sort(compareMovements).map(m => m.doc);
  assert.deepEqual(sorted, ['OLD', 'PUR', 'INV', 'INV2', 'RET']);                             // البيع قبل مرتجعه، والأقدم أولاً
  assert.equal(timestampFromId('inv-1761100000000'), 1761100000000);
  assert.equal(timestampFromId('inv-12'), undefined);

  const split = { paymentMethod: 'مختلط (دفع مقسّم)', grandTotal: 600, payments: [{ method: 'آجل (شكك / حساب ورشة)', amount: 300 }, { method: 'كاش (نقدي)', amount: 300 }] };
  assert.deepEqual(paymentLines(split).map(p => [p.method, p.amount, p.isCredit]), [['آجل (شكك / حساب ورشة)', 300, true], ['كاش (نقدي)', 300, false]]);
  assert.equal(isSplitInvoice(split), true);
  const legacy = { paymentMethod: 'كاش (نقدي)', grandTotal: 120 };                           // فاتورة قديمة بلا payments
  assert.deepEqual(paymentLines(legacy).map(p => [p.method, p.amount]), [['كاش (نقدي)', 120]]);
  assert.equal(isSplitInvoice(legacy), false);
}

// ---------- الشيكات ----------
import { availableActions, nextStatus, registrationEffect, actionEffect, applyAction, validateCheque, dueState, summarize, pendingIncomingByCustomer, attentionCount, initialStatus } from '../src/utils/chequeLogic.ts';
{
  const mk = (over: any = {}) => ({
    id: 'ch1', number: '1001', direction: 'incoming', status: 'في الحافظة', amount: 1000, bankName: 'CIB', dueDate: '2026-11-10', receivedDate: '2026-10-24',
    partyType: 'customer', partyId: 'c1', partyName: 'ورشة', createdBy: 'u', createdAt: '2026-10-24T10:00:00.000Z', history: [], ...over,
  });
  // مسارات الحالة
  assert.deepEqual(availableActions(mk()), ['deposit', 'clear', 'bounce', 'cancel']);
  assert.deepEqual(availableActions(mk({ status: 'مودع بالبنك' })), ['clear', 'bounce']);
  assert.deepEqual(availableActions(mk({ status: 'محصّل' })), []);
  assert.deepEqual(availableActions(mk({ status: 'مرتد' })), []);
  assert.deepEqual(availableActions(mk({ direction: 'outgoing', status: 'صادر' })), ['clear', 'bounce', 'cancel']);
  assert.equal(nextStatus(mk({ status: 'مودع بالبنك' }), 'deposit'), null);              // لا إيداع مرتين
  assert.equal(nextStatus(mk({ status: 'مودع بالبنك' }), 'cancel'), null);               // بعد الإيداع لا إلغاء
  assert.equal(nextStatus(mk({ direction: 'outgoing', status: 'صادر' }), 'clear'), 'مصروف');
  assert.equal(applyAction(mk({ status: 'محصّل' }), 'bounce', 'u', '2026-11-11T00:00:00.000Z'), null); // المحصّل لا يرتد
  assert.equal(initialStatus('incoming'), 'في الحافظة'); assert.equal(initialStatus('outgoing'), 'صادر');
  const dep = applyAction(mk(), 'deposit', 'أحمد', '2026-11-01T09:00:00.000Z', ' إيداع صباحي ')!;
  assert.equal(dep.status, 'مودع بالبنك'); assert.equal(dep.history.length, 1); assert.equal(dep.history[0].note, 'إيداع صباحي');

  // واردة: العميل مديون 1500 والشيك 1000 => يُخصم 1000 ثم يعود عند الارتداد
  let r = registrationEffect('incoming', 1000, { balance: 1500 });
  assert.equal(r.effect.customerBalanceDelta, -1000); assert.equal(r.applied.appliedAmount, 1000);
  const incoming = mk({ appliedAmount: 1000 });
  assert.equal(actionEffect(incoming, 'bounce').customerBalanceDelta, 1000);
  assert.equal(actionEffect(incoming, 'cancel').customerBalanceDelta, 1000);
  assert.deepEqual(actionEffect(incoming, 'clear').treasury, { type: 'قبض', amount: 1000, category: 'تحصيل من عميل / ورشة' });
  assert.equal(actionEffect(incoming, 'clear').customerBalanceDelta, 0);                  // التحصيل لا يمس الحساب ثانية
  assert.equal(actionEffect(incoming, 'deposit').treasury, undefined);
  // شيك أكبر من المديونية: يُخصم المتاح فقط ويعود نفس المخصوم (لا تضخيم عند الارتداد)
  r = registrationEffect('incoming', 1000, { balance: 300 });
  assert.equal(r.applied.appliedAmount, 300);
  assert.equal(actionEffect(mk({ appliedAmount: 300 }), 'bounce').customerBalanceDelta, 300);
  r = registrationEffect('incoming', 1000, { balance: 0 });
  assert.equal(r.applied.appliedAmount, 0);

  // صادرة: مستحقات المورد 700 والشيك 1000 => خصم 700 + رصيد دائن 300، والعكس عند الارتداد
  const o = registrationEffect('outgoing', 1000, { balance: 700, deferredDebt: 700 });
  assert.deepEqual(o.effect.supplier, { debtDelta: -700, creditDelta: 300, paidDelta: 1000 });
  const outgoing = mk({ direction: 'outgoing', status: 'صادر', partyType: 'supplier', appliedDebt: 700, appliedCredit: 300 });
  assert.deepEqual(actionEffect(outgoing, 'bounce').supplier, { debtDelta: 700, creditDelta: -300, paidDelta: -1000 });
  assert.deepEqual(actionEffect(outgoing, 'clear').treasury, { type: 'صرف', amount: 1000, category: 'سداد دفعة لمورد' });
  assert.equal(actionEffect(outgoing, 'clear').supplier, undefined);

  // التحقق من الإدخال
  const base = { number: '1001', amount: 500, dueDate: '2026-11-10', partyId: 'c1', bankName: 'CIB', direction: 'incoming' as const };
  assert.equal(validateCheque(base, []), null);
  assert.equal(validateCheque({ ...base, number: ' ' }, []), 'NUMBER_REQUIRED');
  assert.equal(validateCheque({ ...base, amount: 0 }, []), 'AMOUNT_INVALID');
  assert.equal(validateCheque({ ...base, dueDate: '10/11/2026' }, []), 'DUE_DATE_INVALID');
  assert.equal(validateCheque({ ...base, partyId: '' }, []), 'PARTY_REQUIRED');
  assert.equal(validateCheque({ ...base, bankName: '' }, []), 'BANK_REQUIRED');
  assert.equal(validateCheque(base, [mk()]), 'DUPLICATE');
  assert.equal(validateCheque({ ...base, number: '10 01', bankName: 'cib' }, [mk()]), 'DUPLICATE');       // تجاهل المسافات والحروف
  assert.equal(validateCheque(base, [mk({ status: 'ملغي' })]), null);                                     // الملغي لا يمنع إعادة الإدخال
  assert.equal(validateCheque({ ...base, direction: 'outgoing' }, [mk()]), null);                         // اتجاه مختلف

  // الاستحقاق والملخصات (اليوم 2026-10-24)
  const today = '2026-10-24';
  assert.equal(dueState(mk({ dueDate: '2026-10-23' }), today), 'overdue');
  assert.equal(dueState(mk({ dueDate: '2026-10-24' }), today), 'due_soon');                               // يستحق اليوم ليس متأخراً
  assert.equal(dueState(mk({ dueDate: '2026-10-31' }), today), 'due_soon');
  assert.equal(dueState(mk({ dueDate: '2026-11-01' }), today), 'upcoming');
  assert.equal(dueState(mk({ dueDate: '2026-10-01', status: 'محصّل' }), today), 'closed');
  const all = [
    mk({ id: 'a', amount: 100, dueDate: '2026-10-20' }),                                                   // متأخر
    mk({ id: 'b', amount: 200, dueDate: '2026-10-26', status: 'مودع بالبنك' }),                            // قريب
    mk({ id: 'c', amount: 400, dueDate: '2026-12-01' }),                                                   // لاحق
    mk({ id: 'd', amount: 50, status: 'محصّل' }),
    mk({ id: 'e', amount: 70, status: 'مرتد' }),
    mk({ id: 'f', amount: 999, direction: 'outgoing', status: 'صادر', partyType: 'supplier', dueDate: '2026-10-25' }),
  ];
  const s = summarize(all as any, 'incoming', today);
  assert.deepEqual([s.pending.count, s.pending.amount, s.overdue.amount, s.dueSoon.amount, s.bounced.amount], [3, 700, 100, 200, 70]);
  assert.equal(summarize(all as any, 'outgoing', today).dueSoon.amount, 999);
  assert.equal(attentionCount(all as any, today, 3), 3);                                                   // a متأخر + b + f خلال 3 أيام
  const exposure = pendingIncomingByCustomer([mk({ appliedAmount: 300 }), mk({ id: 'z', appliedAmount: 200 }), mk({ id: 'y', status: 'محصّل', appliedAmount: 900 })] as any);
  assert.equal(exposure.get('c1'), 500);                                                                   // المفتوحة فقط
}

// ---------- الدفعات والصلاحية والسيريال ----------
import { expiryState, daysToExpiry, allocateFefo, applyBatchOps, distributeRestored, shiftRestored, restoredTotal, unassignedStock, expiryBuckets, parseSerialList, validateSerialIntake, validateSerialSale, autoBatchNo, inStockUnits } from '../src/utils/trackingLogic.ts';
{
  const today = '2026-10-24';
  const B = (id: string, qty: number, expiryDate?: string, receivedDate = '2026-01-01') => ({ id, partId: 'p1', batchNo: id.toUpperCase(), expiryDate, receivedDate, quantity: qty, initialQuantity: qty });
  // حالات الصلاحية: آخر يوم صالح، منتهي، قريب، فارغ، بلا تاريخ
  assert.equal(expiryState(B('a', 5, '2026-10-24'), today), 'soon');                       // ينتهي اليوم = ما زال صالحاً
  assert.equal(expiryState(B('a', 5, '2026-10-23'), today), 'expired');
  assert.equal(expiryState(B('a', 5, '2026-11-23'), today), 'soon');                       // 30 يوماً
  assert.equal(expiryState(B('a', 5, '2026-11-24'), today), 'ok');
  assert.equal(expiryState(B('a', 0, '2026-12-01'), today), 'empty');
  assert.equal(expiryState(B('a', 5), today), 'none');
  assert.equal(daysToExpiry(B('a', 1, '2026-10-27'), today), 3);

  // FEFO: الأقرب انتهاءً أولاً، وبلا تاريخ آخراً، والمنتهي لا يُسحب
  const batches = [B('late', 10, '2027-06-01'), B('soon', 4, '2026-11-01'), B('none', 6), B('dead', 9, '2026-10-01')];
  let r = allocateFefo(batches, 6, 29, today);                      // مجموع الدفعات 29 = إجمالي الرصيد
  assert.equal(r.ok, true);
  assert.deepEqual(r.allocations.map(a => [a.batchId, a.qty]), [['soon', 4], ['late', 2]]);
  assert.equal(r.expiredQty, 9);
  r = allocateFefo(batches, 20, 29, today);                         // 4+10+6 = 20 صالح بالضبط
  assert.deepEqual(r.allocations.map(a => [a.batchId, a.qty]), [['soon', 4], ['late', 10], ['none', 6]]);
  r = allocateFefo(batches, 21, 29, today);                         // لا يكفي إلا بالمنتهي => رفض
  assert.equal(r.ok, false); assert.equal(r.shortBy, 1); assert.equal(r.expiredQty, 9); assert.deepEqual(r.allocations, []);
  // رصيد بلا دفعة (قديم) يُباع بعد الدفعات الصالحة
  assert.equal(unassignedStock(35, batches), 6);
  r = allocateFefo(batches, 24, 35, today);
  assert.equal(r.ok, true); assert.equal(r.unassigned, 4); assert.deepEqual(r.allocations.map(a => a.qty), [4, 10, 6]);
  assert.equal(allocateFefo([], 3, 5, today).unassigned, 3);        // صنف بلا دفعات يعمل كالمعتاد
  assert.equal(allocateFefo([], 6, 5, today).ok, false);

  // تطبيق السحب ثم الاسترجاع
  const after = applyBatchOps(batches, [{ batchId: 'soon', qty: 4 }, { batchId: 'late', qty: 2 }], -1);
  assert.deepEqual(after.map(b => b.quantity), [8, 0, 6, 9]);
  assert.deepEqual(applyBatchOps(after, [{ batchId: 'soon', qty: 4 }, { batchId: 'late', qty: 2 }], 1).map(b => b.quantity), [10, 4, 6, 9]);

  // مرتجعات جزئية متتالية ثم حذف مرتجع: التوزيع دقيق وقابل للعكس
  const alloc = [{ batchId: 'soon', batchNo: 'SOON', qty: 4 }, { batchId: 'late', batchNo: 'LATE', qty: 2 }];
  let s1 = shiftRestored(alloc, 1);
  assert.deepEqual(s1.ops, [{ batchId: 'late', qty: 1 }]);                                   // يملأ من الأخيرة
  let s2 = shiftRestored(s1.allocations, 2);                                                 // إجمالي 3 => late 2 + soon 1
  assert.deepEqual(s2.ops.sort((a, b) => a.batchId.localeCompare(b.batchId)), [{ batchId: 'late', qty: 1 }, { batchId: 'soon', qty: 1 }]);
  assert.equal(restoredTotal(s2.allocations), 3);
  let s3 = shiftRestored(s2.allocations, -2);                                                // حذف مرتجع بكمية 2 => يبقى 1
  assert.equal(restoredTotal(s3.allocations), 1);
  assert.deepEqual(s3.allocations.map(a => a.restored), [0, 1]);
  assert.equal(restoredTotal(shiftRestored(alloc, 99).allocations), 6);                      // لا يتجاوز المسحوب
  assert.equal(restoredTotal(shiftRestored(alloc, -5).allocations), 0);                      // ولا ينزل تحت الصفر
  assert.deepEqual(distributeRestored(alloc, 6).map(a => a.restored), [4, 2]);

  // سلال الصلاحية
  const bk = expiryBuckets([...batches, B('z', 0, '2026-10-30')], today);
  assert.deepEqual([bk.expired.length, bk.within30.length, bk.later.length, bk.noExpiry.length], [1, 1, 1, 1]);
  assert.equal(autoBatchNo('2026-10-24', 3), 'B-20261024-03');

  // السيريال
  assert.deepEqual(parseSerialList('SN1, SN2\nSN3،SN4  SN5;SN6\n\n'), ['SN1', 'SN2', 'SN3', 'SN4', 'SN5', 'SN6']);
  const U = (serial: string, status: any = 'in_stock', partId = 'p1', receivedDate = '2026-01-01') => ({ id: serial, partId, serial, status, receivedDate });
  assert.equal(validateSerialIntake(['A', 'B'], 2, 'p1', []).error, null);
  assert.equal(validateSerialIntake(['A'], 2, 'p1', []).error, 'COUNT_MISMATCH');
  assert.equal(validateSerialIntake(['A', 'a'], 2, 'p1', []).error, 'DUPLICATE_IN_LIST');           // تجاهل حالة الأحرف
  assert.equal(validateSerialIntake(['A', 'B'], 2, 'p1', [U('b')]).error, 'ALREADY_EXISTS');
  assert.equal(validateSerialIntake(['A', 'B'], 2, 'p2', [U('b')]).error, null);                    // نفس السيريال لصنف آخر مسموح
  assert.equal(validateSerialIntake(['A', 'B'], 2, undefined, [U('b')]).error, null);               // صنف جديد
  const units = [U('S1'), U('S2', 'sold'), U('S3'), U('S4', 'in_stock', 'p2')];
  assert.equal(validateSerialSale(['S1', 'S3'], 2, 'p1', units).error, null);
  assert.equal(validateSerialSale(['S1'], 2, 'p1', units).error, 'COUNT_MISMATCH');
  assert.equal(validateSerialSale(['S1', 'S2'], 2, 'p1', units).error, 'NOT_IN_STOCK');             // مباع
  assert.equal(validateSerialSale(['S1', 's1'], 2, 'p1', units).error, 'DUPLICATE_IN_LIST');
  assert.equal(validateSerialSale(['S4'], 1, 'p1', units).error, 'NOT_IN_STOCK');                   // وحدة صنف آخر
  assert.equal(validateSerialSale(['ZZ'], 1, 'p1', units).error, 'NOT_IN_STOCK');
  assert.deepEqual(inStockUnits(units, 'p1').map(u => u.serial), ['S1', 'S3']);
}

// ---------- أثر المرتجع على الدفعات والسيريال ----------
import { trackReturn } from '../src/utils/returnTracking.ts';
{
  const base: any = { partId: 'p1', partNumber: 'X', partName: 'زيت', quantity: 6, unitPrice: 10, total: 60 };
  const withBatches = { ...base, batchAllocations: [{ batchId: 'b1', batchNo: 'B1', qty: 4 }, { batchId: 'b2', batchNo: 'B2', qty: 2 }] };
  let r = trackReturn(withBatches, 3, undefined, 1);
  assert.deepEqual(r.batchOps.sort((a, b) => a.batchId.localeCompare(b.batchId)), [{ batchId: 'b1', qty: 1 }, { batchId: 'b2', qty: 2 }]);
  assert.equal(r.unitsToStock.length, 0);
  const r2 = trackReturn(r.item, 3, undefined, -1);                                    // حذف نفس المرتجع => يعود كل شيء كما كان
  assert.deepEqual(r2.batchOps.sort((a, b) => a.batchId.localeCompare(b.batchId)), [{ batchId: 'b1', qty: -1 }, { batchId: 'b2', qty: -2 }]);
  assert.deepEqual(r2.item.batchAllocations!.map(a => a.restored), [0, 0]);

  const withSerials = { ...base, quantity: 3, serials: ['S1', 'S2', 'S3'] };
  r = trackReturn(withSerials, 1, ['S2'], 1);                                          // المستخدم اختار S2
  assert.deepEqual(r.unitsToStock, ['S2']); assert.deepEqual(r.item.returnedSerials, ['S2']);
  r = trackReturn(r.item, 2, undefined, 1);                                            // بلا اختيار: يأخذ المتبقي تلقائياً
  assert.deepEqual(r.unitsToStock, ['S1', 'S3']); assert.deepEqual(r.item.returnedSerials, ['S2', 'S1', 'S3']);
  assert.equal(trackReturn(r.item, 1, undefined, 1).unitsToStock.length, 0);           // كله مرتجع: لا يوجد ما يُرجَع
  const del = trackReturn(r.item, 2, ['S1', 'S3'], -1);                                // حذف مرتجع S1,S3 => تعود «مباعة»
  assert.deepEqual(del.unitsToSold, ['S1', 'S3']); assert.deepEqual(del.item.returnedSerials, ['S2']);
  assert.deepEqual(trackReturn({ ...withSerials, returnedSerials: ['S1', 'S2'] }, 1, undefined, -1).unitsToSold, ['S2']); // بلا تحديد: آخر مرتجع
  const plain = trackReturn(base, 2, undefined, 1);                                    // صنف بلا تتبع لا يتأثر
  assert.deepEqual([plain.batchOps, plain.unitsToStock, plain.item], [[], [], base]);
}

// ---------- التقارير التحليلية ----------
import * as RP from '../src/utils/reportsLogic.ts';
{
  const today = '2026-10-24';
  const R = { from: '', to: '' };
  const it = (partId: string, qty: number, price: number, cost: number, returned = 0) => ({ partId, partNumber: partId.toUpperCase(), partName: 'صنف ' + partId, quantity: qty, unitPrice: price, costPrice: cost, total: qty * price, returnedQuantity: returned });
  const inv = (id: string, date: string, items: any[], extra: any = {}) => {
    const subtotal = items.reduce((s, x) => s + x.total, 0);
    return { id, invoiceNumber: id, date, time: '', customerName: 'ز', customerPhone: '', items, subtotal, discount: 0, tax: 0, grandTotal: subtotal, paymentMethod: 'كاش (نقدي)', cashierName: 'أحمد', status: 'مسددة', ...extra };
  };
  const data: any = {
    invoices: [
      inv('i1', '2026-10-20', [it('a', 4, 100, 60, 1), it('b', 2, 50, 30)], { discount: 20, grandTotal: 480 }),            // مرتجع وحدة من a
      inv('i2', '2026-10-21', [it('a', 1, 100, 60)], { cashierName: 'منى' }),
      inv('i3', '2026-10-21', [it('a', 9, 100, 60)], { status: 'ملغاة', cashierName: 'منى' }),                              // ملغاة: تُستبعد
      inv('i4', '2026-07-01', [it('c', 1, 200, 150)], { customerId: 'c1', customerName: 'ورشة', paymentMethod: 'مختلط (دفع مقسّم)', payments: [{ method: 'آجل (شكك / حساب ورشة)', amount: 120 }, { method: 'كاش (نقدي)', amount: 80 }] }),
      inv('i5', '2026-10-10', [it('c', 1, 500, 300)], { customerId: 'c1', customerName: 'ورشة', paymentMethod: 'آجل (شكك / حساب ورشة)' }),
    ],
    salesReturns: [{ id: 'r1', date: '2026-10-20', totalRefundAmount: 100, items: [{ partNumber: 'A', partName: 'صنف a', quantity: 1, unitPrice: 100, total: 100 }] }],
    purchaseInvoices: [{ id: 'p1', date: '2026-10-05', supplierName: 'مورد', grandTotal: 1000, amountPaid: 400 }, { id: 'p2', date: '2026-10-06', supplierName: 'مورد', grandTotal: 500, amountPaid: 500 }],
    parts: [
      { id: 'a', partNumber: 'A', name: 'صنف a', category: 'فلاتر وزيوت', stockQuantity: 10, minAlertStock: 3, costPrice: 60, salePrice: 100 },
      { id: 'b', partNumber: 'B', name: 'صنف b', category: 'فلاتر وزيوت', stockQuantity: 2, minAlertStock: 5, costPrice: 30, salePrice: 50 },
      { id: 'c', partNumber: 'C', name: 'صنف c', category: 'فرامل ومكابح', stockQuantity: 4, minAlertStock: 1, costPrice: 150, salePrice: 200 },
      { id: 'd', partNumber: 'D', name: 'صنف d', category: 'فرامل ومكابح', stockQuantity: 5, minAlertStock: 1, costPrice: 10, salePrice: 20 },
    ],
    customers: [{ id: 'c1', name: 'ورشة', balance: 1000 }, { id: 'c2', name: 'عميل بدون فواتير', balance: 300 }],
    suppliers: [{ id: 's1', name: 'مورد', balance: 700, storeCredit: 0, totalPaid: 900, lastPaymentDate: '2026-10-01' }, { id: 's2', name: 'مسدد', balance: 0, storeCredit: 0, totalPaid: 5 }],
    expenses: [{ id: 'e1', title: 'إيجار', category: 'إيجار', amount: 300, date: '2026-10-15' }, { id: 'e2', title: 'كهرباء', category: 'كهرباء ومياه', amount: 100, date: '2026-10-16' }, { id: 'e3', title: 'قديم', category: 'إيجار', amount: 999, date: '2026-01-01' }],
    treasury: [{ id: 't1', date: '2026-10-20', type: 'قبض', category: 'مبيعات كاشير (فواتير بيع)', amount: 500 }, { id: 't2', date: '2026-10-21', type: 'صرف', category: 'سداد دفعة لمورد', amount: 200 }],
    cheques: [
      { id: 'q1', direction: 'incoming', status: 'في الحافظة', partyName: 'ورشة', number: '1', bankName: 'CIB', dueDate: '2026-10-22', amount: 700 },
      { id: 'q2', direction: 'outgoing', status: 'صادر', partyName: 'مورد', number: '2', bankName: 'NBE', dueDate: '2026-10-27', amount: 300 },
      { id: 'q3', direction: 'incoming', status: 'محصّل', partyName: 'ورشة', number: '3', bankName: 'CIB', dueDate: '2026-10-01', amount: 50 },
    ],
    batches: [
      { id: 'b2', partId: 'a', batchNo: 'LATE', expiryDate: '2027-01-01', receivedDate: '2026-01-01', quantity: 3, initialQuantity: 3 },
      { id: 'b1', partId: 'a', batchNo: 'OLD', expiryDate: '2026-10-01', receivedDate: '2026-01-01', quantity: 2, initialQuantity: 2 },
      { id: 'b0', partId: 'a', batchNo: 'EMPTY', expiryDate: '2026-12-01', receivedDate: '2026-01-01', quantity: 0, initialQuantity: 2 },
    ],
    loyaltyLedger: [{ id: 'l1', at: '2026-10-01T00:00:00.000Z', customerId: 'c1', customerName: 'ورشة', type: 'earn', points: 200, userName: 'u' }],
    loyaltyPointValue: 0.5,
  };

  // المبيعات اليومية: الملغاة مستبعدة، والمرتجع يخصم من يومه
  let tb = RP.reportDailySales(data, R);
  assert.deepEqual(tb.rows.map(x => [x.date, x.count, x.total, x.returns, x.net]), [['2026-07-01', 1, 200, 0, 200], ['2026-10-10', 1, 500, 0, 500], ['2026-10-20', 1, 480, 100, 380], ['2026-10-21', 1, 100, 0, 100]]);
  assert.equal(tb.totals!.net, 1180);
  tb = RP.reportDailySales(data, { from: '2026-10-20', to: '2026-10-21' });                  // نطاق التاريخ
  assert.deepEqual([tb.rows.length, tb.totals!.total], [2, 580]);

  // أرباح الأصناف: الكمية الصافية بعد المرتجع، والملغاة خارج الحساب
  tb = RP.reportSalesByItem(data, R);
  const a = tb.rows.find(x => x.number === 'A')!;
  assert.deepEqual([a.qty, a.revenue, a.cost, a.profit, a.margin], [4, 400, 240, 160, 40]);       // (3 من i1 + 1 من i2) لا 9 الملغاة
  assert.deepEqual(tb.rows.map(x => [x.number, x.profit]), [['C', 250], ['A', 160], ['B', 40]]);   // الأعلى ربحاً أولاً
  assert.equal(tb.totals!.profit, 450);

  // الدفع المقسّم يُحسب بكل طريقة
  tb = RP.reportSalesByPayment(data, R);
  const pay = Object.fromEntries(tb.rows.map(x => [x.method, x.amount]));
  assert.equal(pay['آجل (شكك / حساب ورشة)'], 120 + 500); assert.equal(pay['كاش (نقدي)'], 480 + 100 + 80);

  // حسب الموظف: الملغاة تظهر في عمود الملغاة فقط
  tb = RP.reportSalesByCashier(data, R);
  const mona = tb.rows.find(x => x.name === 'منى')!;
  assert.deepEqual([mona.count, mona.total, mona.voided], [1, 100, 1]);

  // الأرباح والخسائر لشهر أكتوبر (المحسوبة يدوياً): مبيعات 480+100+500 = 1080
  tb = RP.reportProfitLoss(data, { from: '2026-10-01', to: '2026-10-31' });
  const pl = Object.fromEntries(tb.rows.map(x => [x.item, x.amount]));
  assert.deepEqual(
    [pl['المبيعات (قبل الضريبة وبعد الخصم)'], pl['يخصم: المرتجعات'], pl['صافي المبيعات'], pl['يخصم: تكلفة البضاعة المباعة'], pl['مجمل الربح'], pl['يخصم: المصروفات'], pl['صافي الربح']],
    [1080, -100, 980, -600, 380, -400, -20]
  );
  assert.equal(RP.reportExpensesByCategory(data, { from: '2026-10-01', to: '2026-10-31' }).totals!.amount, 400);   // القديم خارج الفترة
  tb = RP.reportTreasury(data, R);
  assert.deepEqual([tb.totals!.inn, tb.totals!.out, tb.totals!.net], [500, 200, 300]);
  tb = RP.reportPurchasesBySupplier(data, R);
  assert.deepEqual([tb.totals!.total, tb.totals!.paid, tb.totals!.remaining], [1500, 900, 600]);

  // المخزون
  tb = RP.reportInventoryValuation(data);
  assert.deepEqual([tb.totals!.cost, tb.totals!.units], [1310, 21]);
  tb = RP.reportLowStock(data);
  assert.deepEqual(tb.rows.map(x => [x.number, x.suggest]), [['B', 8]]);
  assert.deepEqual(RP.reportSlowMoving(data, today, 90).rows.map(x => x.number), ['D']);           // لم يُبع قط
  assert.equal(RP.reportSlowMoving(data, today, 90).rows[0].idle, 'بدون مبيعات');
  assert.deepEqual(RP.reportSlowMoving(data, today, 10).rows.map(x => x.number), ['C', 'D']);      // c آخر بيع قبل 14 يوماً، مرتبة بالتكلفة المجمّدة
  tb = RP.reportExpiry(data, today);
  assert.deepEqual(tb.rows.map(x => [x.batch, x.state, x.qty, x.value]), [['OLD', 'منتهية', 2, 120], ['LATE', 'سليمة', 3, 180]]);   // الفارغة مستبعدة والأقدم أولاً
  assert.deepEqual([tb.totals!.qty, tb.totals!.value], [5, 300]);

  // الذمم
  tb = RP.reportCustomerAging(data, today);
  assert.deepEqual(tb.rows.map(x => [x.name, x.b0, x.b30, x.b60, x.b90, x.total]), [['ورشة', 500, 0, 0, 500, 1000], ['عميل بدون فواتير', 0, 0, 0, 300, 300]]);
  assert.deepEqual([tb.totals!.b0, tb.totals!.b90, tb.totals!.total], [500, 800, 1300]);
  tb = RP.reportSupplierPayables(data);
  assert.deepEqual(tb.rows.map(x => [x.name, x.dues, x.paid]), [['مورد', 700, 900]]);
  tb = RP.reportCheques(data, today);
  assert.deepEqual(tb.rows.map(x => [x.dir, x.number, x.days, x.state, x.amount]), [['وارد', '1', -2, 'متأخر', 700], ['صادر', '2', 3, 'يستحق قريباً', 300]]);
  assert.deepEqual([tb.totals!.amount, tb.totals!.party], [1000, 'واردة 700 · صادرة 300']);
  tb = RP.reportLoyalty(data, '2026-10-24T23:59:59.000Z');
  assert.deepEqual(tb.rows.map(x => [x.name, x.points, x.value]), [['ورشة', 200, 100]]);
  tb = RP.reportSalesByCustomer(data, R);
  assert.deepEqual(tb.rows.map(x => [x.name, x.count, x.total, x.balance]), [['ورشة', 2, 700, 1000], ['ز', 2, 580, 0]]);
  tb = RP.reportReturns(data, R);
  assert.deepEqual(tb.rows.map(x => [x.number, x.count, x.qty, x.value]), [['A', 1, 1, 100]]);

  // السجل: كل تقرير يُبنى بلا أخطاء وأعمدته مطابقة لمفاتيح صفوفه وإجمالياته، ومجموعاته معروفة
  assert.equal(RP.REPORT_DEFS.length, 18);
  for (const def of RP.REPORT_DEFS) {
    const t = def.build(data, R, today);
    assert.ok(t.title && t.columns.length > 0, def.id);
    for (const row of t.rows) for (const c of t.columns) assert.ok(c.key in row, `${def.id}.${c.key}`);
    if (t.totals) for (const c of t.columns) assert.ok(c.key in t.totals, `${def.id} totals.${c.key}`);
  }
  assert.deepEqual([...new Set(RP.REPORT_DEFS.map(x => x.group))], ['المبيعات', 'المالية', 'المخزون', 'الذمم والالتزامات']);

  // CSV: BOM، حماية الفواصل وعلامات الاقتباس، وسطر الإجماليات
  const csv = RP.reportToCsv({ id: 'x', title: 't', columns: [{ key: 'a', label: 'اسم' }, { key: 'b', label: 'مبلغ' }], rows: [{ a: 'زيت, "ممتاز"', b: 5 }, { a: 'عادي', b: 2.5 }], totals: { a: 'الإجمالي', b: 7.5 } });
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.deepEqual(csv.slice(1).split('\r\n'), ['اسم,مبلغ', '"زيت, ""ممتاز""",5', 'عادي,2.5', 'الإجمالي,7.5']);
}
console.log('كل الاختبارات نجحت');

// ---------- إلغاء فاتورة ----------
import { computeVoidPlan } from '../src/utils/saleLogic.ts';
{
  // فاتورة 300: كاش 100 + فيزا 100 + آجل 100 — لم يُرتجع شيء
  const plan = computeVoidPlan({
    grandTotal: 300, returnedAmount: 0,
    items: [{ partId: 'p1', partNumber: 'A', quantity: 3 }],
    payments: [{ method: 'كاش', amount: 100 }, { method: 'فيزا', amount: 100 }, { method: 'آجل', amount: 100 }],
  });
  assert.equal(plan.fraction, 1);
  assert.deepEqual(plan.restock, [{ partId: 'p1', partNumber: 'A', qty: 3 }]);
  assert.equal(plan.creditAmount, 100);
  assert.deepEqual(plan.refunds, [{ method: 'كاش', amount: 100 }, { method: 'فيزا', amount: 100 }]);

  // بعد مرتجع جزئي 100 من 300: المتبقي ثلثا الفاتورة، وقطعة واحدة رجعت سابقاً
  const partial = computeVoidPlan({
    grandTotal: 300, returnedAmount: 100,
    items: [{ partId: 'p1', partNumber: 'A', quantity: 3, returnedQuantity: 1 }],
    payments: [{ method: 'كاش', amount: 300 }],
  });
  assert.equal(Math.round(partial.fraction * 1000), 667);
  assert.deepEqual(partial.restock, [{ partId: 'p1', partNumber: 'A', qty: 2 }]);
  assert.deepEqual(partial.refunds, [{ method: 'كاش', amount: 200 }]);   // 300 - 100 رُدّت وقت المرتجع

  // مرتجع كلي سابق ثم إلغاء: لا شيء يُعكس مرة ثانية
  const full = computeVoidPlan({ grandTotal: 300, returnedAmount: 300, items: [{ partNumber: 'A', quantity: 3, returnedQuantity: 3 }], payments: [{ method: 'كاش', amount: 300 }] });
  assert.equal(full.restock.length, 0); assert.equal(full.refunds.length, 0); assert.equal(full.creditAmount, 0);
  console.log('void: كل الاختبارات نجحت');
}
