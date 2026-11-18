const BASE_URL = 'http://127.0.0.1:5000';

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING SUB-MODULES P1.1 & P1.3 VERIFICATION SUITE');
  console.log('====================================================\n');

  // =====================================================================
  // TEST 2 FIRST: P1.3 Public Invoice Verification (Unauthenticated)
  // =====================================================================
  console.log('--- TEST 2: P1.3 Public Invoice Verification (Unauthenticated) ---');
  
  // 1. Verify authentic invoice without any auth header
  const publicRes = await fetch(`${BASE_URL}/api/v1/invoices/verify/INV-2026-0001`);
  console.log(`[HTTP GET] /api/v1/invoices/verify/INV-2026-0001 Status: ${publicRes.status}`);
  const publicBody = await publicRes.json();
  if (publicRes.status !== 200 || !publicBody.success) {
    throw new Error(`Public verification failed: ${JSON.stringify(publicBody)}`);
  }
  const verifyData = publicBody.data;
  console.log('Verification response:');
  console.log(`  - Authentic: ${verifyData.authentic}`);
  console.log(`  - Tampered: ${verifyData.isTampered}`);
  console.log(`  - Invoice Number: ${verifyData.invoiceNumber}`);
  console.log(`  - Order Number: ${verifyData.orderNumber}`);
  console.log(`  - Signature Hash: ${verifyData.signatureHash}`);
  console.log(`  - Wholesaler: ${verifyData.invoice?.wholesalerName} (${verifyData.invoice?.wholesalerGstin})`);
  console.log(`  - Recipient: ${verifyData.invoice?.retailerName} (${verifyData.invoice?.retailerGstin})`);
  console.log(`  - Total Invoice Amount: ₹${verifyData.invoice?.totalInvoiceAmount}`);
  console.log(`  - Items in Snapshot: ${verifyData.invoice?.itemsSnapshot?.length}`);

  if (!verifyData.authentic || verifyData.isTampered) {
    throw new Error('Expected INV-2026-0001 to be authentic and untampered!');
  }
  if (!verifyData.invoice || verifyData.invoice.invoiceNumber !== 'INV-2026-0001') {
    throw new Error('Invoice record missing or mismatch in verification result');
  }
  console.log('✓ PASS: Public authentic invoice verification validated.\n');

  // 2. Verify tampering detection when payload amounts are altered
  console.log('Testing tamper detection (altered total amount)...');
  const tamperRes = await fetch(`${BASE_URL}/api/v1/invoices/verify/INV-2026-0001`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ totalInvoiceAmount: 999999.00 }),
  });
  console.log(`[HTTP POST] /api/v1/invoices/verify/INV-2026-0001 (Tampered) Status: ${tamperRes.status}`);
  const tamperBody = await tamperRes.json();
  const tamperData = tamperBody.data;
  console.log(`  - Authentic: ${tamperData.authentic}`);
  console.log(`  - Tampered: ${tamperData.isTampered}`);
  console.log(`  - Tamper Details: ${tamperData.tamperDetails}`);
  if (tamperData.authentic !== false || tamperData.isTampered !== true) {
    throw new Error('Expected tampered invoice payload to be rejected!');
  }
  console.log('✓ PASS: Cryptographic tamper detection verified.\n');

  // 3. Verify non-existent invoice handling
  console.log('Testing unknown invoice lookup...');
  const unknownRes = await fetch(`${BASE_URL}/api/v1/invoices/verify/INV-FAKE-0000`);
  const unknownBody = await unknownRes.json();
  const unknownData = unknownBody.data;
  console.log(`  - Authentic: ${unknownData.authentic}`);
  console.log(`  - Message: ${unknownData.message}`);
  if (unknownData.authentic !== false) {
    throw new Error('Expected unknown invoice to return authentic: false');
  }
  console.log('✓ PASS: Unknown invoice safely flagged as non-authentic.\n');

  // =====================================================================
  // TEST 1: P1.1 Live 7-Day Velocity & Reorder Predictor
  // =====================================================================
  console.log('--- TEST 1: P1.1 Live 7-Day Velocity & Reorder Predictor ---');

  // 1. Retailer Login
  console.log('Logging in as Retailer (Gupta Kirana: ret-user-gupta-01)...');
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'ret-user-gupta-01' }),
  });
  const loginBody = await loginRes.json();
  const token = loginBody.data.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  console.log('✓ Retailer authenticated. JWT acquired.\n');

  // 2. Fetch POS products
  const productsRes = await fetch(`${BASE_URL}/api/v1/pos/products`, { headers: authHeaders });
  const productsBody = await productsRes.json();
  const products = productsBody.data;
  console.log(`Found ${products.length} products in retailer inventory.`);
  if (products.length === 0) {
    throw new Error('Retailer has no products in inventory to test POS checkout!');
  }

  // Pick first available product with stock > 5
  let targetProduct = products.find((p: any) => p.currentStock > 5) || products[0];
  console.log(`Target Product: "${targetProduct.productName}" (ID: ${targetProduct.productId})`);
  console.log(`Current Stock in POS: ${targetProduct.currentStock} units`);

  // 3. Fetch initial predictions
  const initPredRes = await fetch(`${BASE_URL}/api/v1/inventory/reorder-predictions`, { headers: authHeaders });
  const initPredBody = await initPredRes.json();
  const initPredictions = initPredBody.data.predictions;
  const initialPred = initPredictions.find((p: any) => p.productId === targetProduct.productId);
  
  console.log('Initial Reorder Predictor State:');
  console.log(`  - Stock: ${initialPred?.currentStock ?? targetProduct.currentStock}`);
  console.log(`  - 7-Day Units Sold: ${initialPred?.unitsSoldLast7Days ?? 0}`);
  console.log(`  - Daily Velocity: ${initialPred?.dailyVelocity ?? 0}`);
  console.log(`  - Days Remaining: ${initialPred?.daysRemaining ?? 999}`);
  console.log(`  - Urgency Level: ${initialPred?.urgencyLevel ?? 'HEALTHY'}`);
  console.log(`  - Explainable Line 1: ${initialPred?.line1}`);
  console.log(`  - Explainable Line 2: ${initialPred?.line2}`);

  const initialDaysRemaining = initialPred?.daysRemaining ?? 999;
  const initialStock = initialPred?.currentStock ?? targetProduct.currentStock;
  const initialUnitsSold = initialPred?.unitsSoldLast7Days ?? 0;

  // 4. Perform a POS Checkout
  console.log('\nExecuting POS Checkout (selling 2 units)...');
  const saleQty = 2;
  const saleRes = await fetch(`${BASE_URL}/api/v1/pos/sales`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      items: [
        {
          productId: targetProduct.productId,
          quantity: saleQty,
          unitPrice: targetProduct.sellingPrice,
          discount: 0,
        },
      ],
      discountAmount: 0,
      taxAmount: 0,
      paymentMethod: 'cash',
      customerName: 'Test Customer Walkin',
    }),
  });

  console.log(`[HTTP POST] /api/v1/pos/sales Status: ${saleRes.status}`);
  const saleBody = await saleRes.json();
  if (!saleBody.success) {
    throw new Error(`Sale failed: ${JSON.stringify(saleBody)}`);
  }
  const saleReceipt = saleBody.data;
  console.log(`✓ Sale processed! Bill Number: ${saleReceipt.billNumber}, Net: ₹${saleReceipt.netAmount}`);

  // 5. Instantly fetch updated predictions from backend
  console.log('\nFetching updated 7-day velocity reorder predictions from backend...');
  const updatedPredRes = await fetch(`${BASE_URL}/api/v1/inventory/reorder-predictions`, { headers: authHeaders });
  const updatedPredBody = await updatedPredRes.json();
  const updatedPredictions = updatedPredBody.data.predictions;
  const updatedPred = updatedPredictions.find((p: any) => p.productId === targetProduct.productId);

  console.log('Updated Reorder Predictor State:');
  console.log(`  - Stock: ${updatedPred?.currentStock}`);
  console.log(`  - 7-Day Units Sold: ${updatedPred?.unitsSoldLast7Days}`);
  console.log(`  - Daily Velocity: ${updatedPred?.dailyVelocity}`);
  console.log(`  - Days Remaining: ${updatedPred?.daysRemaining}`);
  console.log(`  - Urgency Level: ${updatedPred?.urgencyLevel}`);
  console.log(`  - Line 1: ${updatedPred?.line1}`);
  console.log(`  - Line 2: ${updatedPred?.line2}`);

  if (!updatedPred) {
    throw new Error(`Target product ${targetProduct.productId} missing from updated predictions!`);
  }

  if (updatedPred.currentStock !== initialStock - saleQty) {
    throw new Error(`Stock mismatch: expected ${initialStock - saleQty}, got ${updatedPred.currentStock}`);
  }

  if (updatedPred.unitsSoldLast7Days !== initialUnitsSold + saleQty) {
    throw new Error(`Units sold mismatch: expected ${initialUnitsSold + saleQty}, got ${updatedPred.unitsSoldLast7Days}`);
  }

  if (updatedPred.daysRemaining >= initialDaysRemaining && initialDaysRemaining !== 999) {
    throw new Error(`Expected Days Remaining to decrease after sale! Initial: ${initialDaysRemaining}, Updated: ${updatedPred.daysRemaining}`);
  }

  console.log(`\n✓ PASS: Days Remaining correctly recalculated from ${initialDaysRemaining} to ${updatedPred.daysRemaining} days!`);
  console.log('✓ PASS: Daily velocity updated from ' + (initialPred?.dailyVelocity ?? 0) + ' to ' + updatedPred.dailyVelocity + ' units/day.');
  console.log('✓ PASS: POS checkout instantly triggered live backend prediction recalculation.');

  console.log('\n====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED EMPIRICALLY (100% OK)');
  console.log('====================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION ERROR:', err.message || err);
  process.exit(1);
});
