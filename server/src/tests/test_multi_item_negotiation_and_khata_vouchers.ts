import assert from 'node:assert/strict';
import { ChatService } from '../modules/chat/chat.service';
import { LedgerService } from '../modules/ledger/ledger.service';
import prisma from '../db';

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 RUNNING TASK 2 INTEGRATION TESTS: MULTI-ITEM NEGOTIATION & KHATA VOUCHERS');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Multi-Item Line Negotiation
  // -------------------------------------------------------------------------
  console.log('👉 [1/6] Testing Multi-Item Line Negotiation Proposal (Atta & Rice Contested, Oil Locked)...');

  // This suite shares its fixture order with the dispute suite, which leaves it
  // delivered/deal-locked. Reset it to a negotiable state for repeatable runs.
  const testOrderId = 'ord-po-demo-01';
  await prisma.order.updateMany({
    where: { id: testOrderId },
    data: { orderStatus: 'negotiating' },
  });
  await prisma.negotiationState.deleteMany({ where: { orderId: testOrderId } });

  const proposalResult = await ChatService.proposeRate({
    orderId: testOrderId,
    userId: 'ret-user-gupta-01',
    userName: 'Gupta Kirana Store',
    userType: 'retailer',
    clientVersion: 1,
    isFinalOffer: false,
    notes: 'Bilateral counter proposal across multi-item line order',
    items: [
      {
        orderItemId: 'item-01',
        proposedUnitPrice: 410.00,
        proposedQuantity: 25,
        reason: 'Counter proposal for bulk Atta',
      },
      {
        orderItemId: 'item-02',
        proposedUnitPrice: 450.00,
        proposedQuantity: 15,
        reason: 'Counter proposal for Rice',
      },
      // Note: item-03 (Oil @ 128) is omitted from contested items, remaining locked at quoted rate
    ],
  });

  assert.ok(proposalResult, 'Proposal result should not be null');
  assert.equal(proposalResult.previousSubtotal, 21240.00, 'Original quoted total should be ₹21,240.00');
  assert.equal(proposalResult.proposedSubtotal, 20840.00, 'Recalculated order subtotal should be ₹20,840.00');
  assert.equal(proposalResult.totalSavings, 400.00, 'Total customer savings should be ₹400.00');
  assert.equal(proposalResult.items.length, 3, 'Proposal must return all 3 line items in the order');

  const attaItem = proposalResult.items.find((i) => i.orderItemId === 'item-01');
  const riceItem = proposalResult.items.find((i) => i.orderItemId === 'item-02');
  const oilItem = proposalResult.items.find((i) => i.orderItemId === 'item-03');

  assert.ok(attaItem?.isContested, 'Atta item should be marked as contested');
  assert.equal(attaItem?.status, 'contested');
  assert.equal(attaItem?.proposedUnitPrice, 410.00);

  assert.ok(riceItem?.isContested, 'Rice item should be marked as contested');
  assert.equal(riceItem?.status, 'contested');
  assert.equal(riceItem?.proposedUnitPrice, 450.00);

  assert.equal(oilItem?.isContested, false, 'Oil item should remain uncontested and locked');
  assert.equal(oilItem?.status, 'locked');
  assert.equal(oilItem?.proposedUnitPrice, 128.00);
  console.log('✅ Multi-item proposal verified: ₹20,840.00 subtotal (Saved ₹400.00 across 3 items).');

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Bilateral Handshake & Contract Lock for All Lines
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Testing Bilateral Contract Confirmation & Price Lock for All Lines...');
  const lockResult = await ChatService.confirmRate({
    orderId: testOrderId,
    userId: 'ws-user-kailash-01',
    userName: 'Kailash Grains & Pulses',
    userType: 'wholesaler',
    clientVersion: 2,
    notes: 'Bilateral confirmation of all multi-item rates',
  });

  assert.ok(lockResult, 'Lock result should not be null');
  assert.equal(lockResult.isDealLocked, true, 'Deal should be locked');
  assert.ok(
    lockResult.orderStatus === 'locked' || lockResult.orderStatus === 'deal_locked',
    'Order status should transition to locked or deal_locked'
  );
  assert.equal(lockResult.finalPrice, 20840.00, 'Total contract value must be ₹20,840.00');
  assert.equal(lockResult.lockedItems.length, 3, 'All 3 items must have locked snapshots');
  console.log('✅ Bilateral contract lock verified: Contract sealed at ₹20,840.00.');

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Khata Partial Payment Recording & Atomic Balance Decrement
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Testing Khata Lump-Sum Payment Settlement (₹5,000 Repayment)...');
  const accountBefore = await LedgerService.getLedgerAccount(
    'ret-user-gupta-01',
    'ws-user-kailash-01',
    'wholesaler'
  );
  const balanceBefore = accountBefore?.currentBalance || 16600.00;
  console.log(`   Initial Khata Balance: ₹${balanceBefore.toFixed(2)}`);

  const paymentPayload = {
    partnerId: 'ws-user-kailash-01',
    retailerId: 'ret-user-gupta-01',
    wholesalerId: 'ws-user-kailash-01',
    amount: 5000.00,
    idempotencyKey: 'test-khata-settlement-po-42-001',
    paymentMethod: 'upi' as const,
    referenceNumber: 'UPI-RR-9948210384',
    notes: 'Bi-weekly Khata lump-sum repayment via HDFC UPI',
    settlementCycle: '15_days' as const,
    allocatedInvoices: [
      {
        invoiceId: 'inv-po-42-del-01',
        invoiceNumber: 'INV-2026-DEL-0042',
        amountApplied: 5000.00,
      },
    ],
  };

  const paymentResult = await LedgerService.recordPaymentSettlement(
    paymentPayload,
    'ws-user-kailash-01',
    'wholesaler'
  );

  assert.ok(paymentResult, 'Payment result should not be null');
  assert.equal(paymentResult.amount, 5000.00, 'Recorded payment amount must be ₹5,000.00');
  assert.equal(paymentResult.newBalance, balanceBefore - 5000.00, `Running balance must decrement to ₹${(balanceBefore - 5000).toFixed(2)}`);
  assert.ok(paymentResult.voucherId, 'Voucher ID must be generated');
  assert.ok(paymentResult.voucherNumber.startsWith('KSV-2026-'), 'Voucher number must match KSV-2026-XXXXXX format');
  console.log(`✅ Khata repayment verified: ₹5,000 decremented. New Running Balance: ₹${paymentResult.newBalance.toFixed(2)}.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Khata Settlement Voucher CA Double-Entry Journal
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Testing Khata Settlement Voucher & Double-Entry Journal Integrity...');
  const voucher = await LedgerService.getSettlementVoucher(paymentResult.voucherId, 'ws-user-kailash-01');

  assert.ok(voucher, 'Voucher must be retrievable by voucherId');
  assert.equal(voucher.amountPaid, 5000.00, 'Voucher amount must be ₹5,000.00');
  assert.equal(voucher.settlementCycle, '15_days', 'Settlement cycle must be 15_days');
  assert.equal(voucher.openingBalance, balanceBefore, 'Balance before must match');
  assert.equal(voucher.closingBalance, balanceBefore - 5000.00, 'Balance after must match');
  assert.ok(voucher.digitalSignatureHash, 'Voucher must contain SHA-256 digital signature');
  assert.equal(voucher.digitalSignatureHash.length, 64, 'SHA-256 must be 64 hex characters');

  // Verify Double-Entry Journal
  assert.ok(voucher.journalEntry, 'Double entry journal must exist');
  assert.equal(voucher.journalEntry.debitAccount, 'HDFC Bank B2B Current A/c (*9821)');
  assert.equal(voucher.journalEntry.debitAmount, 5000.00);
  assert.ok(voucher.journalEntry.creditAccount.includes('Sundry Debtors'));
  assert.equal(voucher.journalEntry.creditAmount, 5000.00);
  console.log('✅ CA double-entry journal verified:');
  console.log(`   Dr. ${voucher.journalEntry.debitAccount}: ₹${voucher.journalEntry.debitAmount.toFixed(2)}`);
  console.log(`   Cr. ${voucher.journalEntry.creditAccount}: ₹${voucher.journalEntry.creditAmount.toFixed(2)}`);
  console.log(`   SHA-256 Seal: ${voucher.digitalSignatureHash}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: CA RFC-4180 CSV Export
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Testing CA Settlement Voucher RFC-4180 CSV Export...');
  const csvContent = await LedgerService.exportVoucherCsv(voucher.voucherNumber, 'ws-user-kailash-01');

  assert.ok(typeof csvContent === 'string', 'Export result must be a CSV string');
  assert.ok(csvContent.includes(voucher.voucherNumber), 'CSV must contain voucher number');
  assert.ok(csvContent.includes('DOUBLE-ENTRY GENERAL JOURNAL'), 'CSV must contain journal section');
  assert.ok(csvContent.includes('Sundry Debtors'), 'CSV must contain Sundry Debtors account');
  assert.ok(csvContent.includes(voucher.digitalSignatureHash), 'CSV must contain SHA-256 seal');
  console.log('✅ CA CSV export verified: RFC-4180 format with journal and SHA-256 seal.');

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Multi-Tenant Ledger Account Isolation
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Testing Multi-Tenant Ledger Account Isolation...');
  const otherRetailerId = 'ret-user-other-02';
  await prisma.user.upsert({
    where: { id: otherRetailerId },
    update: {},
    create: {
      id: otherRetailerId,
      email: 'other-retailer@sharvin.test',
      phoneNumber: '9876500099',
      userType: 'retailer',
      fullName: 'Other Retailer',
      businessName: 'Other Kirana Store',
      isVerified: true,
    },
  });
  const otherConnection = await prisma.retailerWholesalerConnection.upsert({
    where: {
      retailerId_wholesalerId: {
        retailerId: otherRetailerId,
        wholesalerId: 'ws-user-kailash-01',
      },
    },
    update: {},
    create: {
      retailerId: otherRetailerId,
      wholesalerId: 'ws-user-kailash-01',
      connectionStatus: 'active',
    },
  });
  await prisma.ledgerAccount.upsert({
    where: {
      retailerId_wholesalerId: {
        retailerId: otherRetailerId,
        wholesalerId: 'ws-user-kailash-01',
      },
    },
    update: {},
    create: {
      retailerId: otherRetailerId,
      wholesalerId: 'ws-user-kailash-01',
      connectionId: otherConnection.id,
    },
  });
  const isolatedAccount = await LedgerService.getLedgerAccount(
    otherRetailerId,
    'ws-user-kailash-01',
    'wholesaler'
  );
  assert.notEqual(isolatedAccount?.ledgerId, accountBefore?.ledgerId, 'Independent retailer must have separate ledger account');
  console.log('✅ Multi-tenant isolation verified: Separate ledger accounts maintained per trading pair.');

  console.log('\n======================================================================');
  console.log('🎉 ALL 6 TEST SUITES PASSED CLEANLY! TASK 2 VERIFIED.');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
