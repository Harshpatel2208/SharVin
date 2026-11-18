export interface InvoiceItemSnapshot {
  itemId: string;
  productId: string;
  productName: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalLineAmount: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  wholesalerId: string;
  wholesalerName: string;
  wholesalerGstin: string;
  wholesalerState: string;
  wholesalerAddress: string;
  wholesalerPan?: string;
  retailerId: string;
  retailerName: string;
  retailerGstin: string;
  retailerState: string;
  retailerAddress: string;
  retailerPan?: string;

  placeOfSupply: string;
  isInterState: boolean;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  totalInvoiceAmount: number;
  totalAmountInWords: string;

  itemsSnapshot: InvoiceItemSnapshot[];
  signatureHash: string;
  qrCodeData: string;
  verificationUrl: string;
  status: 'issued' | 'cancelled';
  issuedAt: string;
  createdAt: string;
}

export interface VerifyInvoiceResult {
  authentic: boolean;
  invoiceId: string;
  invoiceNumber: string;
  orderNumber: string;
  verifiedAt: string;
  signatureHash: string;
  storedSignatureHash: string;
  isTampered: boolean;
  invoice?: InvoiceRecord;
  tamperDetails?: string;
  message: string;
}

export interface PublicInvoiceVerificationResult {
  authentic: boolean;
  invoiceId: string;
  invoiceNumber: string;
  verifiedAt: string;
  isTampered: boolean;
  issuerName?: string;
  issuedAt?: string;
  totalInvoiceAmount?: number;
  status?: 'issued' | 'cancelled';
  tamperDetails?: string;
  message: string;
}
