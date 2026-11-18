import { Router } from 'express';
import { authenticate, authorizePermissions, enforceOrderScoping } from '../../middleware/auth.middleware';
import { DeliveryController } from './delivery.controller';
import { otpVerificationLimiter } from '../../middleware/rate-limiter.middleware';

const router = Router();

// Protected: requires valid JWT bearer token
router.get('/active-orders', authenticate, authorizePermissions('delivery.read'), DeliveryController.listActiveOrders);
router.post('/orders/:orderId/dispatch', authenticate, authorizePermissions('orders.fulfill'), enforceOrderScoping('orderId'), DeliveryController.dispatchOrder);
router.get('/orders/:orderId/handover-code', authenticate, authorizePermissions('delivery.read'), enforceOrderScoping('orderId'), DeliveryController.getHandoverCode);
router.get('/orders/:orderId/driver-link', authenticate, authorizePermissions('orders.fulfill'), enforceOrderScoping('orderId'), DeliveryController.getDriverAccessLink);
router.post('/orders/:orderId/verify-handover', authenticate, authorizePermissions('delivery.manage'), enforceOrderScoping('orderId'), otpVerificationLimiter, DeliveryController.verifyHandover);
router.get('/orders/:orderId/delivery-status', authenticate, authorizePermissions('delivery.read'), enforceOrderScoping('orderId'), DeliveryController.getDeliveryStatus);
router.get('/orders/:orderId/rebalance-summary', authenticate, authorizePermissions('delivery.read'), enforceOrderScoping('orderId'), DeliveryController.getRebalanceSummary);

// Dispute resolution & Credit Note routes
router.get('/orders/:orderId/dispute', authenticate, authorizePermissions('delivery.read'), enforceOrderScoping('orderId'), DeliveryController.getDispute);
router.post('/orders/:orderId/dispute/resolve', authenticate, authorizePermissions('credit.manage'), enforceOrderScoping('orderId'), DeliveryController.resolveDispute);
router.get('/delivery/credit-notes/:id', authenticate, authorizePermissions('ledger.read'), DeliveryController.getCreditNote);
router.get('/delivery/credit-notes/:id/csv', authenticate, authorizePermissions('ledger.read'), DeliveryController.exportCreditNoteCsv);

// Public Tokenized Driver Portal routes (No JWT login required - token in URL)
router.get('/deliveries/driver-portal/:token', DeliveryController.getDriverPortalDetails);
router.post('/deliveries/driver-portal/:token/location', DeliveryController.updateDriverLocation);
router.post('/deliveries/driver-portal/:token/milestone', DeliveryController.updateDriverMilestone);
router.post('/deliveries/driver-portal/:token/verify-otp', otpVerificationLimiter, DeliveryController.verifyDriverOtp);

export default router;
