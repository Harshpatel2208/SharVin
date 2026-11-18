import { Router } from 'express';
import { PosController } from './pos.controller';
import { authenticate, authorizePermissions, authorizeRoles, authorizeOwner } from '../../middleware/auth.middleware';

const router = Router();

// All POS routes are restricted to authenticated retailers
router.use(authenticate);
router.use(authorizeRoles('retailer'));

router.get('/products', authorizePermissions('pos.read'), PosController.getProducts);
router.post('/products', authorizePermissions('inventory.manage'), PosController.upsertProduct);
router.post('/sales', authorizePermissions('pos.sell'), PosController.recordSale);

export default router;
