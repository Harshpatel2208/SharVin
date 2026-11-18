import { Router } from 'express';
import { InvoiceController } from './invoice.controller';
import { authenticate, authorizePermissions, enforceOrderScoping, enforceInvoiceScoping } from '../../middleware/auth.middleware';

const router = Router();

// 1. Generate Invoice (Manual or Delivery Webhook trigger)
router.post('/generate', authenticate, authorizePermissions('ledger.manage'), InvoiceController.generateInvoice);

// 2. Export CA GSTR-1 in CSV/Excel format
router.get('/export/gstr-1', authenticate, authorizePermissions('ledger.manage'), InvoiceController.exportGstr1);

// 3. Cryptographically Verify Invoice & Detect Tampering (Public & Internal)
router.get('/verify/:invoiceId', InvoiceController.verifyInvoice);
router.get('/verify-internal/:invoiceId', authenticate, authorizePermissions('ledger.read'), enforceInvoiceScoping('invoiceId'), InvoiceController.verifyInvoiceInternal);
router.post('/verify-internal/:invoiceId', authenticate, authorizePermissions('ledger.read'), enforceInvoiceScoping('invoiceId'), InvoiceController.verifyInvoiceInternal);

// 4. Retrieve by Order ID
router.get('/order/:orderId', authenticate, authorizePermissions('ledger.read'), enforceOrderScoping('orderId'), InvoiceController.getInvoiceByOrderId);

// 5. Retrieve by Invoice ID
router.get('/:id', authenticate, authorizePermissions('ledger.read'), enforceInvoiceScoping('id'), InvoiceController.getInvoiceById);

// 6. List Invoices with date filters
router.get('/', authenticate, authorizePermissions('ledger.read'), InvoiceController.listInvoices);

export default router;
