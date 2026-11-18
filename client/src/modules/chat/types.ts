export type SenderUserType = 'retailer' | 'wholesaler' | 'sub_user';
export type MessageType = 'text' | 'image' | 'file' | 'product_broadcast' | 'system';

export interface ChatMessage {
  id: string;
  orderId: string;
  connectionId: string;
  senderUserId: string;
  senderUserType: SenderUserType;
  senderName: string;
  messageType: MessageType;
  messageText: string;
  fileAttachments?: any;
  isDelivered: boolean;
  deliveredAt?: string | null;
  createdAt: string;
}

export interface UserPresence {
  orderId: string;
  userId: string;
  userType: SenderUserType;
  name: string;
  timestamp: string;
}

export interface TypingStatus {
  orderId: string;
  userId: string;
  name: string;
  isTyping: boolean;
}

export interface OrderNegotiationContext {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  role: SenderUserType;
  wholesalerName: string;
  retailerName: string;
}

export interface LineItemRateProposal {
  orderItemId: string;
  proposedUnitPrice: number;
  reason?: string;
  proposedQuantity?: number;
}

export interface ProposeRatePayload {
  orderId: string;
  items: LineItemRateProposal[];
  proposedDiscountPercent?: number;
  notes?: string;
  clientVersion?: number;
  isFinalOffer?: boolean;
}

export interface RateProposalItemDetail {
  orderItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  originalUnitPrice: number;
  proposedUnitPrice: number;
  originalLineTotal: number;
  proposedLineTotal: number;
  unitPriceDiff: number;
  lineSavings: number;
  isContested?: boolean;
  status?: 'contested' | 'locked' | 'uncontested';
}

export interface RateProposalResult {
  proposalId: string;
  orderId: string;
  orderNumber: string;
  proposerUserId: string;
  proposerName: string;
  proposerRole: SenderUserType;
  items: RateProposalItemDetail[];
  previousSubtotal: number;
  proposedSubtotal: number;
  totalSavings: number;
  notes?: string;
  createdAt: string;
  systemMessage: ChatMessage;
  clientVersion?: number;
  version?: number;
  isFinalOffer?: boolean;
  stockExhausted?: boolean;
  stockWarning?: string;
}

export interface OrderPriceHistoryDto {
  id: string;
  orderId: string;
  orderItemId?: string | null;
  productName?: string | null;
  changedByUserId: string;
  changeType: string;
  previousPrice?: number | null;
  newPrice?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface ConfirmRatePayload {
  orderId: string;
  notes?: string;
  clientVersion?: number;
  items?: Array<{
    orderItemId: string;
    agreedUnitPrice?: number;
    agreedQuantity?: number;
  }>;
}

export interface RateLockItemSnapshot {
  orderItemId: string;
  productName: string;
  quantity: number;
  finalUnitPrice: number;
  lineTotal: number;
}

export interface RateLockResult {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  isDealLocked: boolean;
  retailerConfirmed: boolean;
  wholesalerConfirmed: boolean;
  finalPrice: number;
  lockedAt?: string | null;
  confirmedBy: {
    userId: string;
    role: SenderUserType;
    name: string;
  };
  lockedItems: RateLockItemSnapshot[];
  systemMessage: ChatMessage;
}

export interface NegotiationStatusResult {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  retailerConfirmed: boolean;
  wholesalerConfirmed: boolean;
  isDealLocked: boolean;
  currentSubtotal: number;
  catalogSubtotal: number;
  finalPrice?: number | null;
  lockedAt?: string | null;
  retailerName: string;
  wholesalerName: string;
  items: Array<{
    orderItemId: string;
    productName: string;
    quantity: number;
    quotedUnitPrice: number;
    activeProposedPrice: number;
    lineTotal: number;
    isPriceModified: boolean;
    gstRate?: number;
  }>;
  version?: number;
  status?: string;
  isFinalOffer?: boolean;
}

/**
 * P1.2 per-line negotiation events. Emitted alongside the whole-order
 * rate_proposed / rate_locked events (which are retained for compatibility).
 */
export interface LineRateProposed {
  orderId: string;
  proposalId: string;
  version: number;
  orderItemId: string;
  productName: string;
  quantity: number;
  originalUnitPrice: number;
  proposedUnitPrice: number;
  gstRate: number;
  lineExGstTotal: number;
  lineGstAmount: number;
  lineLandedCost: number;
  isContested: boolean;
  status: 'contested' | 'locked' | 'uncontested';
  proposerRole: SenderUserType;
  timestamp: string;
}

export interface LineRateLocked {
  orderId: string;
  proposalId?: string;
  version: number;
  orderItemId: string;
  productName: string;
  quantity: number;
  finalUnitPrice: number;
  gstRate: number;
  lineExGstTotal: number;
  lineGstAmount: number;
  lineLandedCost: number;
  reason: 'uncontested' | 'mutual_confirmation' | 'deal_sealed';
  timestamp: string;
}
