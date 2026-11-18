/**
 * P1 Roadmap #1 verification suite: delivery dispute, statutory credit note and
 * inventory rebalance report persistence (PostgreSQL replaces the former in-memory maps).
 *
 *   npx tsx src/tests/test_dispute_and_credit_note_persistence.ts
 *   npx tsx src/tests/test_dispute_and_credit_note_persistence.ts read <ORDER_NUMBER>
 *
 * The `read` phase runs in a fresh process, so everything it returns can only have come
 * from PostgreSQL - which is what proves the in-memory maps are gone.
 *
 * Requires a dev database that already contains at least one retailer-wholesaler
 * connection (the suite creates its own isolated order and never reuses demo fixtures).
 */
import assert from 'assert';
import prisma from '../db';
import { DeliveryService } from '../modules/delivery/delivery.service';
import { LineItemInspectionPayload } from '../modules/delivery/delivery.types';

async function rawDump(orderId: string) {
  const notes = await prisma.$queryRaw<any[]>`
    SELECT credit_note_number, status, reason, credit_note_amount, signature_hash
    FROM credit_notes WHERE order_id = ${orderId}`;
  const disputes = await prisma.$queryRaw<any[]>`
    SELECT dispute_number, status, reported_by, damaged_qty, total_claim_amount, escrow_hold_amount, proof_image_url
    FROM delivery_disputes WHERE order_id = ${orderId}`;
  const rebalances = await prisma.$queryRaw<any[]>`
    SELECT order_number, total_units_transferred, total_damaged_units, is_partial_delivery,
           adjusted_order_amount, jsonb_array_length(items_snapshot) AS item_count
    FROM delivery_rebalances WHERE order_id = ${orderId}`;

  return { notes, disputes, rebalances };
}

async function resolveTenantPair() {
  const connection = await prisma.retailerWholesalerConnection.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!connection) {
    throw new Error('No retailer-wholesaler connection in the database. Register a retailer and wholesaler first, then re-run this suite.');
  }
  return { retailerId: connection.retailerId, wholesalerId: connection.wholesalerId, connectionId: connection.id };
}

const INSPECTIONS: LineItemInspectionPayload[] = [
  {
    orderItemId: 'persist-item-1',
    productId: 'prod-persist-atta',
    productName: 'Aashirvaad Shudh Chakki Atta 10kg',
    orderedQuantity: 25,
    acceptedQuantity: 20,
    rejectedQuantity: 5,
    rejectionReason: 'waterlogged_spoilage',
    rejectionNotes: '5 bags waterlogged in monsoon transit',
    unitPrice: 410,
  },
  {
    orderItemId: 'persist-item-2',
    productId: 'prod-persist-oil',
    productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch',
    orderedQuantity: 30,
    acceptedQuantity: 30,
    rejectedQuantity: 0,
    unitPrice: 128,
  },
];

async function runWritePhase() {
  console.log('======================================================================');
  console.log('🧪 DISPUTE & CREDIT NOTE PERSISTENCE - WRITE PHASE');
  console.log('======================================================================');

  const suffix = Date.now();
  const orderId = `ord-persist-p1-${suffix}`;
  const orderNumber = `PO-PERSIST-${suffix}`;
  const { retailerId, wholesalerId, connectionId } = await resolveTenantPair();

  // [1] A real order row: dispatch is DB-backed only now.
  console.log('\n👉 [1/5] Creating persisted fixture order and dispatching...');
  await prisma.order.create({
    data: {
      id: orderId,
      retailerId,
      wholesalerId,
      connectionId,
      orderNumber,
      orderStatus: 'deal_locked',
      subtotal: 16600,
      finalPrice: 16600,
    },
  });

  const dispatch = await DeliveryService.dispatchOrder(
    { orderId, driverName: 'Persistence Verification Driver', driverPhone: '9876543210' },
    wholesalerId,
    'wholesaler'
  );
  assert.match(dispatch.deliveryId, /^[0-9a-f-]{36}$/, 'deliveryId must be the persisted row id, not a fabricated one');
  console.log(`✅ Dispatched: deliveryId=${dispatch.deliveryId} OTP=${dispatch.retailerOtpCode}`);

  // [2] Strict dispatch: an order that is not in PostgreSQL must fail loudly.
  console.log('\n👉 [2/5] Verifying dispatch fails loudly for an unpersisted order...');
  let unknownOrderBlocked = false;
  try {
    await DeliveryService.dispatchOrder({ orderId: 'ord-does-not-exist-000' }, wholesalerId, 'wholesaler');
  } catch (err: any) {
    unknownOrderBlocked = err?.code === 'NOT_FOUND' && /does not exist in PostgreSQL/.test(err.message);
  }
  assert.ok(unknownOrderBlocked, 'Dispatching an unknown order must throw a readable NOT_FOUND AppError');
  console.log('✅ Phantom in-memory dispatch is gone: unknown orders return 404');

  // [3] Partial delivery with damaged goods.
  console.log('\n👉 [3/5] Verifying handover with 5 damaged units (partial delivery)...');
  const result = await DeliveryService.verifyHandover(
    {
      orderId,
      otpCode: dispatch.retailerOtpCode!,
      deliveryProofImageUrl: 'https://cdn.sharvin.test/proof/waterlogged-atta.png',
      disputeNotes: 'Doorstep inspection: 5 Atta bags waterlogged.',
      lineItemInspections: INSPECTIONS,
    },
    wholesalerId,
    'wholesaler'
  );

  assert.equal(result.isPartialDelivery, true, 'Delivery must be flagged partial');
  assert.equal(result.damagedUnits, 5, 'Damaged units must be 5');
  assert.equal(result.acceptedUnits, 50, 'Accepted units must be 50 (20 Atta + 30 Oil)');
  assert.ok(result.creditNote, 'Credit note must be returned');
  assert.ok(result.dispute, 'Dispute must be returned');
  assert.match(result.creditNote!.creditNoteId, /^[0-9a-f-]{36}$/, 'Credit note id must be a persisted row id');
  assert.match(result.creditNote!.creditNoteNumber, /^CN-\d{4}-\d{4,}$/, 'Credit note number must be sequential');
  assert.match(result.dispute!.disputeNumber, /^DSP-\d{4}-\d{4,}$/, 'Dispute number must be sequential');
  assert.equal(result.creditNote!.creditNoteAmount, 2152.5, 'Credit note must be 5 x 410 + 5% GST = ₹2,152.50');
  console.log(`✅ Partial handover: ${result.creditNote!.creditNoteNumber} + ${result.dispute!.disputeNumber} (₹${result.creditNote!.creditNoteAmount})`);

  // [4] The rows must physically exist in PostgreSQL.
  console.log('\n👉 [4/5] Reading the rows back with raw SQL (bypassing Prisma mappings)...');
  const dump = await rawDump(orderId);
  assert.equal(dump.notes.length, 1, 'One credit_notes row');
  assert.equal(dump.disputes.length, 1, 'One delivery_disputes row');
  assert.equal(dump.rebalances.length, 1, 'One delivery_rebalances row');
  assert.equal(dump.disputes[0].damaged_qty, 5, 'damaged_qty persisted');
  assert.equal(dump.disputes[0].status, 'open', 'dispute starts open');
  assert.equal(dump.disputes[0].proof_image_url, 'https://cdn.sharvin.test/proof/waterlogged-atta.png', 'proof image persisted');
  assert.equal(String(dump.disputes[0].escrow_hold_amount), '2152.5', 'escrow hold persisted on the dispute');
  assert.equal(dump.notes[0].status, 'issued', 'credit note issued');
  assert.equal(dump.notes[0].reason, 'waterlogged_spoilage', 'credit note reason persisted');
  assert.equal(dump.rebalances[0].total_units_transferred, 50, 'rebalance totals persisted');
  assert.equal(dump.rebalances[0].item_count, 2, 'rebalance item snapshot persisted');
  console.log('✅ Rows present:', JSON.stringify({
    credit_note: dump.notes[0].credit_note_number,
    dispute: dump.disputes[0].dispute_number,
    rebalance_units: dump.rebalances[0].total_units_transferred,
  }));

  // [5] Replaying the verification must rebuild identical figures from the DB.
  console.log('\n👉 [5/5] Replaying the verification (idempotent read-back)...');
  const replay = await DeliveryService.verifyHandover({ orderId, otpCode: dispatch.retailerOtpCode! }, wholesalerId, 'wholesaler');
  assert.equal(replay.isPartialDelivery, true, 'Replay must still report the partial delivery');
  assert.equal(replay.damagedUnits, 5, 'Replay damaged units come from the dispute row');
  assert.equal(replay.creditNote?.creditNoteNumber, result.creditNote!.creditNoteNumber, 'Replay returns the persisted credit note');
  assert.equal(replay.dispute?.disputeId, result.dispute!.disputeId, 'Replay returns the persisted dispute');

  const firstSummary = await DeliveryService.getRebalanceSummary(orderId, retailerId, 'retailer');
  const secondSummary = await DeliveryService.getRebalanceSummary(orderId, retailerId, 'retailer');
  assert.deepEqual(firstSummary, secondSummary, 'Summary reads must be pure reads (no re-stocking side effect)');
  assert.equal(firstSummary.totalDamagedUnits, 5, 'Summary damaged units persisted');

  // Multi-tenant gate: a stranger may not read the credit note.
  let foreignReadBlocked = false;
  try {
    await DeliveryService.getCreditNote(result.creditNote!.creditNoteId, 'some-other-tenant');
  } catch (err: any) {
    foreignReadBlocked = err?.code === 'FORBIDDEN';
  }
  assert.ok(foreignReadBlocked, 'Credit note read must be tenant-scoped');

  console.log('\n======================================================================');
  console.log('🎉 WRITE PHASE PASSED. Run the read phase in a NEW process to prove statelessness:');
  console.log(`   npx tsx src/tests/test_dispute_and_credit_note_persistence.ts read ${orderNumber}`);
  console.log('======================================================================\n');
  return orderNumber;
}

async function runReadPhase(orderNumber: string) {
  console.log('======================================================================');
  console.log(`🧪 DISPUTE & CREDIT NOTE PERSISTENCE - READ PHASE (fresh process) ${orderNumber}`);
  console.log('======================================================================');

  const dispute = await DeliveryService.getDispute(orderNumber);
  assert.ok(dispute, 'Dispute must be resolved from PostgreSQL in a new process');
  assert.equal(dispute.disputeStatus, 'open', 'Dispute still open before resolution');
  assert.equal(dispute.inspections.length, 2, 'Line inspections persisted as a snapshot');
  assert.ok(dispute.creditNote, 'Credit note must be linked to the dispute row');
  console.log(`✅ dispute=${dispute.disputeNumber} claim=₹${dispute.totalClaimAmount} note=${dispute.creditNote!.creditNoteNumber}`);

  const note = await DeliveryService.getCreditNote(dispute.creditNote!.creditNoteNumber, dispute.retailerId);
  assert.ok(note, 'Credit note must be readable by its number');
  const csv = await DeliveryService.exportCreditNoteCsv(note.creditNoteId, dispute.wholesalerId);
  assert.ok(csv.includes(note.creditNoteNumber), 'CSV export renders the persisted number');
  assert.ok(csv.includes(note.digitalSignatureHash), 'CSV export renders the persisted seal');
  console.log(`✅ credit note + RFC-4180 CSV export rebuilt from PostgreSQL (${csv.length} chars)`);

  const summary = await DeliveryService.getRebalanceSummary(orderNumber, dispute.retailerId, 'retailer');
  assert.equal(summary.isDelivered, true, 'Persisted report marks delivery');
  assert.equal(summary.totalDamagedUnits, 5, 'Persisted report damaged units');
  console.log(`✅ rebalance report: ${summary.totalUnitsTransferred} units in, ${summary.totalDamagedUnits} damaged`);

  // Wholesaler resolution must update the persisted rows.
  const resolved = await DeliveryService.resolveDispute(orderNumber, {
    action: 'approve_credit_note',
    resolutionNotes: 'Wholesaler approved the credit note against the doorstep damage photo.',
  }, dispute.wholesalerId, 'wholesaler');
  assert.equal(resolved.disputeStatus, 'resolved', 'Dispute resolved');
  assert.equal(resolved.escrowHoldAmount, 0, 'Escrow hold cleared to 0');
  assert.equal(resolved.creditNote?.status, 'approved_by_wholesaler', 'Credit note approved');

  const rows = await prisma.$queryRaw<any[]>`
    SELECT d.status AS dispute_status, d.escrow_hold_amount, d.resolved_at, c.status AS note_status
    FROM delivery_disputes d JOIN credit_notes c ON c.credit_note_id = d.credit_note_id
    WHERE d.order_number = ${orderNumber}`;
  assert.equal(rows.length, 1, 'Resolution updated the existing dispute row (no duplicate)');
  assert.equal(rows[0].dispute_status, 'resolved', 'delivery_disputes.status persisted');
  assert.equal(rows[0].note_status, 'approved_by_wholesaler', 'credit_notes.status persisted');
  assert.notEqual(rows[0].resolved_at, null, 'resolved_at timestamp persisted');
  console.log('✅ resolution persisted:', JSON.stringify(rows[0]));

  console.log('\n🎉 READ PHASE PASSED - every value came from PostgreSQL, not process memory.\n');
}

async function main() {
  if (process.argv[2] === 'read') {
    assert.ok(process.argv[3], 'read phase requires the order number printed by the write phase');
    await runReadPhase(process.argv[3]!);
  } else {
    await runWritePhase();
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('❌ Persistence suite failed:', err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
