import { Router } from 'express';
import { authenticate, authorizeOrderTransition, enforceOrderScoping, authorizePermissions } from '../../middleware/auth.middleware';
import { OrderLifecycleController } from './order-lifecycle.controller';

const router = Router();

router.get('/', authenticate, authorizePermissions('orders.read'), OrderLifecycleController.list);
router.patch('/:orderId/lifecycle', authenticate, authorizeOrderTransition, enforceOrderScoping, authorizePermissions('orderId'), OrderLifecycleController.transition);

export default router;
