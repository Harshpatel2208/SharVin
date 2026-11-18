import { prisma } from '../db';

const BASE_URL = 'http://127.0.0.1:5000';

async function runB2BDiscoveryVerification() {
  console.log('====================================================');
  console.log('STARTING B2B NETWORK DISCOVERY & CONNECTION TEST');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // 1. Retailer Auth (Gupta Kirana)
    // ----------------------------------------------------
    console.log('Step 1: Retailer Authentication (ret-user-gupta-01)...');
    const retLoginRes = await fetch(`${BASE_URL}/api/v1/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'ret-user-gupta-01' }),
    });
    const retLoginData = await retLoginRes.json();
    if (!retLoginRes.ok || !retLoginData.success) {
      throw new Error(`Retailer login failed: ${JSON.stringify(retLoginData)}`);
    }
    const retailerToken = retLoginData.data.token;
    const retHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${retailerToken}`,
    };
    console.log('✓ Retailer authenticated.\n');

    // Clean up any existing connection between Gupta Kirana and ws-user-metro-01 / ws-user-mega-01 for clean test run
    const testWholesalerId = 'ws-user-metro-01'; // Anil Verma - Metro Distributors
    await prisma.retailerWholesalerConnection.deleteMany({
      where: {
        retailerId: 'ret-user-gupta-01',
        wholesalerId: testWholesalerId,
      },
    });

    // ----------------------------------------------------
    // 2. Discover Wholesalers
    // ----------------------------------------------------
    console.log('Step 2: GET /api/v1/wholesalers/discover...');
    const discoverRes = await fetch(`${BASE_URL}/api/v1/wholesalers/discover`, {
      headers: retHeaders,
    });
    const discoverData = await discoverRes.json();
    console.log(`[HTTP GET] /discover Status: ${discoverRes.status}`);
    if (!discoverRes.ok || !discoverData.success) {
      throw new Error(`Discover failed: ${JSON.stringify(discoverData)}`);
    }

    const availableWholesalers = discoverData.data;
    console.log(`Discovered ${availableWholesalers.length} wholesaler(s):`);
    for (const w of availableWholesalers) {
      console.log(`  - ${w.businessName} (ID: ${w.id}, City: ${w.city}, GST: ${w.gstNumber})`);
    }

    const target = availableWholesalers.find((w: any) => w.id === testWholesalerId);
    if (!target) {
      throw new Error(`Expected ${testWholesalerId} to be available in discovery list!`);
    }
    console.log(`✓ Target wholesaler found in discovery: ${target.businessName}\n`);

    // ----------------------------------------------------
    // 3. Send Connection Request
    // ----------------------------------------------------
    console.log(`Step 3: POST /api/v1/wholesalers/connect/${testWholesalerId}...`);
    const connectRes = await fetch(`${BASE_URL}/api/v1/wholesalers/connect/${testWholesalerId}`, {
      method: 'POST',
      headers: retHeaders,
    });
    const connectData = await connectRes.json();
    console.log(`[HTTP POST] /connect Status: ${connectRes.status}`);
    if (!connectRes.ok || !connectData.success) {
      throw new Error(`Connect request failed: ${JSON.stringify(connectData)}`);
    }

    const connection = connectData.data;
    console.log('Connection record created:');
    console.log(`  - Connection ID: ${connection.id}`);
    console.log(`  - Status: ${connection.connectionStatus}`);
    console.log(`  - Retailer ID: ${connection.retailerId}`);
    console.log(`  - Wholesaler ID: ${connection.wholesalerId}`);

    if (connection.connectionStatus !== 'pending') {
      throw new Error(`Expected connectionStatus 'pending', got: ${connection.connectionStatus}`);
    }
    console.log('✓ Connection request created with pending status.\n');

    // ----------------------------------------------------
    // 4. Verify Exclusion from Discovery
    // ----------------------------------------------------
    console.log('Step 4: Verify target wholesaler is now excluded from /discover...');
    const discoverAfterRes = await fetch(`${BASE_URL}/api/v1/wholesalers/discover`, {
      headers: retHeaders,
    });
    const discoverAfterData = await discoverAfterRes.json();
    const stillPresent = discoverAfterData.data.some((w: any) => w.id === testWholesalerId);
    if (stillPresent) {
      throw new Error(`Target ${testWholesalerId} should no longer appear in discover list!`);
    }
    console.log('✓ Target wholesaler correctly excluded from subsequent discovery calls.\n');

    // ----------------------------------------------------
    // 5. Wholesaler Auth (Metro Distributors)
    // ----------------------------------------------------
    console.log(`Step 5: Wholesaler Authentication (${testWholesalerId})...`);
    const wsLoginRes = await fetch(`${BASE_URL}/api/v1/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: testWholesalerId }),
    });
    const wsLoginData = await wsLoginRes.json();
    if (!wsLoginRes.ok || !wsLoginData.success) {
      throw new Error(`Wholesaler login failed: ${JSON.stringify(wsLoginData)}`);
    }
    const wsToken = wsLoginData.data.token;
    const wsHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${wsToken}`,
    };
    console.log('✓ Wholesaler authenticated.\n');

    // ----------------------------------------------------
    // 6. Wholesaler Pending Requests Dashboard
    // ----------------------------------------------------
    console.log('Step 6: GET /api/v1/wholesalers/requests/pending...');
    const pendingRes = await fetch(`${BASE_URL}/api/v1/wholesalers/requests/pending`, {
      headers: wsHeaders,
    });
    const pendingData = await pendingRes.json();
    console.log(`[HTTP GET] /requests/pending Status: ${pendingRes.status}`);
    if (!pendingRes.ok || !pendingData.success) {
      throw new Error(`Pending requests fetch failed: ${JSON.stringify(pendingData)}`);
    }

    const pendingRequests = pendingData.data;
    console.log(`Found ${pendingRequests.length} pending request(s).`);
    const match = pendingRequests.find((r: any) => r.id === connection.id);
    if (!match) {
      throw new Error(`Connection request ${connection.id} not found in pending requests list!`);
    }
    console.log(`✓ Pending request verified: from ${match.retailer?.businessName} (${match.retailer?.fullName})\n`);

    // ----------------------------------------------------
    // 7. Wholesaler Accepts & Sets Terms
    // ----------------------------------------------------
    console.log(`Step 7: PATCH /api/v1/wholesalers/requests/${connection.id}...`);
    const acceptRes = await fetch(`${BASE_URL}/api/v1/wholesalers/requests/${connection.id}`, {
      method: 'PATCH',
      headers: wsHeaders,
      body: JSON.stringify({
        creditLimit: 50000,
        paymentTermDays: 30,
      }),
    });
    const acceptData = await acceptRes.json();
    console.log(`[HTTP PATCH] /requests/:id Status: ${acceptRes.status}`);
    if (!acceptRes.ok || !acceptData.success) {
      throw new Error(`Accept request failed: ${JSON.stringify(acceptData)}`);
    }

    const updatedConn = acceptData.data;
    console.log('Accepted Connection details:');
    console.log(`  - Connection ID: ${updatedConn.id}`);
    console.log(`  - New Status: ${updatedConn.connectionStatus}`);
    console.log(`  - Credit Limit: ₹${updatedConn.creditLimit}`);
    console.log(`  - Payment Terms: ${updatedConn.paymentTermDays} days`);

    if (updatedConn.connectionStatus !== 'active') {
      throw new Error(`Expected connectionStatus 'active', got: ${updatedConn.connectionStatus}`);
    }
    if (Number(updatedConn.creditLimit) !== 50000) {
      throw new Error(`Expected creditLimit 50000, got: ${updatedConn.creditLimit}`);
    }
    if (updatedConn.paymentTermDays !== 30) {
      throw new Error(`Expected paymentTermDays 30, got: ${updatedConn.paymentTermDays}`);
    }
    console.log('✓ Request accepted with credit limit ₹50,000 and 30-day payment terms.\n');

    // ----------------------------------------------------
    // 8. Verify No Longer in Pending
    // ----------------------------------------------------
    console.log('Step 8: Verify request is cleared from /requests/pending...');
    const pendingAfterRes = await fetch(`${BASE_URL}/api/v1/wholesalers/requests/pending`, {
      headers: wsHeaders,
    });
    const pendingAfterData = await pendingAfterRes.json();
    const stillInPending = pendingAfterData.data.some((r: any) => r.id === connection.id);
    if (stillInPending) {
      throw new Error('Accepted connection should no longer appear in pending requests!');
    }
    console.log('✓ Pending requests list cleanly updated.\n');

    console.log('====================================================');
    console.log('🎉 ALL B2B NETWORK DISCOVERY & CONNECTION TESTS PASSED!');
    console.log('====================================================');
  } finally {
    await prisma.$disconnect();
  }
}

runB2BDiscoveryVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exit(1);
  });

