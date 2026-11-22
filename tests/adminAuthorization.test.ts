import assert from 'node:assert/strict';
import { assertSuperAdmin } from '../api/_admin.js';
import { ApiError } from '../api/_security.js';

const owner = { username: 'owner', role: 'SUPER_ADMIN' as const };
const support = { username: 'support', role: 'SUPPORT' as const };

assert.equal(assertSuperAdmin(owner), owner);
assert.throws(
  () => assertSuperAdmin(support),
  (error: unknown) => error instanceof ApiError && error.code === 'ADMIN_UNAUTHORIZED',
);
assert.throws(
  () => assertSuperAdmin({ username: 'unknown', role: 'EMPLOYEE' as any }),
  (error: unknown) => error instanceof ApiError && error.code === 'ADMIN_UNAUTHORIZED',
);

console.log('Admin authorization tests passed.');
