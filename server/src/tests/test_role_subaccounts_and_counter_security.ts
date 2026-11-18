import assert from 'assert';
import { AuthService } from '../modules/auth/auth.service';
import { requireOwnerPin } from '../middleware/auth.middleware';

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 RUNNING TASK 4 TEST SUITE: ROLE-BASED SUB-ACCOUNTS & COUNTER SECURITY');
  console.log('======================================================================');

  const testRetailerId = 'demo-retailer-01';
  const testWholesalerId = 'demo-wholesaler-01';
  const pinRetailerId = 'ret-user-gupta-01'; // persisted user with seeded bcrypt owner PIN

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Master Owner PIN Verification Engine
  // -------------------------------------------------------------------------
  console.log('\n👉 [1/6] Testing Master Owner PIN Verification Engine (Default PIN: 1234)...');
  const validRes = await AuthService.verifyOwnerPin(pinRetailerId, '1234');
  assert.equal(validRes.verified, true, 'Default PIN 1234 must be verified successfully');
  assert.ok(validRes.unlockedUntil > Date.now(), 'unlockedUntil timestamp must be in the future');
  console.log(`✅ Default PIN verified. Unlock valid until: ${new Date(validRes.unlockedUntil).toLocaleTimeString()}.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Invalid PIN Rejection Guard
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Testing Unauthorized Access Interception with Incorrect PIN...');
  let caughtError: string | null = null;
  try {
    await AuthService.verifyOwnerPin(pinRetailerId, '9999');
  } catch (err: any) {
    caughtError = err.message;
  }
  assert.ok(caughtError !== null, 'Incorrect PIN must throw an error');
  assert.ok(caughtError.includes('Invalid 4-digit Master Owner PIN'), 'Must specify invalid PIN error message');
  console.log(`✅ Invalid PIN correctly intercepted: "${caughtError}".`);

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Owner PIN Update & Re-Authentication Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Testing Owner Master PIN Update and Re-Verification...');
  const updateRes = await AuthService.updateOwnerPin(pinRetailerId, '1234', '5678');
  assert.equal(updateRes.success, true, 'PIN update must succeed');

  const verifyNewPin = await AuthService.verifyOwnerPin(pinRetailerId, '5678');
  assert.equal(verifyNewPin.verified, true, 'New PIN 5678 must verify successfully');

  // Restore back to 1234 for demo continuity
  await AuthService.updateOwnerPin(pinRetailerId, '5678', '1234');
  console.log(`✅ Master PIN updated to 5678, verified, and restored to 1234.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Retailer Sub-Accounts (Cashier / Chhotu) Retrieval & Creation
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Testing Retailer Counter Sub-Accounts (Cashier Terminal)...');
  const retailerAccounts = await AuthService.getSubAccounts(testRetailerId, 'retailer');
  assert.ok(Array.isArray(retailerAccounts), 'Retailer accounts must be an array');
  assert.ok(retailerAccounts.some((a) => a.roleName === 'cashier'), 'Must include cashier sub-role');

  const newCashier = await AuthService.createSubAccount(testRetailerId, 'retailer', {
    fullName: 'Manoj Kumar (Night Cashier)',
    phoneNumber: '9876543299',
    roleName: 'cashier',
  });
  assert.equal(newCashier.roleName, 'cashier', 'New sub-account role must be cashier');
  console.log(`✅ Retailer cashier sub-account created: ${newCashier.fullName} (role: ${newCashier.roleName}).`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Wholesaler Sub-Accounts (Godown Manager & Field Agent)
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Testing Wholesaler Operational Sub-Accounts...');
  const wholesalerAccounts = await AuthService.getSubAccounts(testWholesalerId, 'wholesaler');
  assert.ok(Array.isArray(wholesalerAccounts), 'Wholesaler accounts must be an array');
  const hasGodownMgr = wholesalerAccounts.some((a) => a.roleName === 'godown_manager');
  const hasFieldAgent = wholesalerAccounts.some((a) => a.roleName === 'field_agent');
  assert.ok(hasGodownMgr, 'Must include godown_manager sub-role');
  assert.ok(hasFieldAgent, 'Must include field_agent sub-role');
  console.log(`✅ Wholesaler sub-roles active: Godown Manager & Field Agent identified.`);

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Counter Security Middleware (requireOwnerPin Guard)
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Testing Counter Security Middleware Enforcement...');
  
  // Case A: Cashier without PIN -> Blocked HTTP 403
  let blockedCode: string | null = null;
  const mockReqA: any = {
    headers: { 'x-sub-role': 'cashier' },
  };
  const mockResA: any = {
    status: (code: number) => ({
      json: (payload: any) => {
        blockedCode = payload.code;
      },
    }),
  };
  requireOwnerPin(mockReqA, mockResA, () => {
    assert.fail('Cashier without PIN should not reach next()');
  });
  assert.equal(blockedCode, 'PIN_REQUIRED', 'Cashier without PIN must be blocked with PIN_REQUIRED');
  console.log(`✅ Cashier without PIN blocked: status code=${blockedCode}`);

  // Case B: Cashier with valid PIN 1234 -> Granted access
  let reachedNextB = false;
  const mockReqB: any = {
    headers: { 'x-sub-role': 'cashier', 'x-owner-pin': '1234' },
    user: { userId: pinRetailerId },
  };
  const mockResB: any = {
    status: (code: number) => ({
      json: (payload: any) => {
        throw new Error(`Unexpected blocked response (${code}): ${payload.code}`);
      },
    }),
  };
  await requireOwnerPin(mockReqB, mockResB, () => {
    reachedNextB = true;
  });
  assert.equal(reachedNextB, true, 'Cashier with PIN 1234 must be granted access');
  console.log(`✅ Cashier with Master PIN granted access to protected trade endpoints.`);

  // Case C: Owner (Seth) -> Granted access without PIN
  let reachedNextC = false;
  const mockReqC: any = {
    headers: { 'x-sub-role': 'owner' },
  };
  const mockResC: any = {};
  await requireOwnerPin(mockReqC, mockResC, () => {
    reachedNextC = true;
  });
  assert.equal(reachedNextC, true, 'Store owner must be granted full access immediately');
  console.log(`✅ Store owner granted access without counter restriction.`);

  console.log('\n======================================================================');
  console.log('🎉 ALL 6 ROLE-BASED SUB-ACCOUNTS & COUNTER SECURITY TESTS PASSED EMPIRICALLY!');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
