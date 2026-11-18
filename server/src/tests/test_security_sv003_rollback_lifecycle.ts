import assert from 'node:assert/strict';
import { assertOrderEligibleForLedgerRollback } from '../modules/ledger/ledger-policy';

assert.doesNotThrow(() => assertOrderEligibleForLedgerRollback('cancelled'));
assert.doesNotThrow(() => assertOrderEligibleForLedgerRollback('rejected'));
for (const state of [undefined, 'draft', 'submitted', 'accepted', 'picking', 'dispatched', 'delivered', 'partially_fulfilled']) {
  assert.throws(() => assertOrderEligibleForLedgerRollback(state), /only after the order is cancelled or rejected/);
}

console.log('SV-003 regression tests passed');
