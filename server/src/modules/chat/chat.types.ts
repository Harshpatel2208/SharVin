import { SenderUserType, MessageType } from '@prisma/client';

export interface ChatUserContext {
  userId: string;
  userType: SenderUserType;
  roleName: string;
  permissions: string[];
  phoneNumber?: string | null;
  businessName?: string | null;
}

export interface JoinOrderPayload {
  orderId: string;
}

export interface LeaveOrderPayload {
  orderId: string;
}

export interface SendMessagePayload {
  orderId: string;
  messageText: string;
  messageType?: MessageType;
  fileAttachments?: any;
}

export interface TypingPayload {
  orderId: string;
}

export interface LineItemRateProposal {
  orderItemId: string;
  proposedUnitPrice: number;
  proposedQuantity?: number;
  reason?: string;
}

export interface ProposeRatePayload {
  orderId: string;
  items: LineItemRateProposal[];
  proposedDiscountPercent?: number;
  clientVersion?: number;
  isFinalOffer?: boolean;
  notes?: string;
}

export interface ConfirmRatePayload {
  orderId: string;
  clientVersion?: number;
  notes?: string;
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
  godownStock?: number;
  isStockSufficient?: boolean;
  moq?: number;
}

export interface RateProposalResult {
  proposalId: string;
  orderId: string;
  orderNumber: string;
  version: number;
  status: 'rate_proposed' | 'final_offer_locked' | 'price_locked';
  isFinalOffer?: boolean;
  proposerUserId: string;
  proposerName: string;
  proposerRole: SenderUserType;
  items: RateProposalItemDetail[];
  previousSubtotal: number;
  proposedSubtotal: number;
  totalSavings: number;
  orderTotalAmount?: number;
  contestedItemsCount?: number;
  uncontestedItemsCount?: number;
  stockWarning?: string | null;
  stockExhausted?: boolean;
  notes?: string;
  createdAt: string;
  systemMessage: ChatMessageDto;
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
  version: number;
  orderStatus: string; // 'negotiating', 'rate_proposed', or 'deal_locked'
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
  systemMessage: ChatMessageDto;
}

export interface NegotiationStatusResult {
  orderId: string;
  orderNumber: string;
  version: number;
  status: string;
  isFinalOffer: boolean;
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
    gstRate: number;
  }>;
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

export interface ChatMessageDto {
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

export interface UserPresenceEventPayload {
  orderId: string;
  userId: string;
  userType: SenderUserType;
  name: string;
  timestamp: string;
}

/**
 * P1.2 per-line negotiation event payloads (emitted alongside the whole-order
 * rate_proposed / rate_locked events, which are kept for backwards compatibility).
 */
export interface LineRateProposedPayload {
  orderId: string;
  proposalId: string;
  version: number;
  orderItemId: string;
  productName: string;
  quantity: number;
  originalUnitPrice: number;
  proposedUnitPrice: number;
  gstRate: number;         // total GST percentage (Ex-GST line price basis)
  lineExGstTotal: number;  // proposedUnitPrice * quantity
  lineGstAmount: number;   // lineExGstTotal * gstRate / 100
  lineLandedCost: number;  // lineExGstTotal + lineGstAmount
  isContested: boolean;
  status: 'contested' | 'locked' | 'uncontested';
  proposerRole: SenderUserType;
  timestamp: string;
}

export interface LineRateLockedPayload {
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

export interface UserTypingEventPayload {
  orderId: string;
  userId: string;
  name: string;
  isTyping: boolean;
}

export interface ServerToClientEvents {
  user_joined: (payload: UserPresenceEventPayload) => void;
  user_left: (payload: { orderId: string; userId: string; userType: SenderUserType; timestamp: string }) => void;
  new_message: (message: ChatMessageDto) => void;
  user_typing: (payload: UserTypingEventPayload) => void;
  rate_proposed: (proposal: RateProposalResult) => void;
  rate_locked: (lockResult: RateLockResult) => void;
  rate_confirmation_pending: (pendingResult: RateLockResult) => void;
  line_rate_proposed: (payload: LineRateProposedPayload) => void;
  line_rate_locked: (payload: LineRateLockedPayload) => void;
  order_price_locked: (lockResult: RateLockResult) => void;
  error: (err: { message: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  join_order: (
    payload: JoinOrderPayload,
    callback?: (res: { success: boolean; error?: string; orderDetails?: any }) => void
  ) => void;
  leave_order: (payload: LeaveOrderPayload) => void;
  send_message: (
    payload: SendMessagePayload,
    callback?: (res: { success: boolean; data?: ChatMessageDto; error?: string }) => void
  ) => void;
  propose_rate: (
    payload: ProposeRatePayload,
    callback?: (res: { success: boolean; data?: RateProposalResult; error?: string }) => void
  ) => void;
  confirm_rate: (
    payload: ConfirmRatePayload,
    callback?: (res: { success: boolean; data?: RateLockResult; error?: string }) => void
  ) => void;
  typing_start: (payload: TypingPayload) => void;
  typing_stop: (payload: TypingPayload) => void;
}

export interface SocketData {
  user: ChatUserContext;
}
