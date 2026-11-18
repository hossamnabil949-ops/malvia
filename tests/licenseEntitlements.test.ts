import assert from 'node:assert/strict';
import {
  isLicenseFeatureEnabled,
  isLicenseResourceEnabled,
  assertLicenseResourceEnabled,
  ApiError,
} from '../api/_security.js';

// Existing licenses without an entitlement map remain fully compatible.
assert.equal(isLicenseFeatureEnabled({}, 'canUseAI'), true);
assert.equal(isLicenseResourceEnabled({ licenseKey: 'LEGACY' }, 'inventoryErrors'), true);

// Explicitly excluded modules are blocked at the server resource boundary.
const noAi = { allowedFeatures: { canUseAI: false, canUseVoiceAI: false } };
assert.equal(isLicenseFeatureEnabled(noAi, 'canUseAI'), false);
assert.throws(() => assertLicenseResourceEnabled(noAi, 'inventoryErrors'), (error: unknown) => error instanceof ApiError && error.code === 'FEATURE_NOT_INCLUDED');

const noStockMonitoring = { allowedFeatures: { canUseStockMonitoring: false } };
assert.equal(isLicenseResourceEnabled(noStockMonitoring, 'inventoryErrors'), false);
assert.equal(isLicenseResourceEnabled(noStockMonitoring, 'parts'), true);

// Finance resources cannot bypass the treasury entitlement through batch sync.
const noTreasury = { allowedFeatures: { canUseTreasury: false } };
for (const resource of ['treasury','expenses','bankAccounts','cheques','partners','partnerCurrentAccountTransactions','openingBalances']) {
  assert.equal(isLicenseResourceEnabled(noTreasury, resource), false, resource);
}

// POS-related resources follow the POS entitlement.
const noPos = { allowedFeatures: { canUsePos: false } };
for (const resource of ['invoices','salesReturns','shifts','loyaltyLedger']) {
  assert.equal(isLicenseResourceEnabled(noPos, resource), false, resource);
}

console.log('License entitlement tests passed.');
