import { PublicInvoiceVerificationResult, VerifyInvoiceResult } from './invoice.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublicInvoiceId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Maps internal verification details to the deliberately minimal public certificate. */
export function toPublicInvoiceVerification(result: VerifyInvoiceResult): PublicInvoiceVerificationResult {
  return {
    authentic: result.authentic,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    verifiedAt: result.verifiedAt,
    isTampered: result.isTampered,
    issuerName: result.invoice?.wholesalerName,
    issuedAt: result.invoice?.issuedAt,
    totalInvoiceAmount: result.invoice?.totalInvoiceAmount,
    status: result.invoice?.status,
    tamperDetails: result.tamperDetails,
    message: result.message,
  };
}
