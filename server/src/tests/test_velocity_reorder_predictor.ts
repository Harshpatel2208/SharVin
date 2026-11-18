import assert from 'node:assert/strict';
import { InventoryService } from '../modules/inventory/inventory.service';

async function runVelocityReorderPredictorTests() {
  console.log('======================================================================');
  console.log('🧪 TESTING PHASE 3, TASK 7: 7-DAY VELOCITY AI REORDER PREDICTOR');
  console.log('======================================================================');

  const retailerId = `ret-velocity-test-${Date.now()}`;
  const targetProductId = 'prod-002'; // Aashirvaad Superior MP Sharbati Atta (5kg)

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Configure Simulation (14 Units Sold Over 7 Days, 3 in Stock)
  // -------------------------------------------------------------------------
  console.log('\n👉 [1/6] Simulating Mock POS Sales: 14 units sold over 7 days, 3 in stock...');
  const simResult = InventoryService.simulateVelocity(retailerId, {
    productId: targetProductId,
    unitsSoldLast7Days: 14,
    currentStock: 3,
  });

  assert.equal(simResult.success, true, 'Simulation setup must succeed');
  assert.equal(simResult.simulated, true, 'Simulation flag must be true');
  assert.equal(simResult.simulation!.unitsSoldLast7Days, 14, 'Units sold must be 14');
  assert.equal(simResult.simulation!.currentStock, 3, 'Current stock must be 3');
  console.log('   ✅ Simulation configured: 14 units sold, 3 stock remaining');

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Rolling Daily Consumption Velocity
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Verifying Daily Velocity Calculation: dailyVelocity = 14 / 7 = 2.0...');
  const predictionData = await InventoryService.getReorderPredictions(retailerId);
  const targetItem = predictionData.predictions.find((p) => p.productId === targetProductId);

  assert.ok(targetItem, 'Target item must exist in reorder predictions');
  assert.equal(targetItem.dailyVelocity, 2.0, 'Daily velocity must be exactly 2.0 units/day');
  assert.equal(targetItem.unitsSoldLast7Days, 14, '7-Day sales must match simulated 14 units');
  console.log(`   ✅ Rolling daily velocity verified: ${targetItem.dailyVelocity} units/day`);

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Stockout Horizon Calculation & Urgency Threshold Gate
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Verifying Stockout Horizon: daysRemaining = 3 / 2.0 = 1.5 days (<= 2.5 threshold)...');
  assert.equal(targetItem.currentStock, 3, 'Current stock must be 3');
  assert.equal(targetItem.daysRemaining, 1.5, 'Days remaining must be 1.5 days');
  assert.equal(targetItem.isUrgent, true, 'Must trigger urgent warning since 1.5 <= 2.5 days');
  assert.equal(targetItem.urgencyLevel, 'HIGH', 'Urgency level must be HIGH');
  console.log(`   ✅ Stockout horizon verified: ${targetItem.daysRemaining} days (Trigger: URGENT / HIGH RISK)`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Recommended Buffer Calculation (10 Units Buffer)
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Verifying Recommended Buffer Recommendation: dailyVelocity * 5 days = 10 units...');
  assert.equal(targetItem.supplierLeadTimeHours, 24, 'Supplier lead time must be ~24h');
  assert.equal(targetItem.recommendedBufferQty, 10, 'Recommended buffer must be 10 units');
  assert.equal(targetItem.estimatedRestockCost, 10 * targetItem.costPrice, 'Estimated cost must equal buffer * cost price');
  console.log(`   ✅ Buffer recommendation verified: ${targetItem.recommendedBufferQty} units (Est. Cost: ₹${targetItem.estimatedRestockCost})`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Explainable Card Formatted Lines
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Verifying Explainable Alert Card Text Formulation...');
  console.log(`   Line 1: "${targetItem.line1}"`);
  console.log(`   Line 2: "${targetItem.line2}"`);
  console.log(`   Line 3: "${targetItem.line3}"`);

  assert.ok(targetItem.line1.includes('Stockout in ~1.5 Days'), 'Line 1 must contain stockout horizon');
  assert.ok(targetItem.line1.includes(targetItem.productName), 'Line 1 must contain product name');
  assert.ok(targetItem.line2.includes('7-Day Sales: 14 units (2/day)'), 'Line 2 must contain sales and daily rate');
  assert.ok(targetItem.line2.includes('Stock remaining: 3 units'), 'Line 2 must contain current stock');
  assert.ok(targetItem.line3.includes('Supplier takes ~24h delivery'), 'Line 3 must contain supplier lead time');
  assert.ok(targetItem.line3.includes('Recommended buffer: 10 units'), 'Line 3 must contain recommended buffer');
  console.log('   ✅ All 3 explainable card lines match required roadmap text structure');

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Simulation Reset & Healthy Stock Suppression
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Verifying Reset & Non-Urgent Item Suppression (daysRemaining > 2.5)...');
  const resetResult = InventoryService.simulateVelocity(retailerId, { reset: true });
  assert.equal(resetResult.simulated, false, 'Simulation should be cleared');

  const healthyData = await InventoryService.getReorderPredictions(retailerId);
  const saltItem = healthyData.predictions.find((p) => p.productId === 'prod-003'); // Tata Salt (42 in stock)

  assert.ok(saltItem, 'Tata Salt item must exist');
  assert.ok(saltItem.daysRemaining > 2.5, 'Tata Salt days remaining must be > 2.5 days');
  assert.equal(saltItem.isUrgent, false, 'Tata Salt must NOT be flagged as urgent');
  assert.equal(saltItem.urgencyLevel, 'HEALTHY', 'Tata Salt must be classified as HEALTHY');
  console.log(`   ✅ Healthy item verified: Tata Salt (Stock: ${saltItem.currentStock}, Horizon: ${saltItem.daysRemaining} days, Urgent: false)`);

  console.log('\n======================================================================');
  console.log('🎉 ALL 6 VELOCITY REORDER PREDICTOR TESTS PASSED (100%)');
  console.log('======================================================================\n');
}

runVelocityReorderPredictorTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
