import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { verifyOwnerCredential } from '../api/_ownerApproval';

const owner = (password: string) => {
  const salt = randomBytes(16);
  const iterations = 150_000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return { id: 'owner-1', role: 'مدير عام', status: 'نشط', passwordHash: `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}` };
};

test('owner approval accepts a valid PBKDF2 owner password', () => {
  assert.equal(verifyOwnerCredential('Owner#2026', owner('Owner#2026')), true);
});

test('owner approval rejects an incorrect password', () => {
  assert.equal(verifyOwnerCredential('wrong', owner('Owner#2026')), false);
});

test('owner approval rejects non-owner, inactive, and implicit default credentials', () => {
  assert.equal(verifyOwnerCredential('123456', { role: 'مدير عام', status: 'نشط' }), false);
  assert.equal(verifyOwnerCredential('secret', { role: 'محاسب مالي', status: 'نشط', password: 'secret' }), false);
  assert.equal(verifyOwnerCredential('secret', { role: 'مدير عام', status: 'معلق', password: 'secret' }), false);
});

test('owner approval permits only explicitly stored legacy owner password', () => {
  assert.equal(verifyOwnerCredential('legacy-pass', { role: 'مدير عام', status: 'نشط', password: 'legacy-pass' }), true);
});
