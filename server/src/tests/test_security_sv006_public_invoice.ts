import assert from 'node:assert/strict';
import { isPublicInvoiceId, toPublicInvoiceVerification } from '../modules/invoice/invoice-public';
import { VerifyInvoiceResult } from '../modules/invoice/invoice.types';

assert.equal(isPublicInvoiceId('INV-2026-0001'), false, 'sequential invoice aliases must not be public verifiers');
assert.equal(isPublicInvoiceId('550e8400-e29b-41d4-a716-446655440000'), true);

const internal = {
  authentic: true,
  invoiceId: '550e8400-e29b-41d4-a716-446655440000',
  invoiceNumber: 'INV-2026-0001',
  orderNumber: 'PO-SECRET',
  verifiedAt: new Date(0).toISOString(),
  signatureHash: 'secret-signature',
  storedSignatureHash: 'secret-signature',
  isTampered: false,
  message: 'Authentic',
  invoice: {
    wholesalerName: 'Safe Supplier',
    issuedAt: new Date(0).toISOString(),
    totalInvoiceAmount: 100,
    status: 'issued',
    retailerName: 'Private Buyer',
    retailerGstin: 'PRIVATEGSTIN0001',
    retailerAddress: 'Private address',
    itemsSnapshot: [{ productName: 'Private item' }],
  },
} as unknown as VerifyInvoiceResult;

const publicResult = toPublicInvoiceVerification(internal);
const serialized = JSON.stringify(publicResult);
assert.equal(publicResult.issuerName, 'Safe Supplier');
for (const secret of ['PO-SECRET', 'secret-signature', 'Private Buyer', 'PRIVATEGSTIN0001', 'Private address', 'Private item']) {
  assert.equal(serialized.includes(secret), false, `public result leaked ${secret}`);
}

console.log('SV-006 regression tests passed');
