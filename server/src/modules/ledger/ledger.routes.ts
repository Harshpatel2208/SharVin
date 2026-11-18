import { Router } from 'express';
import { authenticate, authorizePermissions, enforceTenantScoping, enforceOrderScoping, authorizeOwner } from '../../middleware/auth.middleware';
import { LedgerController } from './ledger.controller';

const router = Router();

// Protected routes (requires valid JWT token)
router.get('/accounts/:partnerId', authenticate, authorizePermissions('ledger.read'), enforceTenantScoping('partnerId'), LedgerController.getLedgerAccount);
router.get('/relationships/:partnerId', authenticate, authorizePermissions('ledger.read'), enforceTenantScoping('partnerId'), LedgerController.getLedgerAccount);
router.get('/transactions/:partnerId', authenticate, authorizePermissions('ledger.read'), enforceTenantScoping('partnerId'), LedgerController.getLedgerTransactions);
router.post('/payments', authenticate, authorizePermissions('ledger.manage'), LedgerController.recordPayment);
router.post('/settlements', authenticate, authorizePermissions('ledger.manage'), LedgerController.recordPayment);
router.post('/orders/:orderId/post', authenticate, authorizePermissions('ledger.manage'), enforceOrderScoping('orderId'), LedgerController.postOrderToLedger);
router.post('/orders/:orderId/rollback', authenticate, authorizeOwner, enforceOrderScoping('orderId'), LedgerController.rollbackCancelledOrder);
router.post('/orders/:orderId/settle-split', authenticate, authorizePermissions('ledger.manage'), enforceOrderScoping('orderId'), LedgerController.settleSplitPayment);
router.get('/vouchers/:id/csv', authenticate, authorizePermissions('ledger.read'), LedgerController.exportVoucherCsv);
router.get('/vouchers/:id', authenticate, authorizePermissions('ledger.read'), LedgerController.getSettlementVoucher);

// Bilateral Credit Limits & Overdue Freeze Gates
router.get('/credit-profile/:partnerId', authenticate, authorizePermissions('ledger.read'), enforceTenantScoping('partnerId'), LedgerController.getCreditProfile);
router.patch('/credit-terms/:partnerId', authenticate, authorizePermissions('credit.manage'), enforceTenantScoping('partnerId'), LedgerController.updateCreditTerms);
router.post('/orders/:orderId/credit-override', authenticate, authorizePermissions('credit.manage'), enforceOrderScoping('orderId'), LedgerController.overrideOrderCredit);
router.post('/orders/:orderId/demand-payment', authenticate, authorizePermissions('ledger.manage'), enforceOrderScoping('orderId'), LedgerController.demandPayment);
router.post('/simulate-overdue', authenticate, authorizeOwner, LedgerController.simulateOverdue);

export default router;
