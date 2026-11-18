export interface WholesaleCartItem {
  orderItemId: string;
  productId: string;
  wholesalerProductId?: string | null;
  productName: string;
  brandName?: string | null;
  barcode: string;
  unitOfMeasure: string;
  quantity: number;
  quotedUnitPrice: number;
  lineTotal: number;
  minimumOrderQuantity: number;
  isMoqSatisfied: boolean;
  stockAvailable?: number | null;
  isStockSufficient: boolean;
  isOutOfStock?: boolean;
  batchNumber?: string | null;
  expiryDate?: string | null;
  daysUntilExpiry?: number | null;
  isNearExpiryWarning?: boolean; // <= 45 days (yellow warning badge on order line)
  isNearExpiryClearance?: boolean; // <= 60 days (Near-Expiry Clearance tag)
  addedAt?: string;
}

export interface WholesaleSupplierSummary {
  totalItems: number;
  totalQuantity: number;
  subtotal: number;
  allMoqSatisfied: boolean;
  canSubmit: boolean;
  moqViolations: Array<{
    productName: string;
    currentQuantity: number;
    minimumOrderQuantity: number;
    deficit: number;
  }>;
}

export interface WholesaleSupplierInfo {
  wholesalerId: string;
  businessName: string;
  phoneNumber?: string;
  gstNumber?: string | null;
  businessCategory?: string | null;
}

export interface WholesaleSupplierCart {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  wholesaler: WholesaleSupplierInfo;
  connectionId: string;
  items: WholesaleCartItem[];
  summary: WholesaleSupplierSummary;
  deliveryMethod?: 'local_driver' | 'threePL_shipping' | null;
  updatedAt?: string;
}

export interface SubmittedWholesaleOrder {
  orderId: string;
  orderNumber: string;
  wholesalerId: string;
  wholesalerName: string;
  totalItems: number;
  subtotal: number;
  submittedAt: string;
  deliveryMethod: string;
}
