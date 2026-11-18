import assert from 'node:assert/strict';
import { reconcileDeliveryInspections } from '../modules/delivery/delivery-inspection';
import { LineItemInspectionPayload } from '../modules/delivery/delivery.types';

const lines = [
  { orderItemId: 'line-1', productId: 'product-1', productName: 'Authoritative Product', orderedQuantity: 10, unitPrice: 125 },
  { orderItemId: 'line-2', productId: 'product-2', productName: 'Second Product', orderedQuantity: 5, unitPrice: 80 },
];

const valid: LineItemInspectionPayload[] = [
  {
    orderItemId: 'line-1', productId: 'forged-product', productName: 'Forged Name', orderedQuantity: 999,
    acceptedQuantity: 8, rejectedQuantity: 2, rejectionReason: 'damaged_packaging', unitPrice: 999999,
  },
  {
    orderItemId: 'line-2', productId: 'product-2', productName: 'Second Product', orderedQuantity: 5,
    acceptedQuantity: 5, rejectedQuantity: 0, unitPrice: 0,
  },
];

const result = reconcileDeliveryInspections(lines, valid, 2)!;
assert.equal(result[0].productId, 'product-1', 'product identity must come from the order');
assert.equal(result[0].productName, 'Authoritative Product', 'product name must come from the order');
assert.equal(result[0].orderedQuantity, 10, 'ordered quantity must come from the order');
assert.equal(result[0].unitPrice, 125, 'unit price must come from the order');
assert.equal(result[0].lineRejectedAmount, 250, 'rejected amount must be calculated server-side');

assert.throws(
  () => reconcileDeliveryInspections(lines, [valid[0], { ...valid[0] }], 4),
  /duplicate order item/,
);
assert.throws(
  () => reconcileDeliveryInspections(lines, [{ ...valid[0], orderItemId: 'foreign-line' }, valid[1]], 2),
  /does not belong to this order/,
);
assert.throws(
  () => reconcileDeliveryInspections(lines, [{ ...valid[0], acceptedQuantity: 10, rejectedQuantity: 2 }, valid[1]], 2),
  /exactly equal/,
);
assert.throws(
  () => reconcileDeliveryInspections(lines, [valid[0]], 2),
  /every order line exactly once/,
);
assert.throws(
  () => reconcileDeliveryInspections(lines, valid, 3),
  /does not match/,
);

console.log('SV-001 regression tests passed');
