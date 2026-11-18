import { Router } from 'express';
import { authenticate, authorizeRoles, authorizePermissions } from '../../middleware/auth.middleware';
import { CartController } from './cart.controller';

const router = Router();

// All wholesale cart operations are strictly for authenticated retailers
router.use(authenticate);
router.use(authorizeRoles('retailer'));
router.use(authorizePermissions('orders.manage'));

router.get('/', CartController.getCarts);
router.post('/items', CartController.addItem);
router.patch('/items/:orderItemId', CartController.updateItemQuantity);
router.delete('/items/:orderItemId', CartController.removeItem);
router.delete('/wholesaler/:wholesalerId', CartController.clearCart);
router.post('/wholesaler/:wholesalerId/submit', CartController.submitCart);

export default router;
