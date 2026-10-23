import assert from 'node:assert/strict';
import {
  countTotal, summarizeShift, varianceOf, varianceKind, nextShiftNumber, stampNewTreasury, round2, findOpenShift, findOpenShifts,
} from '../src/utils/shiftLogic.ts';

const tx = (o: any) => ({ id: o.id, txNumber: o.id, date: '2026-10-23', time: '10:00', type: 'قبض', category: 'مبيعات كاشير (فواتير بيع)',
  amount: 0, paymentMethod: 'نقدي', balanceAfter: 0, description: '', recordedBy: 'x', ...o });

// عدّ الفئات
assert.equal(countTotal({ '200': 3, '50': 2, '0.5': 3 }), 701.5);
assert.equal(countTotal({ '100': -5, '10': 1.9 }), 10);   // سالب يُهمل، والكسر يُقطع
assert.equal(countTotal(undefined), 0);

// ملخص الوردية: افتتاح 500
const shift = { id: 'S1', openingCash: 500 };
const txs = [
  tx({ id: 'a', amount: 300, shiftId: 'S1', referenceId: 'INV1' }),                       // كاش مبيعات
  tx({ id: 'b', amount: 200, shiftId: 'S1', paymentMethod: 'فيزا', referenceId: 'INV1' }), // فيزا (ليس من الدرج)
  tx({ id: 'c', amount: 50, shiftId: 'S1', type: 'صرف', category: 'مصروفات تشغيلية' }),     // مصروف كاش
  tx({ id: 'd', amount: 999, shiftId: 'S0' }),                                              // وردية أخرى
  tx({ id: 'e', amount: 70, shiftId: 'S1', category: 'تحصيل من عميل / ورشة', paymentMethod: 'إنستاباي' }),
  tx({ id: 'f', amount: 20, shiftId: 'S1', category: 'عجز درج (تسوية وردية)', type: 'صرف' }), // لا يدخل الحساب
];
const s = summarizeShift(shift, txs as any);
assert.equal(s.cashIn, 300); assert.equal(s.cashOut, 50); assert.equal(s.cashSales, 300);
assert.equal(s.expectedCash, 750);
assert.equal(s.nonCash.visa, 200); assert.equal(s.nonCash.instapay, 70);
assert.equal(s.invoiceCount, 1);

// عجز / زيادة / مطابق
assert.equal(varianceOf(740, 750), -10); assert.equal(varianceKind(-10), 'shortage');
assert.equal(varianceOf(755.5, 750), 5.5); assert.equal(varianceKind(5.5), 'surplus');
assert.equal(varianceKind(varianceOf(0.1 + 0.2, 0.3)), 'match');   // فاصلة عائمة

// ترقيم
assert.equal(nextShiftNumber([]), 'SH-0001');
assert.equal(nextShiftNumber([{ shiftNumber: 'SH-0009' }, { shiftNumber: 'SH-0003' }] as any), 'SH-0010');

// الختم: الجديد فقط، والقديم يبقى كما هو
const known = new Set(['old']);
const r = stampNewTreasury([tx({ id: 'old' }), tx({ id: 'new' })] as any, known, 'S9', '2026-10-23T10:00:00.000Z');
assert.equal(r.changed, true);
assert.equal((r.list[0] as any).shiftId, undefined);
assert.equal((r.list[1] as any).shiftId, 'S9'); assert.equal((r.list[1] as any).at, '2026-10-23T10:00:00.000Z');
const r2 = stampNewTreasury(r.list as any, known, 'S9', 'x');       // لا ختم مكرر
assert.equal(r2.changed, false);
const r3 = stampNewTreasury([tx({ id: 'n2' })] as any, known, undefined, 't'); // بلا وردية مفتوحة: وقت فقط
assert.equal((r3.list[0] as any).shiftId, undefined); assert.equal((r3.list[0] as any).at, 't');

assert.equal(findOpenShift([{ status: 'مغلقة' }, { status: 'مفتوحة', id: 'z' }] as any)?.id, 'z');
assert.equal(round2(1.005), 1.01);
console.log('اختبارات الورديات نجحت');

// وردية مفتوحة من جهازين: الأقدم هي الفعّالة
assert.equal(findOpenShift([{ status: 'مفتوحة', id: 'late', openedAt: '2026-10-23T12:00:00Z' }, { status: 'مفتوحة', id: 'early', openedAt: '2026-10-23T08:00:00Z' }] as any)?.id, 'early');
assert.equal(findOpenShifts([{ status: 'مغلقة' }] as any).length, 0);
