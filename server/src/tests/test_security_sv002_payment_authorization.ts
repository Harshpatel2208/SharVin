import assert from 'node:assert/strict';
import { assertCanFinalizeLedgerPayment } from '../modules/ledger/ledger-policy';

assert.doesNotThrow(() => assertCanFinalizeLedgerPayment('wholesaler'));
assert.throws(() => assertCanFinalizeLedgerPayment('retailer'), /receiving wholesaler/);
assert.throws(() => assertCanFinalizeLedgerPayment('driver'), /receiving wholesaler/);
assert.throws(() => assertCanFinalizeLedgerPayment(''), /receiving wholesaler/);

console.log('SV-002 regression tests passed');
