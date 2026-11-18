export type DeliveryStatus = 
  | 'pending'
  | 'driver_assigned'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned';

export type DeliveryMethod = 'local_driver' | 'threePL_shipping';

export interface DeliveryStatusResponse {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  deliveryStatus: DeliveryStatus;
  deliveryType: DeliveryMethod;
  driverName: string;
  driverPhone: string;
  distanceKm?: number;
  trackingMode?: 'local' | 'regional';
  currentLatitude?: number;
  currentLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationAddress?: string;
  trackingMilestone?: 'dispatched' | 'in_transit_hub' | 'out_for_delivery' | 'delivered';
  currentHubName?: string;
  lastLocationUpdatedAt?: string | null;
  retailerBusinessName: string;
  wholesalerBusinessName: string;
  isVerified: boolean;
  verifiedAt?: string | null;
  finalOrderAmount: number;
  attemptsRemaining: number;
  isLocked?: boolean;
  lockedUntil?: string | null;
  lockoutMinutesRemaining?: number;
  damagedQuantity?: number;
  assignedAt?: string | null;
  deliveredAt?: string | null;
}

export interface DriverAccessLinkResponse {
  orderId: string;
  orderNumber: string;
  driverAccessToken: string;
  trackingUrl: string;
}

export interface ActiveDispatchOrder {
  orderId: string;
  retailerId: string;
  wholesalerId: string;
  orderNumber: string;
  orderStatus: string;
  retailerName: string;
  wholesalerName: string;
  finalOrderAmount: number;
  deliveryStatus: string;
  items: Array<{
    orderItemId: string;
    productId: string;
    productName: string;
    orderedQuantity: number;
    unitPrice: number;
    rejectedQuantity: number;
  }>;
}

export interface DriverPortalLineItem {
  orderItemId: string;
  productId: string;
  productName: string;
  orderedQuantity: number;
  unitPrice: number;
  lineTotal: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
}

export interface DriverPortalDetailsResponse {
  token: string;
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  deliveryStatus: DeliveryStatus;
  driverName: string;
  driverPhone: string;
  retailerName: string;
  retailerPhone: string;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  googleMapsUrl: string;
  distanceKm: number;
  trackingMode: 'local' | 'regional';
  trackingMilestone: 'dispatched' | 'in_transit_hub' | 'out_for_delivery' | 'delivered';
  currentHubName?: string;
  currentLatitude: number;
  currentLongitude: number;
  items: DriverPortalLineItem[];
  finalAmount: number;
  isVerified: boolean;
  verifiedAt?: string | null;
  attemptsRemaining: number;
  isLocked?: boolean;
  lockedUntil?: string | null;
  lockoutMinutesRemaining?: number;
}

export interface HandoverCodeResponse {
  orderId: string;
  orderNumber: string;
  handoverCode: string;
  driverName: string;
  driverPhone: string;
  instructions: string;
}

export interface InventoryRebalanceItem {
  productId: string;
  productName: string;
  quantityAdded: number;
  previousRetailerStock: number;
  newRetailerStock: number;
  updatedCostPrice: number;
  alertsResolved: number;
  wholesalerStockDeducted: number;
  remainingWholesalerStock?: number | null;
}

export interface RebalanceSummaryResult {
  orderId: string;
  orderNumber: string;
  retailerName: string;
  wholesalerName: string;
  isDelivered: boolean;
  deliveredAt?: string | null;
  totalUnitsTransferred: number;
  totalAlertsResolved: number;
  items: InventoryRebalanceItem[];
}

export interface LineItemInspectionPayload {
  orderItemId: string;
  productId: string;
  productName: string;
  orderedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  rejectionReason?: 'damaged_packaging' | 'waterlogged_spoilage' | 'expired_product' | 'wrong_specification' | 'short_delivery' | 'other';
  rejectionNotes?: string;
  unitPrice: number;
  lineRejectedAmount?: number;
}

export interface CreditNoteItem {
  productId: string;
  productName: string;
  rejectedQuantity: number;
  unitPrice: number;
  taxableAmount: number;
  gstRatePercent: number;
  gstAmount: number;
  totalCreditAmount: number;
  reason: string;
}

export interface CreditNoteTradeParty {
  id: string;
  name: string;
  gstin: string;
  address: string;
  pan?: string;
  contactNumber?: string;
}

export interface CreditNoteDoubleEntryJournal {
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  narration: string;
}

export interface CreditNoteDto {
  creditNoteId: string;
  creditNoteNumber: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  orderId: string;
  orderNumber: string;
  payer: CreditNoteTradeParty;
  payee: CreditNoteTradeParty;
  originalOrderAmount: number;
  acceptedOrderAmount: number;
  creditNoteAmount: number;
  items: CreditNoteItem[];
  doubleEntryJournal: CreditNoteDoubleEntryJournal;
  digitalSignatureHash: string;
  status: 'issued' | 'approved_by_wholesaler' | 'settled';
  issuedAt: string;
}

export interface DeliveryDisputeDto {
  disputeId: string;
  disputeNumber: string;
  orderId: string;
  orderNumber: string;
  deliveryId?: string;
  retailerId: string;
  retailerName: string;
  wholesalerId: string;
  wholesalerName: string;
  disputeStatus: 'open' | 'under_review' | 'resolved' | 'rejected';
  escrowHoldAmount: number;
  totalClaimAmount: number;
  creditNote?: CreditNoteDto | null;
  inspections: LineItemInspectionPayload[];
  disputeReason?: string;
  resolutionNotes?: string;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface HandoverVerificationResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  deliveryStatus: DeliveryStatus;
  isVerified: boolean;
  verifiedAt: string;
  finalAmount: number;
  isPartialDelivery?: boolean;
  acceptedUnits?: number;
  damagedUnits?: number;
  adjustedAmount?: number;
  message: string;
  certificate: {
    verificationId: string;
    verifiedAt: string;
    orderNumber: string;
    retailerName: string;
    wholesalerName: string;
    verifiedByDriver: string;
    totalAmount: number;
  };
  inventoryRebalanced?: InventoryRebalanceItem[];
  creditNote?: CreditNoteDto | null;
  dispute?: DeliveryDisputeDto | null;
  escrowHoldAmount?: number;
}
