import { Router } from 'express';
import { authenticate, authorizeRoles, authorizePermissions } from '../../middleware/auth.middleware';
import { WholesalerController } from './wholesaler.controller';

const router = Router();

// Protect all routes
router.use(authenticate);

// Retailer supplier discovery endpoints
router.get('/suppliers', authorizeRoles('retailer'), authorizePermissions('catalog.read'), WholesalerController.getConnectedSuppliers);
router.get('/suppliers/:wholesalerId/catalog', authorizeRoles('retailer'), authorizePermissions('catalog.read'), WholesalerController.getSupplierCatalog);

// Wholesaler catalog management endpoints
router.get('/catalog', authorizeRoles('wholesaler'), authorizePermissions('catalog.read'), WholesalerController.getOwnCatalog);
router.post('/catalog', authorizeRoles('wholesaler'), authorizePermissions('catalog.manage'), WholesalerController.upsertOwnProduct);
router.patch('/catalog/:wholesalerProductId', authorizeRoles('wholesaler'), authorizePermissions('catalog.manage'), WholesalerController.updateOwnProduct);
router.patch('/catalog/:wholesalerProductId/fast-inventory', authorizeRoles('wholesaler'), authorizePermissions('inventory.manage'), WholesalerController.updateFastInventory);
router.post('/catalog/bulk-fast-inventory', authorizeRoles('wholesaler'), authorizePermissions('inventory.manage'), WholesalerController.bulkUpdateFastInventory);
router.delete('/catalog/:wholesalerProductId', authorizeRoles('wholesaler'), authorizePermissions('catalog.manage'), WholesalerController.deleteOwnProduct);


// B2B Network Discovery — Retailer only
router.get('/discover', authorizeRoles('retailer'), WholesalerController.discoverWholesalers);
router.post('/connect/:wholesalerId', authorizeRoles('retailer'), WholesalerController.sendConnectionRequest);

// B2B Connection Requests — Wholesaler only
// NOTE: /requests/pending must come before /requests/:id to avoid param conflict
router.get('/requests/pending', authorizeRoles('wholesaler'), WholesalerController.getPendingRequests);
router.patch('/requests/:id', authorizeRoles('wholesaler'), WholesalerController.acceptConnectionRequest);

export default router;
