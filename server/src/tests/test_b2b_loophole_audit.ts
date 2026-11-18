import { ChatService } from '../modules/chat/chat.service';
import { DeliveryService } from '../modules/delivery/delivery.service';
import { LedgerService } from '../modules/ledger/ledger.service';
import { createDeliverableOrder } from './order-fixture';
import prisma from '../db';

/**
 * COMPREHENSIVE B2B BUSINESS LOGIC & LOOPHOLE AUDIT TEST SUITE
 * Covers the 8 Critical B2B Edge Cases across the entire transaction lifecycle.
 */
async function runLoopholeAuditSuite() {
  console.log('======================================================================');
  console.log('   SHARVIN B2B PLATFORM: BUSINESS LOGIC & LOOPHOLE AUDIT SUITE        ');
  console.log('   Automated Verification of 8 Critical B2B Vulnerabilities           ');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 8;
  const results: Array<{
    caseNum: number;
    title: string;
    risk: 'HIGH' | 'MEDIUM' | 'LOW';
    rule: string;
    status: 'PASSED' | 'FAILED';
    details: string;
  }> = [];

  const retailerUser = {
    userId: 'ret-user-gupta-01',
    userType: 'retailer' as const,
    userName: 'Gupta Kirana Store',
  };

  const wholesalerUser = {
    userId: 'ws-user-kailash-01',
    userType: 'wholesaler' as const,
    userName: 'Kailash Grains & Pulses',
  };

  // -------------------------------------------------------------------------
  // EDGE CASE 1: Race Condition / Concurrent Edits (Optimistic Locking)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 1] Testing Race Condition & Concurrent Edits Collision...');
    const testOrderId = `audit-ord-race-${Date.now()}`;

    // 1. Initial proposal establishes version = 1
    const initialProp = await ChatService.proposeRate({
      orderId: testOrderId,
      ...retailerUser,
      clientVersion: 1,
      items: [{ orderItemId: 'item-01', proposedUnitPrice: 405.00, reason: 'Initial bulk rate offer' }],
    });

    console.log(`  -> Initial offer established server version: ${initialProp.version}`);

    // 2. Retailer updates proposal, advancing server version to 2
    const retailerUpdate = await ChatService.proposeRate({
      orderId: testOrderId,
      ...retailerUser,
      clientVersion: initialProp.version,
      items: [{ orderItemId: 'item-01', proposedUnitPrice: 400.00, reason: 'Retailer revised counter' }],
    });
    console.log(`  -> Retailer update advanced server version to: ${retailerUpdate.version}`);

    // 3. Wholesaler attempts to edit concurrently with stale version (1 instead of 2)
    let optimisticLockRejected = false;
    try {
      await ChatService.proposeRate({
        orderId: testOrderId,
        ...wholesalerUser,
        clientVersion: 1, // Stale version!
        items: [{ orderItemId: 'item-01', proposedUnitPrice: 410.00, reason: 'Concurrent wholesaler counter' }],
      });
    } catch (err: any) {
      if (err.message.includes('OptimisticLockError')) {
        optimisticLockRejected = true;
        console.log(`  -> [BLOCKED] Stale concurrent edit rejected: "${err.message}"`);
      }
    }

    if (!optimisticLockRejected) {
      throw new Error('FAILED: Concurrent edit with stale version was NOT rejected by optimistic lock check!');
    }

    passedTests++;
    results.push({
      caseNum: 1,
      title: 'Race Condition / Concurrent Edits',
      risk: 'HIGH',
      rule: 'Bilateral State Machine checks clientVersion vs state.version; rejects stale edits with OptimisticLockError',
      status: 'PASSED',
      details: 'Rejected conflicting edit with stale version (client=1, server=2)',
    });
    console.log('  -> CASE 1 PASSED: Optimistic lock collision enforcement verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 1 FAILED:', err.message, '\n');
    results.push({
      caseNum: 1,
      title: 'Race Condition / Concurrent Edits',
      risk: 'HIGH',
      rule: 'Optimistic Locking Version Verification',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 2: Stock Reservation Depletion (Godown Stock Exhaustion)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 2] Testing Stock Reservation Depletion & Exhaustion Flag...');
    const testOrderId = `ord-depleted-stock-test`;

    // 1. Propose rate on order where godownStock is 8 but requested quantity is 40
    const proposal = await ChatService.proposeRate({
      orderId: testOrderId,
      ...retailerUser,
      items: [{ orderItemId: 'item-dep-01', proposedUnitPrice: 600.00, proposedQuantity: 40, reason: 'Bargaining' }],
    });

    console.log(`  -> Proposal processed: stockExhausted=${proposal.stockExhausted}, stockWarning="${proposal.stockWarning}"`);

    if (!proposal.stockExhausted) {
      throw new Error('FAILED: Proposal did not flag stockExhausted when requested quantity exceeded godown stock!');
    }

    // 2. Wholesaler attempts to Accept Offer on depleted stock
    let acceptBlocked = false;
    try {
      await ChatService.confirmRate({
        orderId: testOrderId,
        ...wholesalerUser,
      });
    } catch (err: any) {
      if (err.message.includes('StockExhaustedError')) {
        acceptBlocked = true;
        console.log(`  -> [BLOCKED] Accept Offer prevented on depleted stock: "${err.message}"`);
      }
    }

    if (!acceptBlocked) {
      throw new Error('FAILED: confirmRate did NOT block acceptance on depleted godown stock!');
    }

    passedTests++;
    results.push({
      caseNum: 2,
      title: 'Stock Reservation Depletion',
      risk: 'HIGH',
      rule: 'Blocks confirmRate with StockExhaustedError when godownStock < requestedQuantity; flags UI warning',
      status: 'PASSED',
      details: 'Flagged stockExhausted=true (stock=8 < qty=40) and blocked deal confirmation',
    });
    console.log('  -> CASE 2 PASSED: Godown stock exhaustion guard verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 2 FAILED:', err.message, '\n');
    results.push({
      caseNum: 2,
      title: 'Stock Reservation Depletion',
      risk: 'HIGH',
      rule: 'Godown Stock Depletion Precondition',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 3: Invalid Price Boundaries (Negative, Zero, & Margin Floor)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 3] Testing Invalid Price Boundaries & Wholesaler Margin Floor...');
    const testOrderId = `audit-ord-price-${Date.now()}`;

    // 3A. Zero / Negative Price
    let zeroPriceBlocked = false;
    try {
      await ChatService.proposeRate({
        orderId: testOrderId,
        ...retailerUser,
        items: [{ orderItemId: 'item-01', proposedUnitPrice: -50.00, reason: 'Exploit test' }],
      });
    } catch (err: any) {
      if (err.message.includes('InvalidPriceError') || err.message.includes('strictly greater than zero')) {
        zeroPriceBlocked = true;
        console.log(`  -> [BLOCKED] Negative rate rejected: "${err.message}"`);
      }
    }

    // 3B. Below Margin Floor (Atta margin floor is ₹380.00; propose ₹350.00)
    let marginFloorBlocked = false;
    try {
      await ChatService.proposeRate({
        orderId: testOrderId,
        ...retailerUser,
        items: [{ orderItemId: 'item-01', proposedUnitPrice: 350.00, reason: 'Predatory rate attempt' }],
      });
    } catch (err: any) {
      if (err.message.includes('MarginFloorBreachError') || err.message.includes('breaches the wholesaler margin floor')) {
        marginFloorBlocked = true;
        console.log(`  -> [BLOCKED] Below margin floor rejected: "${err.message}"`);
      }
    }

    if (!zeroPriceBlocked || !marginFloorBlocked) {
      throw new Error(`FAILED: Price boundary validation failed! (zero=${zeroPriceBlocked}, marginFloor=${marginFloorBlocked})`);
    }

    passedTests++;
    results.push({
      caseNum: 3,
      title: 'Invalid Price Boundaries',
      risk: 'HIGH',
      rule: 'Enforce rate > 0 and rate >= marginFloor (₹380.00) before admitting proposals to state machine',
      status: 'PASSED',
      details: 'Rejected negative rate (-₹50.00) and below-floor rate (₹350.00 < ₹380.00)',
    });
    console.log('  -> CASE 3 PASSED: Price boundary guardrails verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 3 FAILED:', err.message, '\n');
    results.push({
      caseNum: 3,
      title: 'Invalid Price Boundaries',
      risk: 'HIGH',
      rule: 'Rate Boundary & Margin Floor Validation',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 4: Delivery Handover OTP Brute-Force (3 Attempts & 10-Min Lockout)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 4] Testing Delivery Handover OTP Brute-Force Capping & Lockout...');
    const testOrderId = `audit-ord-otp-${Date.now()}`;

    // Dispatch requires a persisted order row (P1 strictness).
    await createDeliverableOrder(testOrderId, `AUDIT-OTP-${Date.now()}`);

    // Dispatch order
    const dispatch = await DeliveryService.dispatchOrder({ orderId: testOrderId }, wholesalerUser.userId, wholesalerUser.userType);
    console.log(`  -> Order dispatched: ${dispatch.orderNumber}, OTP Salt: active`);

    // Attempt 1: Wrong OTP
    try {
      await DeliveryService.verifyHandover({ orderId: testOrderId, otpCode: '111111' }, wholesalerUser.userId, wholesalerUser.userType);
    } catch (e: any) {
      console.log(`  -> Attempt 1 failed: "${e.message}"`);
    }

    // Attempt 2: Wrong OTP
    try {
      await DeliveryService.verifyHandover({ orderId: testOrderId, otpCode: '222222' }, wholesalerUser.userId, wholesalerUser.userType);
    } catch (e: any) {
      console.log(`  -> Attempt 2 failed: "${e.message}"`);
    }

    // Attempt 3: Wrong OTP (Should trigger 10-min lockout)
    let lockoutTriggered = false;
    try {
      await DeliveryService.verifyHandover({ orderId: testOrderId, otpCode: '333333' }, wholesalerUser.userId, wholesalerUser.userType);
    } catch (e: any) {
      if (e.message.includes('10 minutes') || e.message.includes('Security Lockout Triggered')) {
        lockoutTriggered = true;
        console.log(`  -> [LOCKOUT TRIGGERED] Attempt 3 reached max attempts: "${e.message}"`);
      }
    }

    // Attempt 4: Even with correct OTP, entry MUST be rejected due to active lockout
    let entryBlockedDuringLockout = false;
    try {
      await DeliveryService.verifyHandover({ orderId: testOrderId, otpCode: dispatch.retailerOtpCode! }, wholesalerUser.userId, wholesalerUser.userType);
    } catch (e: any) {
      if (e.message.includes('Security Lockout Active') || e.message.includes('locked for 10 minutes')) {
        entryBlockedDuringLockout = true;
        console.log(`  -> [BLOCKED] Correct OTP rejected during 10-min lockout: "${e.message}"`);
      }
    }

    // Verify delivery status reports isLocked=true
    const status = await DeliveryService.getDeliveryStatus(testOrderId, wholesalerUser.userId, wholesalerUser.userType);
    console.log(`  -> Status report: isLocked=${status.isLocked}, remainingMinutes=${status.lockoutMinutesRemaining}`);

    if (!lockoutTriggered || !entryBlockedDuringLockout || !status.isLocked) {
      throw new Error(`FAILED: Brute force lockout was not enforced! (lockout=${lockoutTriggered}, blocked=${entryBlockedDuringLockout}, statusLocked=${status.isLocked})`);
    }

    passedTests++;
    results.push({
      caseNum: 4,
      title: 'Delivery Handover OTP Brute-Force',
      risk: 'HIGH',
      rule: 'Max 3 failed OTP attempts triggers 10-minute security lockout; blocks all attempts until expiry',
      status: 'PASSED',
      details: 'Locked driver verification for 10 minutes after 3 invalid attempts',
    });
    console.log('  -> CASE 4 PASSED: OTP brute-force protection verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 4 FAILED:', err.message, '\n');
    results.push({
      caseNum: 4,
      title: 'Delivery Handover OTP Brute-Force',
      risk: 'HIGH',
      rule: '3-Attempt Threshold & 10-Minute Lockout Window',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 5: Driver Confirmation Bypass (Cryptographic 6-Digit OTP Enforcement)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 5] Testing Driver Confirmation Bypass Rejection...');
    const testOrderId = `audit-ord-bypass-${Date.now()}`;
    await createDeliverableOrder(testOrderId, `AUDIT-BYPASS-${Date.now()}`);
    await DeliveryService.dispatchOrder({ orderId: testOrderId }, wholesalerUser.userId, wholesalerUser.userType);

    // 5A: Missing OTP code
    let emptyOtpBlocked = false;
    try {
      await DeliveryService.verifyHandover({ orderId: testOrderId, otpCode: '' }, wholesalerUser.userId, wholesalerUser.userType);
    } catch (e: any) {
      if (e.message.includes('Cryptographic bypass rejected') || e.message.includes('valid 6-digit')) {
        emptyOtpBlocked = true;
        console.log(`  -> [BLOCKED] Empty OTP bypass attempt: "${e.message}"`);
      }
    }

    // 5B: Short / Malformed alphanumeric OTP code
    let malformedOtpBlocked = false;
    try {
      await DeliveryService.verifyHandover({ orderId: testOrderId, otpCode: 'abc12' }, wholesalerUser.userId, wholesalerUser.userType);
    } catch (e: any) {
      if (e.message.includes('Cryptographic bypass rejected') || e.message.includes('valid 6-digit')) {
        malformedOtpBlocked = true;
        console.log(`  -> [BLOCKED] Alphanumeric malformed OTP bypass attempt: "${e.message}"`);
      }
    }

    if (!emptyOtpBlocked || !malformedOtpBlocked) {
      throw new Error(`FAILED: Driver confirmation bypass check failed! (empty=${emptyOtpBlocked}, malformed=${malformedOtpBlocked})`);
    }

    passedTests++;
    results.push({
      caseNum: 5,
      title: 'Driver Confirmation Bypass',
      risk: 'HIGH',
      rule: 'Strict regex ^\\d{6}$ validation and SHA-256 cryptographic match required; bypass rejected',
      status: 'PASSED',
      details: 'Blocked dispatch completion without valid retailer 6-digit numeric OTP',
    });
    console.log('  -> CASE 5 PASSED: Driver confirmation cryptographic bypass blocked.\n');
  } catch (err: any) {
    console.error('  -> CASE 5 FAILED:', err.message, '\n');
    results.push({
      caseNum: 5,
      title: 'Driver Confirmation Bypass',
      risk: 'HIGH',
      rule: '6-Digit Numeric Cryptographic OTP Requirement',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 6: Damage Logging Overflow (Damaged Qty > Delivered Qty)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 6] Testing Damage Logging Overflow Boundary Check...');
    const testOrderId = `audit-ord-dmg-${Date.now()}`;
    await createDeliverableOrder(testOrderId, `AUDIT-DMG-${Date.now()}`);
    const dispatch = await DeliveryService.dispatchOrder({ orderId: testOrderId }, wholesalerUser.userId, wholesalerUser.userType);

    // Total delivered units = 70 (25 + 15 + 30). Enter damaged quantity = 71 (> 70)
    let overflowBlocked = false;
    try {
      await DeliveryService.verifyHandover(
        {
          orderId: testOrderId,
          otpCode: dispatch.retailerOtpCode!,
          damagedQuantity: 71, // Overflow!
          notes: 'Excess damage test',
        },
        wholesalerUser.userId,
        wholesalerUser.userType
      );
    } catch (e: any) {
      if (e.message.includes('Damage logging overflow') || e.message.includes('cannot exceed total delivered quantity')) {
        overflowBlocked = true;
        console.log(`  -> [BLOCKED] Damage logging overflow rejected: "${e.message}"`);
      }
    }

    // Also verify negative damaged units
    let negativeDamageBlocked = false;
    try {
      await DeliveryService.verifyHandover(
        {
          orderId: testOrderId,
          otpCode: dispatch.retailerOtpCode!,
          damagedQuantity: -5,
        },
        wholesalerUser.userId,
        wholesalerUser.userType
      );
    } catch (e: any) {
      if (e.message.includes('cannot be negative')) {
        negativeDamageBlocked = true;
        console.log(`  -> [BLOCKED] Negative damaged units rejected: "${e.message}"`);
      }
    }

    if (!overflowBlocked || !negativeDamageBlocked) {
      throw new Error(`FAILED: Damage logging overflow boundary check failed! (overflow=${overflowBlocked}, negative=${negativeDamageBlocked})`);
    }

    passedTests++;
    results.push({
      caseNum: 6,
      title: 'Damage Logging Overflow',
      risk: 'MEDIUM',
      rule: 'Enforce 0 <= damagedQuantity <= totalDeliveredQuantity (70 units); overflow rejected',
      status: 'PASSED',
      details: 'Rejected damaged quantity = 71 units (total delivered = 70 units) and negative quantity',
    });
    console.log('  -> CASE 6 PASSED: Damage logging overflow prevention verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 6 FAILED:', err.message, '\n');
    results.push({
      caseNum: 6,
      title: 'Damage Logging Overflow',
      risk: 'MEDIUM',
      rule: 'Damaged Quantity Boundary Validation',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 7: Khata Ledger Rollback on Cancellation (In-Transit Reversal)
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 7] Testing Khata Ledger Automatic Rollback on Order Cancellation...');
    const testPartnerId = 'ret-user-gupta-01';

    // Ledger transactions require a real Order row (FK integrity). Use the seeded
    // demo trade pair and create a dedicated audit order.
    const retailer = await prisma.user.findUnique({ where: { id: 'ret-user-gupta-01' } });
    const wholesaler = await prisma.user.findUnique({ where: { id: 'ws-user-kailash-01' } });
    if (!retailer || !wholesaler) {
      throw new Error('Demo seed users missing. Run `npm run prisma:seed` before this suite.');
    }
    const connection = await prisma.retailerWholesalerConnection.findFirst({
      where: { retailerId: retailer.id, wholesalerId: wholesaler.id },
    });
    if (!connection) {
      throw new Error('Demo trade connection missing. Run `npm run prisma:seed` before this suite.');
    }
    const auditOrder = await prisma.order.create({
      data: {
        retailerId: retailer.id,
        wholesalerId: wholesaler.id,
        connectionId: connection.id,
        orderNumber: `AUDIT-${Date.now()}`,
        orderStatus: 'delivered',
      },
    });
    const testOrderId = auditOrder.id;

    // 1. Post initial order debit of ₹16,600.00
    const postResult = await LedgerService.postDeliveredOrderToLedger(
      testOrderId,
      'Dispatched order debit',
      testPartnerId
    );
    console.log(`  -> Order posted to ledger. Balance before rollback: ₹${postResult.currentBalance.toLocaleString('en-IN')}`);

    // 2. Order is rejected/cancelled at counter. Execute rollback
    const rollbackResult = await LedgerService.rollbackCancelledOrder(
      {
        orderId: testOrderId,
        partnerId: testPartnerId,
        reason: 'Retailer rejected shipment at doorstep due to truck transit delay',
        amount: 16600.00,
      },
      wholesalerUser.userId,
      wholesalerUser.userType
    );

    console.log(`  -> Rollback executed: reversedAmount=₹${rollbackResult.reversedAmount}, previousBalance=₹${rollbackResult.previousBalance}, newBalance=₹${rollbackResult.newBalance}`);

    if (rollbackResult.newBalance !== rollbackResult.previousBalance - rollbackResult.reversedAmount) {
      throw new Error(`FAILED: Ledger new balance does not equal previous balance minus reversed amount!`);
    }

    passedTests++;
    results.push({
      caseNum: 7,
      title: 'Khata Ledger Rollback on Cancellation',
      risk: 'HIGH',
      rule: 'Automatically reverse ledger debits, decrease balance, and record adjustment transaction on transit cancellation',
      status: 'PASSED',
      details: 'Reversed ₹16,600.00 debit and restored customer running balance',
    });
    console.log('  -> CASE 7 PASSED: Khata ledger cancellation rollback verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 7 FAILED:', err.message, '\n');
    results.push({
      caseNum: 7,
      title: 'Khata Ledger Rollback on Cancellation',
      risk: 'HIGH',
      rule: 'Ledger Rollback & Credit Balance Reversal',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // EDGE CASE 8: MOQ (Minimum Order Quantity) Breach on Quantity Adjustment
  // -------------------------------------------------------------------------
  try {
    console.log('[AUDIT CASE 8] Testing MOQ (Minimum Order Quantity) Breach on Negotiation...');
    const testOrderId = `audit-ord-moq-${Date.now()}`;

    // Item MOQ is 10 bags. Retailer attempts to bargain down to 4 bags (< 10)
    let moqBreachBlocked = false;
    try {
      await ChatService.proposeRate({
        orderId: testOrderId,
        ...retailerUser,
        items: [
          {
            orderItemId: 'item-01',
            proposedUnitPrice: 400.00,
            proposedQuantity: 4, // Below MOQ of 10!
            reason: 'Quantity adjustment',
          },
        ],
      });
    } catch (e: any) {
      if (e.message.includes('MOQ') || e.message.includes('Minimum Order Quantity tier of 10')) {
        moqBreachBlocked = true;
        console.log(`  -> [BLOCKED] MOQ violation rejected: "${e.message}"`);
      }
    }

    if (!moqBreachBlocked) {
      throw new Error('FAILED: Quantity proposal violating supplier MOQ tier was NOT rejected!');
    }

    passedTests++;
    results.push({
      caseNum: 8,
      title: 'MOQ (Minimum Order Quantity) Breach',
      risk: 'MEDIUM',
      rule: 'Enforce proposedQuantity >= supplier MOQ (10 bags); reject proposals below wholesale tier threshold',
      status: 'PASSED',
      details: 'Rejected proposed quantity = 4 bags (supplier minimum tier = 10 bags)',
    });
    console.log('  -> CASE 8 PASSED: MOQ tier enforcement verified.\n');
  } catch (err: any) {
    console.error('  -> CASE 8 FAILED:', err.message, '\n');
    results.push({
      caseNum: 8,
      title: 'MOQ (Minimum Order Quantity) Breach',
      risk: 'MEDIUM',
      rule: 'Wholesale Tier MOQ Enforcement',
      status: 'FAILED',
      details: err.message,
    });
  }

  // -------------------------------------------------------------------------
  // FINAL REPORT & SUMMARY
  // -------------------------------------------------------------------------
  console.log('======================================================================');
  console.log(` AUDIT SUITE EXECUTION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================================\n');

  console.table(
    results.map((r) => ({
      '#': r.caseNum,
      'Loophole / Edge Case': r.title,
      Risk: r.risk,
      'State Machine Rule': r.rule,
      Status: r.status,
    }))
  );

  if (passedTests !== totalTests) {
    console.error(`Audit suite finished with ${totalTests - passedTests} failures.`);
    process.exit(1);
  } else {
    console.log('🎉 ALL 8 B2B BUSINESS LOGIC & LOOPHOLE TEST CASES SUCCESSFULLY AUDITED AND VERIFIED!');
  }
}

// Execute test suite
runLoopholeAuditSuite().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
