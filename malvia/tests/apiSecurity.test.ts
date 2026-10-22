// ملاحظة: هذا الاختبار يعمل على نسخة من api/_security.ts بدون سطر import { getOne } (لأن _db.js يحتاج Neon). انسخ الملف وشِل السطر وعدّل المسار قبل التشغيل.
import assert from 'node:assert/strict';
import { validateSyncBody, rateLimit, safeEqual, ApiError, sendError } from './sec.ts';
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ApiError).code; } return 'OK'; };
assert.equal(code(() => validateSyncBody({ resource: 'parts', data: [{ id: 'a' }], baseVersion: 0 })), 'OK');
assert.equal(code(() => validateSyncBody({ resource: 'auditLog', data: [{ id: 'a' }], baseVersion: 0 })), 'OK');
assert.equal(code(() => validateSyncBody({ resource: 'parts', data: [{ name: 'بدون id' }], baseVersion: 0 })), 'OK');
assert.equal(code(() => validateSyncBody({ resource: '_registry', data: [], baseVersion: 0 })), 'RESOURCE_NOT_ALLOWED');
assert.equal(code(() => validateSyncBody({ resource: 'parts', data: 'x', baseVersion: 0 })), 'INVALID_BODY');
assert.equal(code(() => validateSyncBody({ resource: 'parts', data: [{ id: 'a' }, { id: 'a' }], baseVersion: 0 })), 'INVALID_BODY');
assert.equal(code(() => validateSyncBody({ resource: 'parts', data: [1], baseVersion: 0 })), 'INVALID_BODY');
assert.equal(code(() => validateSyncBody({ resource: 'settings', data: [], baseVersion: 1 })), 'INVALID_BODY');
assert.equal(code(() => validateSyncBody({ resource: 'invoices', data: [{ id: 1, blob: 'x'.repeat(3_100_000) }], baseVersion: 1 })), 'PAYLOAD_TOO_LARGE');
for (let i = 0; i < 3; i++) rateLimit('k', 3, 1000, 0);
assert.equal(code(() => rateLimit('k', 3, 1000, 10)), 'RATE_LIMITED');
assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd'));
// الاستجابة: نص عربي + كود، وبدون تسريب رسالة الخطأ الداخلية
let out: any; const res: any = { status: (c: number) => ({ json: (b: any) => { out = { c, b }; } }) };
sendError(res, new Error('secret db password leaked'));
assert.equal(out.c, 500); assert.equal(out.b.code, 'INTERNAL'); assert.ok(!JSON.stringify(out.b).includes('secret'));
sendError(res, new ApiError('RATE_LIMITED')); assert.equal(out.c, 429);
console.log('api: كل الاختبارات نجحت');
