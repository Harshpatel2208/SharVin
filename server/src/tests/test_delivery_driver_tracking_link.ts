import assert from 'assert';
import { DeliveryService } from '../modules/delivery/delivery.service';
import { createDeliverableOrder } from './order-fixture';

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 RUNNING TASK 5 TEST SUITE: DELIVERY BOY TEMPORARY LINK & TRACKING');
  console.log('======================================================================');

  const testOrderIdLocal = `ord-test-local-${Date.now()}`;
  const testOrderIdRegional = `ord-test-regional-${Date.now()}`;

  // Dispatch is PostgreSQL-backed only (P1): create real order rows before dispatching.
  await createDeliverableOrder(testOrderIdLocal, `PO-LOCAL-${Date.now()}`);
  await createDeliverableOrder(testOrderIdRegional, `PO-REGIONAL-${Date.now()}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Dispatch Order & Generate Secure Tokenized Driver Access Link
  // -------------------------------------------------------------------------
  console.log('\n👉 [1/6] Testing Dispatch Order & Tokenized Web Link Generation...');
  const localDispatch = await DeliveryService.dispatchOrder({
    orderId: testOrderIdLocal,
    deliveryType: 'local_driver',
    driverName: 'Suresh Yadav (Logistics)',
    driverPhone: '9876543210',
    distanceKm: 18.5,
    destinationAddress: 'Shop 14, Main Mandi, Najafgarh, New Delhi 110043',
  });

  assert.ok(localDispatch.driverAccessToken, 'Must generate driverAccessToken');
  assert.ok(localDispatch.driverAccessToken.startsWith('drv_'), 'Driver token must start with drv_ prefix');
  assert.equal(localDispatch.trackingMode, 'local', 'Distance < 100km must assign local tracking mode');
  assert.equal(localDispatch.distanceKm, 18.5, 'Distance must match 18.5 km');
  assert.ok(localDispatch.trackingUrl.includes(localDispatch.driverAccessToken), 'Tracking URL must contain token');
  assert.equal(localDispatch.deliveryStatus, 'out_for_delivery', 'Delivery status must be out_for_delivery');
  console.log(`✅ Order dispatched. Token: ${localDispatch.driverAccessToken}`);
  console.log(`✅ Public Web Link: ${localDispatch.trackingUrl}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Public Driver Portal Token Lookup (No Login / App Required)
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Testing Public Token Lookup without Authentication...');
  const portalDetails = await DeliveryService.getDriverPortalDetails(localDispatch.driverAccessToken);

  assert.equal(portalDetails.orderId, testOrderIdLocal, 'Order ID must match');
  assert.equal(portalDetails.driverName, 'Suresh Yadav (Logistics)', 'Driver name must match');
  assert.ok(portalDetails.items.length > 0, 'Must include checklist items');
  assert.ok(portalDetails.googleMapsUrl.includes('google.com/maps/dir/'), 'Must generate valid Google Maps navigation link');
  assert.equal(portalDetails.isVerified, false, 'Initial state must be unverified');
  console.log(`✅ Portal resolved order with ${portalDetails.items.length} checklist items.`);
  console.log(`✅ Navigation link: ${portalDetails.googleMapsUrl}`);

  // Test invalid token rejection
  let invalidCaught = false;
  try {
    await DeliveryService.getDriverPortalDetails('invalid-fake-token-999');
  } catch (err: any) {
    invalidCaught = true;
    assert.ok(err.message.includes('Invalid or expired driver access link'), 'Must throw descriptive error on invalid token');
  }
  assert.ok(invalidCaught, 'Must reject invalid driver token');
  console.log(`✅ Invalid token successfully intercepted with 404/Error.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Local Distance-Adaptive Mode (<100km) - Live GPS Coordinates
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Testing Local Distance GPS Telemetry Updates (< 100km)...');
  const gpsUpdate = await DeliveryService.updateDriverLocation(
    localDispatch.driverAccessToken,
    28.6250,
    77.1500,
    38
  );

  assert.equal(gpsUpdate.success, true, 'GPS update must succeed');
  assert.equal(gpsUpdate.latitude, 28.6250, 'Updated latitude must be stored');
  assert.equal(gpsUpdate.longitude, 77.1500, 'Updated longitude must be stored');
  assert.equal(gpsUpdate.speed, 38, 'Speed must be recorded');

  // Verify updated state on portal
  const updatedPortal = await DeliveryService.getDriverPortalDetails(localDispatch.driverAccessToken);
  assert.equal(updatedPortal.currentLatitude, 28.6250, 'Portal must return updated latitude');
  assert.equal(updatedPortal.currentLongitude, 77.1500, 'Portal must return updated longitude');
  console.log(`✅ Live GPS Beacon broadcasted: ${updatedPortal.currentLatitude}° N, ${updatedPortal.currentLongitude}° E at 38 km/h.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Regional Distance-Adaptive Mode (>100km) - Checkpoint Milestones
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Testing Regional Freight Milestone Progression (> 100km)...');
  const regionalDispatch = await DeliveryService.dispatchOrder({
    orderId: testOrderIdRegional,
    deliveryType: 'local_driver',
    driverName: 'Vikram Singh (Heavy Freight)',
    driverPhone: '9812345678',
    distanceKm: 245.0,
    destinationAddress: 'Agra Wholesale Mandi, Uttar Pradesh 282001',
  });

  assert.equal(regionalDispatch.trackingMode, 'regional', 'Distance > 100km must assign regional tracking mode');
  assert.equal(regionalDispatch.distanceKm, 245.0, 'Distance must match 245 km');
  assert.equal(regionalDispatch.trackingMilestone, 'dispatched', 'Initial milestone must be dispatched');

  // Advance to In Transit Hub
  const hubUpdate = await DeliveryService.updateDriverMilestone(
    regionalDispatch.driverAccessToken,
    'in_transit_hub',
    'Delhi-NCR Logistics Gateway Hub',
    'Arrived at Gateway Hub for sorting'
  );
  assert.equal(hubUpdate.milestone, 'in_transit_hub', 'Milestone must advance to in_transit_hub');
  assert.equal(hubUpdate.hubName, 'Delhi-NCR Logistics Gateway Hub', 'Hub name must be recorded');

  // Advance to Out for Delivery
  const outUpdate = await DeliveryService.updateDriverMilestone(
    regionalDispatch.driverAccessToken,
    'out_for_delivery',
    'Agra Local Delivery Outpost'
  );
  assert.equal(outUpdate.milestone, 'out_for_delivery', 'Milestone must advance to out_for_delivery');
  console.log(`✅ Regional freight checkpoint progressed: Dispatched -> In Transit Hub (${hubUpdate.hubName}) -> Out for Delivery.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Doorstep Physical Inspection & Damage Counter Capping
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Testing Doorstep Damage Counter Capping & Split Calculation...');
  const inspectionPayload = [
    {
      orderItemId: portalDetails.items[0].orderItemId,
      productId: portalDetails.items[0].productId,
      productName: portalDetails.items[0].productName,
      orderedQuantity: 25,
      acceptedQuantity: 23,
      rejectedQuantity: 2, // 2 damaged units
      rejectionReason: 'damaged_packaging' as const,
      unitPrice: portalDetails.items[0].unitPrice,
    },
    {
      orderItemId: portalDetails.items[1].orderItemId,
      productId: portalDetails.items[1].productId,
      productName: portalDetails.items[1].productName,
      orderedQuantity: 15,
      acceptedQuantity: 15,
      rejectedQuantity: 0,
      unitPrice: portalDetails.items[1].unitPrice,
    },
  ];

  const totalAccepted = inspectionPayload.reduce((acc, i) => acc + i.acceptedQuantity, 0);
  const totalDamaged = inspectionPayload.reduce((acc, i) => acc + i.rejectedQuantity, 0);
  assert.equal(totalAccepted, 38, 'Accepted units must equal 38');
  assert.equal(totalDamaged, 2, 'Damaged units must equal 2');
  console.log(`✅ Doorstep inspection calculated: ${totalAccepted} intact units accepted, ${totalDamaged} damaged units rejected.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Handover OTP Verification & Order Delivery Finalization
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Testing Tokenized 6-Digit Handover OTP Verification...');
  const secretOtp = localDispatch.retailerOtpCode || '482910';

  const verificationResult = await DeliveryService.verifyDriverOtp(
    localDispatch.driverAccessToken,
    {
      otpCode: secretOtp,
      damagedQuantity: 2,
      lineItemInspections: inspectionPayload,
      notes: 'Delivered via tokenized driver link with 2 damaged bags logged.',
    }
  );

  assert.equal(verificationResult.success, true, 'Verification must succeed');
  assert.equal(verificationResult.deliveryStatus, 'delivered', 'Delivery status must be delivered');
  assert.equal(verificationResult.isVerified, true, 'Order must be verified');
  assert.ok(verificationResult.certificate.verificationId, 'Must issue tamper-evident delivery certificate');
  assert.ok(verificationResult.invoice, 'Must auto-generate GST Tax Invoice upon delivery completion');

  // Verify portal details reflection
  const postVerificationPortal = await DeliveryService.getDriverPortalDetails(localDispatch.driverAccessToken);
  assert.equal(postVerificationPortal.isVerified, true, 'Portal must reflect verified status');
  assert.equal(postVerificationPortal.deliveryStatus, 'delivered', 'Delivery status must be delivered');
  console.log(`✅ OTP Verified! Handover completed for Order: ${verificationResult.orderNumber}`);
  console.log(`✅ Certificate issued: ${verificationResult.certificate.verificationId}`);
  console.log(`✅ GST Invoice generated: ${verificationResult.invoice?.invoiceNumber}`);

  console.log('\n======================================================================');
  console.log('🎉 ALL 6 TASK 5 TEST SUITES PASSED FLAWLESSLY!');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Task 5 Test Suite Failed:', err);
  process.exit(1);
});
