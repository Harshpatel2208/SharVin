import assert from 'assert';
import { DeliveryService } from '../modules/delivery/delivery.service';
import { LedgerService } from '../modules/ledger/ledger.service';
import { LineItemInspectionPayload } from '../modules/delivery/delivery.types';
import prisma from '../db';

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 RUNNING TASK 3 TEST SUITE: DISPUTE RESOLUTION ESCROW & PARTIAL DELIVERY');
  console.log('======================================================================');

  const testOrderId = 'ord-po-demo-01';
  const testOrderNumber = 'PO-2026-0042';
  const retailerId = 'ret-user-gupta-01';
  const wholesalerId = 'ws-user-kailash-01';

  // Escrow holds are posted to the seeded Khata ledger, so the order must exist.
  const connection = await prisma.retailerWholesalerConnection.findFirstOrThrow({
    where: { retailerId, wholesalerId },
  });
  await prisma.order.upsert({
    where: { id: testOrderId },
    update: {},
    create: {
      id: testOrderId,
      retailerId,
      wholesalerId,
      connectionId: connection.id,
      orderNumber: testOrderNumber,
      orderStatus: 'deal_locked',
    },
  });

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Doorstep Dispatch & OTP Generation
  // -------------------------------------------------------------------------
  console.log('\n👉 [1/6] Testing Order Delivery Dispatch & Two-Way OTP Generation...');
  const dispatchRecord = await DeliveryService.dispatchOrder(
    {
      orderId: testOrderId,
      deliveryType: 'local_driver',
      driverName: 'Ramesh Kumar (Logistics)',
      driverPhone: '9876543210',
    },
    wholesalerId,
    'wholesaler'
  );

  assert.ok(dispatchRecord, 'Dispatch record should not be null');
  assert.equal(dispatchRecord.deliveryStatus, 'out_for_delivery');
  assert.ok(dispatchRecord.retailerOtpCode, 'Retailer OTP must be generated');
  assert.equal(dispatchRecord.retailerOtpCode?.length, 6, 'Retailer OTP must be 6 digits');
  console.log(`✅ Order dispatched. Two-way Handover OTP: ${dispatchRecord.retailerOtpCode}.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Multi-Item Doorstep Partial Acceptance (5 Damaged Atta Bags)
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Testing Doorstep Multi-Item Line Inspection & Rejection...');
  const inspectionPayload: LineItemInspectionPayload[] = [
    {
      orderItemId: 'item-001',
      productId: 'p-001',
      productName: 'Aashirvaad Shudh Chakki Atta 10kg',
      orderedQuantity: 25,
      acceptedQuantity: 20,
      rejectedQuantity: 5,
      rejectionReason: 'waterlogged_spoilage',
      rejectionNotes: 'Moisture ingress on 5 bags during monsoon transit',
      unitPrice: 410.00,
    },
    {
      orderItemId: 'item-002',
      productId: 'p-004',
      productName: 'India Gate Basmati Rice Feast Rozzana 5kg',
      orderedQuantity: 15,
      acceptedQuantity: 15,
      rejectedQuantity: 0,
      unitPrice: 450.00,
    },
    {
      orderItemId: 'item-003',
      productId: 'p-002',
      productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch',
      orderedQuantity: 30,
      acceptedQuantity: 30,
      rejectedQuantity: 0,
      unitPrice: 128.00,
    },
  ];

  const verifyResult = await DeliveryService.verifyHandover(
    {
      orderId: testOrderId,
      otpCode: dispatchRecord.retailerOtpCode!,
      lineItemInspections: inspectionPayload,
      disputeNotes: 'Doorstep inspection: 5 bags Atta waterlogged, 65 units intact accepted.',
    },
    wholesalerId,
    'wholesaler'
  );

  assert.ok(verifyResult.success, 'Handover verification must succeed');
  assert.equal(verifyResult.isVerified, true, 'Delivery must be verified');
  assert.equal(verifyResult.isPartialDelivery, true, 'Delivery must be flagged as partial');
  assert.equal(verifyResult.acceptedUnits, 65, 'Total accepted intact units must be 65 (20 Atta + 15 Rice + 30 Oil)');
  assert.equal(verifyResult.damagedUnits, 5, 'Damaged units must be 5');
  assert.equal(verifyResult.finalAmount, 18790.00, 'Accepted order amount must be ₹18,790.00 (20*410 + 15*450 + 30*128)');
  console.log(`✅ Multi-item inspection verified: 65 units accepted (₹18,790.00), 5 units rejected.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Retailer POS Stock Rebalancing (Strict Accepted Quantity)
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Testing Retailer POS Inventory Rebalancing...');
  const rebalancedItems = verifyResult.inventoryRebalanced;
  assert.ok(rebalancedItems && rebalancedItems.length === 3, 'Must rebalance 3 items');

  const attaItem = rebalancedItems.find((i) => i.productId === 'p-001');
  assert.ok(attaItem, 'Atta item must exist');
  assert.equal(attaItem.acceptedQuantity, 20, 'Atta accepted quantity credited to POS must be 20');
  assert.equal(attaItem.damagedQuantity, 5, 'Atta damaged quantity excluded from POS must be 5');
  assert.equal(attaItem.quantityAdded, 20, 'Only 20 units must be added to retailer stock');
  assert.equal(attaItem.newRetailerStock, attaItem.previousRetailerStock + 20, 'New retailer stock must reflect strictly accepted units');
  console.log(`✅ POS Inventory rebalance verified: Atta stock credited by 20 units (5 damaged excluded).`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Statutory B2B Credit Note & Double-Entry General Journal
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Testing Statutory B2B Credit Note & CA Journal Integrity...');
  assert.ok(verifyResult.creditNote, 'Statutory credit note must be generated');
  const creditNote = verifyResult.creditNote!;
  assert.ok(creditNote.creditNoteNumber.startsWith('CN-2026-'), 'Credit Note number must start with CN-2026-');
  assert.equal(creditNote.items.length, 1, 'Only 1 item (Atta) was rejected');
  assert.equal(creditNote.items[0].rejectedQuantity, 5, 'Rejected quantity on Credit Note must be 5');
  assert.equal(creditNote.items[0].taxableAmount, 2050.00, 'Taxable value must be 5 * 410 = ₹2,050.00');
  assert.equal(creditNote.items[0].gstAmount, 102.50, 'GST (5%) must be ₹102.50');
  assert.equal(creditNote.creditNoteAmount, 2152.50, 'Total Credit Note amount must be ₹2,152.50');

  // Verify CA Double-Entry Journal
  assert.ok(creditNote.doubleEntryJournal, 'Double entry journal must be present');
  assert.equal(creditNote.doubleEntryJournal.debitAmount, 2050.00, 'Debit to Sales Returns must be ₹2,050.00');
  assert.equal(creditNote.doubleEntryJournal.creditAmount, 2152.50, 'Credit to Sundry Debtors must be ₹2,152.50');
  assert.ok(creditNote.digitalSignatureHash.length === 64, 'Digital signature hash must be SHA-256 (64 hex chars)');
  console.log(`✅ Statutory Credit Note ${creditNote.creditNoteNumber} verified:`);
  console.log(`   Taxable Credit: ₹${creditNote.items[0].taxableAmount.toFixed(2)} + GST: ₹${creditNote.items[0].gstAmount.toFixed(2)} = Total ₹${creditNote.creditNoteAmount.toFixed(2)}`);
  console.log(`   Dr: ${creditNote.doubleEntryJournal.debitAccount} (₹${creditNote.doubleEntryJournal.debitAmount.toFixed(2)})`);
  console.log(`   Cr: ${creditNote.doubleEntryJournal.creditAccount} (₹${creditNote.doubleEntryJournal.creditAmount.toFixed(2)})`);
  console.log(`   SHA-256 Seal: ${creditNote.digitalSignatureHash}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Escrow Dispute Hold on Khata Ledger
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Testing Khata Ledger Escrow Dispute Hold...');
  const ledgerTxsAfterHold = await LedgerService.getLedgerTransactions(retailerId, wholesalerId, 'wholesaler');
  const escrowHoldTx = ledgerTxsAfterHold.find(
    (tx) => tx.orderId === testOrderId && (tx.notes || '').includes('held in escrow dispute hold')
  );
  assert.ok(escrowHoldTx, 'Escrow hold memo transaction must be posted to the Khata ledger');
  assert.equal(escrowHoldTx!.amount, 2152.50, 'Escrow dispute hold on Khata must be exactly ₹2,152.50');
  console.log(`✅ Khata Escrow Dispute Hold confirmed: ₹${escrowHoldTx!.amount.toFixed(2)} locked.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Wholesaler Dispute Approval, Escrow Release & CSV Export
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Testing Wholesaler Dispute Resolution & Escrow Release...');
  const resolvedDispute = await DeliveryService.resolveDispute(
    testOrderId,
    {
      action: 'approve_credit_note',
      resolutionNotes: 'Wholesaler verified doorstep damage photo evidence and approved credit note in full.',
    },
    wholesalerId,
    'wholesaler'
  );

  assert.equal(resolvedDispute.disputeStatus, 'resolved', 'Dispute status must be resolved');
  assert.equal(resolvedDispute.escrowHoldAmount, 0, 'Escrow hold amount on dispute must be cleared to 0');
  assert.equal(resolvedDispute.creditNote?.status, 'approved_by_wholesaler', 'Credit note must be approved by wholesaler');

  // Verify Khata Ledger Escrow cleared
  const ledgerTxsAfterResolution = await LedgerService.getLedgerTransactions(retailerId, wholesalerId, 'wholesaler');
  const escrowReleaseTx = ledgerTxsAfterResolution.find(
    (tx) => tx.orderId === testOrderId && (tx.notes || '').includes('Escrow Released')
  );
  assert.ok(escrowReleaseTx, 'Escrow release transaction must be recorded on the Khata ledger');
  console.log(`✅ Escrow released upon wholesaler approval: release entry ${escrowReleaseTx!.transactionId} recorded.`);

  // Test RFC-4180 CSV Export
  const csvContent = await DeliveryService.exportCreditNoteCsv(creditNote.creditNoteId, retailerId);
  assert.ok(csvContent.includes('SHARVIN B2B STATUTORY CREDIT NOTE'), 'CSV must include header');
  assert.ok(csvContent.includes(creditNote.creditNoteNumber), 'CSV must include Credit Note number');
  assert.ok(csvContent.includes('2152.50'), 'CSV must include total credit amount');
  assert.ok(csvContent.includes(creditNote.digitalSignatureHash), 'CSV must include SHA-256 digital signature seal');
  console.log('✅ Statutory Credit Note RFC-4180 CSV export verified.');

  console.log('\n======================================================================');
  console.log('🎉 ALL 6 TEST SUITES PASSED CLEANLY! TASK 3 VERIFIED.');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
