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
