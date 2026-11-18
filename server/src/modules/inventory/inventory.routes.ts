import { Router } from 'express';
import { authenticate, authorizeRoles, authorizePermissions, authorizeOwner } from '../../middleware/auth.middleware';
import { InventoryController } from './inventory.controller';

const router = Router();

// Protect all retailer inventory endpoints
router.use(authenticate);
router.use(authorizeRoles('retailer'));

router.get('/low-stock', authorizePermissions('inventory.read'), InventoryController.getLowStock);
router.get('/alerts', authorizePermissions('inventory.read'), InventoryController.getAlerts);
router.get('/reorder-predictions', authorizePermissions('inventory.read'), InventoryController.getReorderPredictions);
router.post('/simulate-velocity', authorizeOwner, InventoryController.simulateVelocity);
router.patch('/threshold', authorizePermissions('inventory.manage'), InventoryController.updateThreshold);
router.post('/restock/quick-add', authorizePermissions('inventory.manage'), InventoryController.quickRestock);
router.post('/restock/batch', authorizePermissions('inventory.manage'), InventoryController.batchRestock);
router.post('/alerts/:alertId/dismiss', authorizePermissions('inventory.manage'), InventoryController.dismissAlert);

export { router as inventoryRouter };
