import assert from 'node:assert/strict';
import { LedgerService } from '../modules/ledger/ledger.service';
import { prisma } from '../db';

async function runIdempotencyTests() {
  console.log('======================================================================');
  console.log('🧪 TESTING: PAYMENT IDEMPOTENCY (Double-Payment Prevention)');
  console.log('======================================================================');

  const idempotencyKey = `idem-key-${Date.now()}`;

  // Setup: Create Users, Connection and Ledger Account
  const testRetailer = await prisma.user.create({
    data: {
      phoneNumber: `test-ret-${Date.now()}`,
      fullName: 'Test Retailer',
      userType: 'retailer',
    },
  });
  const testWholesaler = await prisma.user.create({
    data: {
      phoneNumber: `test-who-${Date.now()}`,
      fullName: 'Test Wholesaler',
      userType: 'wholesaler',
    },
  });

  const connection = await prisma.retailerWholesalerConnection.create({
    data: {
      retailerId: testRetailer.id,
      wholesalerId: testWholesaler.id,
      connectionStatus: 'active',
    },
  });

  await prisma.ledgerAccount.create({
    data: {
      retailerId: testRetailer.id,
      wholesalerId: testWholesaler.id,
      connectionId: connection.id,
      currentBalance: 10000,
    },
  });

  const retailerId = testRetailer.id;
  const wholesalerId = testWholesaler.id;

  // Mock connection for the account to exist without FK error if needed
  // In a real test we'd create the connection first.

  console.log('\n👉 [1/3] Recording first payment...');
  const res1 = await LedgerService.recordPaymentSettlement({
    partnerId: retailerId,
    amount: 2000,
    paymentMethod: 'upi',
    idempotencyKey: idempotencyKey,
  }, wholesalerId, 'wholesaler');

  assert.equal(res1.success, true);
  const firstPaymentId = res1.paymentId;
  const firstTxId = res1.transactionId;
  console.log(`   ✅ First payment recorded: ${firstPaymentId}`);

  console.log('\n👉 [2/3] Recording second payment with SAME idempotency key...');
  const res2 = await LedgerService.recordPaymentSettlement({
    partnerId: retailerId,
    amount: 2000,
    paymentMethod: 'upi',
    idempotencyKey: idempotencyKey,
  }, wholesalerId, 'wholesaler');

  assert.equal(res2.success, true);
  assert.equal(res2.paymentId, firstPaymentId, 'Payment ID must be the same');
  assert.equal(res2.transactionId, firstTxId, 'Transaction ID must be the same');
  console.log(`   ✅ Idempotency verified: Returned existing payment ${res2.paymentId}`);

  console.log('\n👉 [3/3] Verifying DB state: Only one transaction should exist...');
  const txCount = await prisma.ledgerTransaction.count({
    where: { paymentId: firstPaymentId }
  });
  assert.equal(txCount, 1, 'There should only be one ledger transaction for this payment');
  
  const account = await prisma.ledgerAccount.findUnique({ where: { id: res1.ledgerId } });
  assert.equal(account?.currentBalance.toNumber(), 8000, 'Balance should only be decremented once');
  console.log(`   ✅ DB state verified: Balance is ₹${account?.currentBalance.toNumber()} (Correctly decremented once)`);

  console.log('\n======================================================================');
  console.log('📊 SUMMARY: PAYMENT IDEMPOTENCY TEST PASSED');
  console.log('======================================================================');
}

runIdempotencyTests().catch(console.error);
