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
