import { Router } from 'express';
import { authenticate, authorizePermissions, enforceOrderScoping } from '../../middleware/auth.middleware';
import { ChatController } from './chat.controller';
import { rateProposalLimiter } from '../../middleware/rate-limiter.middleware';

const router = Router();

// Protected: requires valid JWT bearer token
router.get('/orders/:orderId/messages', authenticate, authorizePermissions('orders.read'), enforceOrderScoping('orderId'), ChatController.getMessages);
router.post('/orders/:orderId/messages', authenticate, authorizePermissions('orders.read'), enforceOrderScoping('orderId'), ChatController.sendMessage);
router.post('/orders/:orderId/propose-rate', authenticate, authorizePermissions('orders.manage'), enforceOrderScoping('orderId'), rateProposalLimiter, ChatController.proposeRate);
router.post('/orders/:orderId/confirm-rate', authenticate, authorizePermissions('orders.manage'), enforceOrderScoping('orderId'), ChatController.confirmRate);
router.get('/orders/:orderId/negotiation-status', authenticate, authorizePermissions('orders.read'), enforceOrderScoping('orderId'), ChatController.getNegotiationStatus);
router.get('/orders/:orderId/rate-history', authenticate, authorizePermissions('orders.read'), enforceOrderScoping('orderId'), ChatController.getPriceHistory);

export default router;
