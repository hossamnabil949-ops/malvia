import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isHashed } from '../src/services/passwordService.ts';
const h = await hashPassword('s3cret-ك');
assert.ok(isHashed(h) && !h.includes('s3cret'));
assert.ok(await verifyPassword('s3cret-ك', h));
assert.ok(!(await verifyPassword('wrong', h)));
assert.ok(!(await verifyPassword('s3cret-ك', 'plaintext')));
assert.notEqual(await hashPassword('x'), await hashPassword('x'));   // salt مختلف
console.log('password: كل الاختبارات نجحت');
