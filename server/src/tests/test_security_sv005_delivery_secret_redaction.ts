import assert from 'node:assert/strict';
import { redactDeliveryStatusSecrets } from '../modules/delivery/delivery-security';

const safe = redactDeliveryStatusSecrets({
  orderId: 'order-1',
  deliveryStatus: 'out_for_delivery',
  driverAccessToken: 'drv_secret',
  trackingUrl: '/driver/dispatch/drv_secret',
  handoverCode: '123456',
});

assert.equal(safe.orderId, 'order-1');
assert.equal('driverAccessToken' in safe, false);
assert.equal('trackingUrl' in safe, false);
assert.equal('handoverCode' in safe, false);
assert.equal(JSON.stringify(safe).includes('drv_secret'), false);
assert.equal(JSON.stringify(safe).includes('123456'), false);

console.log('SV-005 regression tests passed');
