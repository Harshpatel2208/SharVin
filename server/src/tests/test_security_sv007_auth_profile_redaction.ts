import assert from 'node:assert/strict';
import { toSafeTenantProfile } from '../modules/auth/auth-response';

const source = {
  gstNumber: '07AAAAA0000A1Z5',
  businessCategory: 'FMCG',
  defaultDeliveryRangeKm: 50,
  ownerPinHash: '$2b$12$secret',
  bankAccountNumber: '1234567890',
  bankIfscCode: 'BANK0000001',
  bankAccountHolderName: 'Private Owner',
  bankName: 'Private Bank',
  panNumber: 'AAAAA0000A',
  userId: 'tenant-secret-id',
};

const safe = toSafeTenantProfile('wholesaler', source)!;
assert.equal(safe.gstNumber, source.gstNumber);
assert.equal(safe.defaultDeliveryRangeKm, 50);
for (const forbidden of ['ownerPinHash', 'bankAccountNumber', 'bankIfscCode', 'bankAccountHolderName', 'bankName', 'panNumber', 'userId']) {
  assert.equal(forbidden in safe, false, `${forbidden} must never be serialized by auth endpoints`);
}
assert.equal(JSON.stringify(safe).includes('$2b$12$secret'), false);

console.log('SV-007 regression tests passed');
