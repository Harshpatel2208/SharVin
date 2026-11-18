import assert from 'node:assert/strict';
import { LedgerService } from '../modules/ledger/ledger.service';
import prisma from '../db';

async function runCreditLimitAndOverdueFreezeTests() {
  console.log('======================================================================');
  console.log('🧪 TESTING PHASE 3, TASK 6: BILATERAL CREDIT LIMIT & OVERDUE FREEZE');
  console.log('======================================================================');

  const suffix = Date.now();
  const retailerId = `ret-credit-${suffix}`;
  const wholesalerId = 'ws-user-kailash-01';
  const testOrderId = `ord-credit-${suffix}`;

  // Isolated fixture pair so overdue invoices from other suites never leak in.
  await prisma.user.create({
    data: {
      id: retailerId,
      email: `credit-${suffix}@sharvin.test`,
      phoneNumber: `9${String(suffix).slice(-9)}`,
      userType: 'retailer',
      fullName: 'Credit Test Retailer',
      businessName: 'Credit Test Kirana',
      isVerified: true,
    },
  });
  const connection = await prisma.retailerWholesalerConnection.create({
    data: {
      retailerId,
      wholesalerId,
      connectionStatus: 'active',
    },
  });
  await prisma.ledgerAccount.create({
    data: {
      retailerId,
      wholesalerId,
      connectionId: connection.id,
      currentBalance: 0,
    },
  });
  await prisma.order.create({
    data: {
      id: testOrderId,
      retailerId,
      wholesalerId,
      connectionId: connection.id,
      orderNumber: `PO-CREDIT-${suffix}`,
      orderStatus: 'deal_locked',
    },
  });

  const cleanup = async () => {
    await prisma.invoice.deleteMany({ where: { orderId: testOrderId } });
    await prisma.ledgerAccount.deleteMany({ where: { retailerId, wholesalerId } });
    await prisma.order.deleteMany({ where: { id: testOrderId } });
    await prisma.retailerWholesalerConnection.deleteMany({ where: { id: connection.id } });
    await prisma.user.deleteMany({ where: { id: retailerId } });
  };

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Wholesaler Configures Credit Limit & Payment Term Days
  // -------------------------------------------------------------------------
  console.log('\n👉 [1/6] Testing Wholesaler Sets Credit Limit & Payment Terms...');
  const termsUpdate = await LedgerService.updateCreditTerms(
    retailerId,
    50000.00, // ₹50,000 Credit Limit
    15,       // 15 Days Payment Terms
    wholesalerId
  );

  assert.equal(termsUpdate.success, true, 'Updating terms must succeed');
  assert.equal(termsUpdate.creditLimit, 50000.00, 'Credit limit must be ₹50,000.00');
  assert.equal(termsUpdate.paymentTermDays, 15, 'Payment term days must be 15');
  console.log('   ✅ Wholesaler successfully set Credit Limit = ₹50,000 and Payment Term = 15 Days');

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Standard Trade Under Limit (Healthy & Active)
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Testing Healthy Trade Under Credit Limit...');
  const healthyProfile = await LedgerService.getCreditProfile(
    retailerId,
    retailerId,
    'retailer',
    { cartTotal: 10000.00 }
  );

  assert.equal(healthyProfile.creditLimit, 50000.00, 'Credit limit must match configured');
  assert.equal(healthyProfile.paymentTermDays, 15, 'Payment terms must match 15 days');
  assert.equal(healthyProfile.isOverdue, false, 'Should have no overdue invoices');
  console.log(`   ✅ Healthy Profile Verified: Outstanding ₹${healthyProfile.currentBalance}, Limit ₹${healthyProfile.creditLimit}, Blocked: ${healthyProfile.isBlocked}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Credit Limit Exhaustion Block (Outstanding > Credit Limit)
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Testing Credit Limit Exhaustion Blocking Gate...');
  const limitExceededProfile = await LedgerService.getCreditProfile(
    retailerId,
    retailerId,
    'retailer',
    { simulateCreditExceeded: true, cartTotal: 5000.00 }
  );

  assert.equal(limitExceededProfile.isCreditExceeded, true, 'isCreditExceeded must be true');
  assert.equal(limitExceededProfile.isBlocked, true, 'Ordering must be blocked when credit limit is exceeded');
  assert.equal(limitExceededProfile.creditStatus, 'frozen_limit_exhausted', 'Status must be frozen_limit_exhausted');
  assert.ok(limitExceededProfile.minSettlementRequired > 0, 'Must compute minimum settlement required to unblock');
  console.log(`   ✅ Credit Exhaustion Block Verified: Outstanding ₹${limitExceededProfile.currentBalance} exceeds Limit ₹${limitExceededProfile.creditLimit}. Min Settle Required: ₹${limitExceededProfile.minSettlementRequired}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Overdue Invoices Freeze Gate (Bills Past Payment Terms)
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Testing Overdue Invoices Freeze Gate...');
  await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-CREDIT-${suffix}`,
      orderId: testOrderId,
      orderNumber: `PO-CREDIT-${suffix}`,
      wholesalerId,
      wholesalerName: 'Kailash Grains & Pulses',
      wholesalerGstin: '07BBBBB1111B2Z6',
      wholesalerAddress: 'Godown 12-B, Grain Market, Delhi',
      retailerId,
      retailerName: 'Credit Test Kirana',
      retailerGstin: '07AAAAA0000A1Z5',
      retailerAddress: 'Shop 1, Credit Test Market, Delhi',
      taxableAmount: 12400.00,
      totalTaxAmount: 0,
      totalInvoiceAmount: 12400.00,
      itemsSnapshot: [],
      signatureHash: 'a'.repeat(64),
      qrCodeData: 'qr-credit-test',
      status: 'issued',
      issuedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 15-day term + 6 days overdue
    },
  });

  const overdueProfile = await LedgerService.getCreditProfile(
    retailerId,
    retailerId,
    'retailer'
  );

  assert.equal(overdueProfile.isOverdue, true, 'isOverdue must be true');
  assert.equal(overdueProfile.isBlocked, true, 'Ordering must be blocked when invoices are overdue');
  assert.equal(overdueProfile.creditStatus, 'frozen_overdue', 'Status must be frozen_overdue');
  assert.equal(overdueProfile.overdueInvoices.length, 1, 'Must contain 1 overdue invoice');
  assert.equal(overdueProfile.overdueInvoices[0].daysOverdue, 6, 'Must record 6 days overdue');
  assert.equal(overdueProfile.overdueInvoices[0].amount, 12400.00, 'Overdue amount must be ₹12,400');
  console.log(`   ✅ Overdue Freeze Verified: Invoice ${overdueProfile.overdueInvoices[0].invoiceNumber} is ${overdueProfile.overdueInvoices[0].daysOverdue} days overdue. Total Overdue: ₹${overdueProfile.overdueAmount}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Wholesaler Formal Payment Demand
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Testing Wholesaler Formal Payment Demand...');
  const demandResult = await LedgerService.demandPayment(
    testOrderId,
    wholesalerId,
    'Overdue bill of ₹12,400 must be cleared before dispatching festive restock.'
  );

  assert.equal(demandResult.success, true, 'Payment demand must succeed');
  assert.equal(demandResult.orderId, testOrderId, 'Order ID must match');
  console.log(`   ✅ Payment Demand Issued: "${demandResult.message}"`);

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Wholesaler Emergency Credit Limit Override Gate
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Testing Wholesaler Credit Limit Override & Dispatch Unblock...');
  const overrideReason = 'Festival restock goodwill approved by Seth Ramesh';
  const overrideResult = await LedgerService.overrideOrderCredit(
    testOrderId,
    overrideReason,
    'ws-user-kailash-01',
    'wholesaler'
  );

  assert.equal(overrideResult.success, true, 'Credit override must succeed');
  assert.equal(overrideResult.orderId, testOrderId, 'Overridden order ID must match');
  assert.equal(overrideResult.reason, overrideReason, 'Override reason must match');

  // Re-evaluating credit profile for this specific overridden order must UNBLOCK ordering
  const overriddenProfile = await LedgerService.getCreditProfile(
    retailerId,
    retailerId,
    'retailer',
    { orderId: testOrderId }
  );

  assert.equal(overriddenProfile.isOrderOverridden, true, 'isOrderOverridden must be true');
  assert.equal(overriddenProfile.isBlocked, false, 'Ordering MUST be unblocked once overridden by wholesaler');
  assert.ok(overriddenProfile.overrideDetails, 'Must include override audit details');
  assert.equal(overriddenProfile.overrideDetails?.reason, overrideReason, 'Override audit reason must match');
  console.log(`   ✅ Wholesaler Override Verified: Order ${testOrderId} unblocked by Seth! Audit: "${overriddenProfile.overrideDetails?.reason}"`);

  // Clean up isolated fixtures
  await cleanup();

  console.log('\n======================================================================');
  console.log('🎉 ALL 6 BILATERAL CREDIT LIMIT & OVERDUE FREEZE TESTS PASSED (100%)');
  console.log('======================================================================\n');
}

runCreditLimitAndOverdueFreezeTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
