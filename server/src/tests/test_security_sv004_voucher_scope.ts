import assert from 'node:assert/strict';
import { buildVoucherTenantScope } from '../modules/ledger/ledger-policy';

const scope = buildVoucherTenantScope('RCPT-2026-1234567', 'tenant-a');
assert.deepEqual(scope.AND[0], {
  OR: [
    { id: 'RCPT-2026-1234567' },
    { voucherNumber: 'RCPT-2026-1234567' },
    { receiptNumber: 'RCPT-2026-1234567' },
    { transactionId: 'RCPT-2026-1234567' },
  ],
});
assert.deepEqual(scope.AND[1], { OR: [{ retailerId: 'tenant-a' }, { wholesalerId: 'tenant-a' }] });
assert.ok(JSON.stringify(scope).includes('tenant-a'), 'tenant predicate must be part of the database query');

console.log('SV-004 regression tests passed');
