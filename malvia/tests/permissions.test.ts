import assert from 'node:assert/strict';
import { hasTabAccess, firstAllowedTab, ROLE_PRESETS, TAB_ACCESS } from '../src/utils/permissions.ts';

const cashier = ROLE_PRESETS['كاشير مبيعات'];
// الكاشير: بيع وعملاء وفواتير ووردية فقط
for (const t of ['dashboard', 'pos', 'shifts', 'invoices', 'customers']) assert.equal(hasTabAccess('كاشير مبيعات', cashier, t), true, t);
for (const t of ['inventory', 'warehouses', 'purchases', 'suppliers', 'finance', 'cheques', 'reports', 'settings']) assert.equal(hasTabAccess('كاشير مبيعات', cashier, t), false, t);
// المدير العام يفتح كل شيء حتى شاشة غير معرّفة، وحتى لو صلاحياته فارغة
assert.equal(hasTabAccess('مدير عام', undefined, 'settings'), true);
assert.equal(hasTabAccess('مدير عام', {}, 'شاشة-مستقبلية'), true);
// غير المدير: شاشة غير معرّفة مغلقة
assert.equal(hasTabAccess('أمين مستودع', ROLE_PRESETS['أمين مستودع'], 'شاشة-مستقبلية'), false);
// أمين المستودع: مخزون ومخازن فقط (بخلاف الرئيسية)
assert.equal(hasTabAccess('أمين مستودع', ROLE_PRESETS['أمين مستودع'], 'warehouses'), true);
assert.equal(hasTabAccess('أمين مستودع', ROLE_PRESETS['أمين مستودع'], 'pos'), false);
// المحاسب: خزنة وتقارير وموردين وعملاء، بدون بيع ولا إعدادات
const acc = ROLE_PRESETS['محاسب مالي'];
assert.deepEqual(['finance', 'cheques', 'reports', 'suppliers', 'customers', 'shifts'].map(t => hasTabAccess('محاسب مالي', acc, t)), [true, true, true, true, true, true]);
assert.deepEqual(['pos', 'settings', 'inventory', 'purchases'].map(t => hasTabAccess('محاسب مالي', acc, t)), [false, false, false, false]);
// مفتاح واحد يكفي (أي-واحد)
assert.equal(hasTabAccess('x' as any, { canManageTreasury: true }, 'suppliers'), true);
// أول شاشة مسموحة: موظف بلا أي صلاحية يبقى على الرئيسية
assert.equal(firstAllowedTab('كاشير مبيعات', {}), 'dashboard');
assert.equal(firstAllowedTab('مدير عام', {}), 'dashboard');
// كل شاشات التنقل معرّفة في الخريطة (لا شاشة تُنسى فتبقى للمدير فقط بدون قصد)
for (const t of ['dashboard','pos','shifts','inventory','warehouses','invoices','purchases','suppliers','customers','finance','cheques','reports','settings']) assert.ok(t in TAB_ACCESS, t);
console.log('permissions: كل الاختبارات نجحت');
