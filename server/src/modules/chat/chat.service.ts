import { prisma } from '../../db';
import { transitionOrderLifecycleInTransaction } from '../orders/order-lifecycle.service';
import { InvoiceService } from '../invoice/invoice.service';
import { SenderUserType, MessageType, Prisma } from '@prisma/client';
import { Logger } from '../../utils/logger';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { 
  ChatMessageDto, 
  LineItemRateProposal, 
  RateProposalResult, 
  RateProposalItemDetail, 
  OrderPriceHistoryDto,
  RateLockResult,
  RateLockItemSnapshot,
  NegotiationStatusResult
} from './chat.types';

// In-memory stores for local dev fallback or offline mock orders
const IN_MEMORY_MESSAGES: Record<string, ChatMessageDto[]> = {};
const IN_MEMORY_PRICE_HISTORY: Record<string, OrderPriceHistoryDto[]> = {};

export interface DemoOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  quotedUnitPrice: number;
  costPrice?: number;
  marginFloor?: number;
  moq?: number;
  godownStock?: number;
}

// Mock items catalogue for demo orders with real B2B constraint thresholds
const DEMO_ORDER_ITEMS: Record<string, Array<DemoOrderItem>> = {
  'ORD-20261013-8821': [
    { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00, marginFloor: 380.00, moq: 10, godownStock: 140 },
    { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00, marginFloor: 400.00, moq: 10, godownStock: 65 },
    { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
  ],
  'ord-po-demo-01': [
    { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00, marginFloor: 380.00, moq: 10, godownStock: 140 },
    { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00, marginFloor: 400.00, moq: 10, godownStock: 65 },
    { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
  ],
  'PO-2026-0042': [
    { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00, marginFloor: 380.00, moq: 10, godownStock: 140 },
    { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00, marginFloor: 400.00, moq: 10, godownStock: 65 },
    { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
  ],
  'cart-w101': [
    { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00, marginFloor: 380.00, moq: 10, godownStock: 140 },
    { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00, marginFloor: 400.00, moq: 10, godownStock: 65 },
    { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
  ],
  'ORD-20261013-9412': [
    { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
    { id: 'item-04', productId: 'p-003', productName: 'Tata Tea Gold Leaf Pouch 500g', quantity: 20, quotedUnitPrice: 280.00, marginFloor: 250.00, moq: 10, godownStock: 50 },
    { id: 'item-05', productId: 'p-006', productName: 'Amul Pure Ghee Tin 1L', quantity: 12, quotedUnitPrice: 575.00, marginFloor: 530.00, moq: 6, godownStock: 30 },
  ],
  'cart-w102': [
    { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
    { id: 'item-04', productId: 'p-003', productName: 'Tata Tea Gold Leaf Pouch 500g', quantity: 20, quotedUnitPrice: 280.00, marginFloor: 250.00, moq: 10, godownStock: 50 },
    { id: 'item-05', productId: 'p-006', productName: 'Amul Pure Ghee Tin 1L', quantity: 12, quotedUnitPrice: 575.00, marginFloor: 530.00, moq: 6, godownStock: 30 },
  ],
  'ORD-20261013-4105': [
    { id: 'item-06', productId: 'p-005', productName: 'Tata Salt Vacuum Evaporated Iodised 1kg', quantity: 50, quotedUnitPrice: 22.00, marginFloor: 18.00, moq: 50, godownStock: 120 },
  ],
  'cart-w103': [
    { id: 'item-06', productId: 'p-005', productName: 'Tata Salt Vacuum Evaporated Iodised 1kg', quantity: 50, quotedUnitPrice: 22.00, marginFloor: 18.00, moq: 50, godownStock: 120 },
  ],
  // Test case order for depleted stock simulation
  'ord-depleted-stock-test': [
    { id: 'item-dep-01', productId: 'p-dep-01', productName: 'Organic Toor Dal 5kg', quantity: 40, quotedUnitPrice: 620.00, marginFloor: 550.00, moq: 10, godownStock: 8 }, // 8 < 40: DEPLETED!
  ],
};

const IN_MEMORY_NEGOTIATION_STATES: Record<string, any> = {};

function buildDefaultNegotiationState(orderId: string) {
  return {
    id: `mem-${orderId}`,
    orderId,
    version: 1,
    status: 'quoted',
    lastProposerUserId: null,
    isFinalOffer: false,
    retailerConfirmed: false,
    wholesalerConfirmed: false,
    activeProposedPrices: {},
    activeProposedQuantities: {},
    isPersisted: false,
  };
}

async function getOrCreateConfirmationState(orderId: string) {
  try {
    const existing = await prisma.negotiationState.findUnique({
      where: { orderId },
    });

    if (existing) {
      return {
        ...existing,
        activeProposedPrices: (existing.activeProposedPrices as Record<string, number>) || {},
        activeProposedQuantities: (existing.activeProposedQuantities as Record<string, number>) || {},
        isPersisted: true,
      };
    }

    // Only create a DB state row when the order actually exists (FK integrity).
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      select: { id: true },
    });

    if (order) {
      const newState = await prisma.negotiationState.create({
        data: {
          orderId: order.id,
          version: 1,
          status: 'quoted',
          isFinalOffer: false,
          retailerConfirmed: false,
          wholesalerConfirmed: false,
          activeProposedPrices: {},
          activeProposedQuantities: {},
        },
      });

      return {
        ...newState,
        activeProposedPrices: {},
        activeProposedQuantities: {},
        isPersisted: true,
      };
    }
  } catch (err) {
    Logger.warn(`[ChatService] Negotiation state DB lookup failed for order ${orderId}; using in-memory state`, { error: err });
  }

  const memoryState = IN_MEMORY_NEGOTIATION_STATES[orderId] || buildDefaultNegotiationState(orderId);
  IN_MEMORY_NEGOTIATION_STATES[orderId] = memoryState;
  return memoryState;
}

/**
 * Fetches negotiation state while applying a PostgreSQL Row-Level Lock (FOR UPDATE).
 * Must be called within a Prisma Transaction.
 * Demo/offline orders (no DB Order row) use in-memory state and never touch the DB,
 * preserving the Order foreign-key constraint.
 */
async function getLockedConfirmationState(tx: any, orderId: string) {
  const results = await tx.$queryRaw`SELECT * FROM negotiation_states WHERE order_id = ${orderId} FOR UPDATE`;
  const existing = results[0] as any;

  if (existing) {
    return {
      id: existing.state_id,
      orderId: existing.order_id,
      version: existing.version,
      status: existing.status,
      lastProposerUserId: existing.last_proposer_user_id,
      isFinalOffer: existing.is_final_offer,
      retailerConfirmed: existing.retailer_confirmed,
      wholesalerConfirmed: existing.wholesaler_confirmed,
      activeProposedPrices: (existing.active_proposed_prices as Record<string, number>) || {},
      activeProposedQuantities: (existing.active_proposed_quantities as Record<string, number>) || {},
      isPersisted: true,
    };
  }

  const dbOrder = await tx.order.findFirst({
    where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
    select: { id: true },
  });

  if (dbOrder) {
    const newState = await tx.negotiationState.create({
      data: {
        orderId: dbOrder.id,
        version: 1,
        status: 'quoted',
        isFinalOffer: false,
        retailerConfirmed: false,
        wholesalerConfirmed: false,
        activeProposedPrices: {},
        activeProposedQuantities: {},
      },
    });

    return {
      ...newState,
      activeProposedPrices: {},
      activeProposedQuantities: {},
      isPersisted: true,
    };
  }

  const memoryState = IN_MEMORY_NEGOTIATION_STATES[orderId] || buildDefaultNegotiationState(orderId);
  IN_MEMORY_NEGOTIATION_STATES[orderId] = memoryState;
  return memoryState;
}

export class ChatService {
  /**
   * Helper to format standard Socket.io room name for an order channel.
   */
  static getOrderRoomName(orderId: string): string {
    return `order:${orderId}`;
  }

  /**
   * Verify if a user is an authorized participant (either retailer or wholesaler) on an order.
   */
  static async verifyOrderParticipant(orderId: string, userId: string) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { id: orderId },
            { orderNumber: orderId },
          ],
        },
        include: {
          retailer: true,
          wholesaler: true,
          connection: true,
        },
      });

      if (order) {
        const isRetailer = order.retailerId === userId;
        const isWholesaler = order.wholesalerId === userId;
        const isAuthorized = isRetailer || isWholesaler;

        return {
          isAuthorized,
          orderId: order.id,
          orderNumber: order.orderNumber,
          connectionId: order.connectionId,
          orderStatus: order.orderStatus,
          role: isRetailer ? ('retailer' as SenderUserType) : ('wholesaler' as SenderUserType),
          isRetailer,
          isWholesaler,
          retailerName: order.retailer.businessName || order.retailer.phoneNumber,
          wholesalerName: order.wholesaler.businessName || order.wholesaler.phoneNumber,
        };
      }
    } catch (dbErr) {
      Logger.warn(`[ChatService] Database query fell back for order ${orderId}:`, dbErr);
    }

    const safeOrderId = orderId || 'ORD-DEFAULT';
    const state = await getOrCreateConfirmationState(safeOrderId);



    // Fallback for mock/demo orders in development
    return {
      isAuthorized: true,
      orderId: safeOrderId,
      orderNumber: safeOrderId.startsWith('ORD-') ? safeOrderId : `ORD-${safeOrderId}`,
      connectionId: `conn-${safeOrderId}`,
      orderStatus: state.status === 'deal_locked' ? 'deal_locked' : 'negotiating',

      role: 'retailer' as SenderUserType,
      isRetailer: true,
      isWholesaler: false,
      retailerName: 'Demo Retail Kirana Store',
      wholesalerName: 'Gupta Wholesale Agro & Grains',
    };
  }

  /**
   * Save a chat message to Prisma (with fallback to in-memory store).
   */
  static async saveMessage(params: {
    orderId: string;
    senderUserId: string;
    senderUserType: SenderUserType;
    senderName?: string;
    messageText: string;
    messageType?: MessageType;
    fileAttachments?: any;
  }, tx?: Prisma.TransactionClient): Promise<ChatMessageDto> {
    const { orderId, senderUserId, senderUserType, senderName, messageText, messageType = 'text', fileAttachments } = params;
    // Reuse the caller's transaction connection when provided. A deal lock already
    // holds a FOR UPDATE row lock on the order/connection inside its transaction;
    // persisting the system message on a separate pooled connection would then make
    // the chat-message FK (FOR KEY SHARE) block on that same transaction -> deadlock.
    const client = tx ?? prisma;

    // Verify order participant
    const verification = await this.verifyOrderParticipant(orderId, senderUserId);
    const resolvedOrderId = verification.orderId;
    const resolvedConnectionId = verification.connectionId;

    try {
      // 1. Try persisting via Prisma
      const created = await client.chatMessage.create({
        data: {
          orderId: resolvedOrderId,
          connectionId: resolvedConnectionId,
          senderUserId,
          senderUserType,
          messageType,
          messageText,
          fileAttachments: fileAttachments || null,
          isDelivered: true,
          deliveredAt: new Date(),
        },
        include: {
          senderUser: true,
        },
      });

      const dto: ChatMessageDto = {
        id: created.id,
        orderId: resolvedOrderId,
        connectionId: created.connectionId,
        senderUserId: created.senderUserId,
        senderUserType: created.senderUserType,
        senderName: created.senderUser?.businessName || senderName || 'User',
        messageType: created.messageType,
        messageText: created.messageText || '',
        fileAttachments: created.fileAttachments,
        isDelivered: created.isDelivered,
        deliveredAt: created.deliveredAt?.toISOString() || null,
        createdAt: created.createdAt.toISOString(),
      };

      if (!IN_MEMORY_MESSAGES[resolvedOrderId]) {
        IN_MEMORY_MESSAGES[resolvedOrderId] = [];
      }
      IN_MEMORY_MESSAGES[resolvedOrderId].push(dto);

      return dto;
    } catch (err) {
      // 2. In-memory fallback if database write fails in local offline environment
      const fallbackId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const dto: ChatMessageDto = {
        id: fallbackId,
        orderId: resolvedOrderId,
        connectionId: resolvedConnectionId,
        senderUserId,
        senderUserType,
        senderName: senderName || (senderUserType === 'retailer' ? 'Retailer' : 'Wholesaler'),
        messageType,
        messageText,
        fileAttachments,
        isDelivered: true,
        deliveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      if (!IN_MEMORY_MESSAGES[resolvedOrderId]) {
        IN_MEMORY_MESSAGES[resolvedOrderId] = [];
      }
      IN_MEMORY_MESSAGES[resolvedOrderId].push(dto);

      return dto;
    }
  }

  /**
   * Submit a bilateral rate proposal or counter-offer with minimum margin validation.
   */
  static async proposeRate(params: {
    orderId: string;
    userId: string;
    userType: SenderUserType;
    userName?: string;
    items: LineItemRateProposal[];
    proposedDiscountPercent?: number;
    clientVersion?: number;
    isFinalOffer?: boolean;
    notes?: string;
  }): Promise<RateProposalResult> {
    const { orderId, userId, userType, userName, items, notes } = params;

    // 1. Verify participant
    const verification = await this.verifyOrderParticipant(orderId, userId);
    if (!verification.isAuthorized) {
      throw new AppError(AppErrorCode.FORBIDDEN, 'Unauthorized: User is not a participant in this order', 403);
    }
  
    if (verification.orderStatus !== 'negotiating') {
      throw new AppError(
        AppErrorCode.CONFLICT,
        `Cannot negotiate rate on order with status: "${verification.orderStatus}"`,
        409
      );
    }
  
    const resolvedOrderId = verification.orderId;
  
    return await prisma.$transaction(async (tx) => {
      const proposalId = `prop-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const state = await getLockedConfirmationState(tx, resolvedOrderId);
  
      // Precondition 1: Cannot propose rate if order is already locked
      if (state.status === 'deal_locked') {
        throw new AppError(AppErrorCode.CONFLICT, 'Order pricing is already locked into an immutable contract', 409);
      }
  
      // Precondition 2: If final offer was previously locked, no further proposals allowed
      if (state.isFinalOffer) {
        throw new AppError(
          AppErrorCode.CONFLICT,
          'Final offer has been locked for this order. No further counter-offers or rate changes are permitted.',
          409
        );
      }
  
      // Edge Case 1: Optimistic Locking / Concurrent Edits Collision Check
      if (params.clientVersion !== undefined && params.clientVersion !== state.version) {
        throw new AppError(
          AppErrorCode.OPTIMISTIC_LOCK_ERROR,
          `OptimisticLockError: Conflicting rate edit detected! Another party updated the proposal concurrently (version mismatch: client=${params.clientVersion}, server=${state.version}). Please reload the latest offer.`,
          409
        );
      }
      // Synchronously increment version to block concurrent race-condition requests
      state.version += 1;
  
      // Persist state update to DB (real orders only; demo orders use in-memory state)
      if (state.isPersisted) {
        await tx.negotiationState.update({
          where: { orderId: resolvedOrderId },
          data: {
            version: state.version,
          },
        });
      }
  
      // 2. Fetch order items (Prisma or fallback demo list)
      let orderItemsData: Array<DemoOrderItem> = [];

    try {
      const dbOrder = await tx.order.findFirst({
        where: {
          OR: [{ id: resolvedOrderId }, { orderNumber: resolvedOrderId }],
        },
        include: {
          orderItems: {
            include: {
              product: true,
              wholesalerProduct: true,
            },
          },
        },
      });

      if (dbOrder && dbOrder.orderItems.length > 0) {
        orderItemsData = dbOrder.orderItems.map((oi) => ({
          id: oi.id,
          productId: oi.productId,
          productName: oi.product.productName,
          quantity: oi.quantity,
          quotedUnitPrice: oi.quotedUnitPrice
            ? Number(oi.quotedUnitPrice)
            : oi.wholesalerProduct
            ? Number(oi.wholesalerProduct.basePrice)
            : 0,
          marginFloor: oi.wholesalerProduct
            ? (oi.wholesalerProduct.marginFloorPrice != null
                ? Number(oi.wholesalerProduct.marginFloorPrice)
                : Math.round(Number(oi.wholesalerProduct.basePrice) * 0.7 * 100) / 100)
            : undefined,
          moq: oi.wholesalerProduct?.minimumOrderQuantity ?? 10,
          godownStock: 100,
        }));
      }
    } catch (e) {
      Logger.warn(`[ChatService] Database query failed, checking demo order items for ${orderId}`, { error: e });
    }

    if (orderItemsData.length === 0) {
      orderItemsData = (DEMO_ORDER_ITEMS[orderId] || DEMO_ORDER_ITEMS[verification.orderNumber] || [
        { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00, marginFloor: 380.00, moq: 10, godownStock: 140 },
        { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00, marginFloor: 400.00, moq: 10, godownStock: 65 },
        { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
      ]).map((di) => ({ ...di }));
    }

    // 3. Margin Guardrail & MOQ & Stock Validation & Item Proposals Compilation
    let totalOrderOriginalSubtotal = 0;
    let totalOrderProposedSubtotal = 0;
    let hasStockExhausted = false;
    let stockWarningMsg: string | null = null;
    const proposalItemDetails: RateProposalItemDetail[] = [];
    const contestedItemIds = new Set<string>();

    for (const proposalItem of items) {
      const found = orderItemsData.find((oi) => oi.id === proposalItem.orderItemId || oi.productId === proposalItem.orderItemId);
      if (!found) {
        throw new AppError(AppErrorCode.NOT_FOUND, `Order item "${proposalItem.orderItemId}" not found in this restock order`, 404);
      }
      contestedItemIds.add(found.id);
      contestedItemIds.add(found.productId);

      const originalUnitPrice = found.quotedUnitPrice;
      const proposedUnitPrice = Number(proposalItem.proposedUnitPrice);

      // Edge Case 3: Invalid Price Boundaries (zero or negative)
      if (isNaN(proposedUnitPrice) || proposedUnitPrice <= 0) {
        throw new AppError(
          AppErrorCode.UNPROCESSABLE_ENTITY,
          `InvalidPriceError: Proposed unit price for "${found.productName}" must be strictly greater than zero (received ₹${proposalItem.proposedUnitPrice})`,
          422
        );
      }

      // Edge Case 3: Margin Floor Enforcement
      const marginFloor = found.marginFloor ?? Math.round(originalUnitPrice * 0.65 * 100) / 100;
      if (proposedUnitPrice < marginFloor) {
        throw new AppError(
          AppErrorCode.MARGIN_FLOOR_BREACH,
          `MarginFloorBreachError: Proposed rate ₹${proposedUnitPrice.toFixed(2)} for "${found.productName}" breaches the wholesaler margin floor of ₹${marginFloor.toFixed(2)}.`,
          422
        );
      }

      // Edge Case 8: MOQ (Minimum Order Quantity) Enforcement
      if (proposalItem.proposedQuantity !== undefined) {
        const proposedQty = proposalItem.proposedQuantity;
        const minMoq = found.moq ?? 10;
        if (proposedQty < minMoq) {
          throw new AppError(
            AppErrorCode.MOQ_BREACH,
            `MoqBreachError: Proposed quantity (${proposedQty}) breaches minimum order quantity (MOQ: ${minMoq} units) for "${found.productName}".`,
            422
          );
        }
        found.quantity = proposedQty;
        state.activeProposedQuantities[found.id] = proposedQty;
      }

      // Edge Case 2: Stock Reservation Depletion Check
      const effectiveQty = state.activeProposedQuantities[found.id] ?? found.quantity;
      const godownAvailable = found.godownStock ?? 100;
      const isStockSufficient = godownAvailable >= effectiveQty;

      if (!isStockSufficient) {
        hasStockExhausted = true;
        stockWarningMsg = `Stock Exhausted: Wholesaler warehouse stock for "${found.productName}" is only ${godownAvailable} units (Requested: ${effectiveQty} units). Accept action is locked until stock is replenished.`;
      }

      const originalLineTotal = originalUnitPrice * effectiveQty;
      const proposedLineTotal = proposedUnitPrice * effectiveQty;
      const unitPriceDiff = originalUnitPrice - proposedUnitPrice;
      const lineSavings = originalLineTotal - proposedLineTotal;

      totalOrderOriginalSubtotal += originalLineTotal;
      totalOrderProposedSubtotal += proposedLineTotal;

      proposalItemDetails.push({
        orderItemId: found.id,
        productId: found.productId,
        productName: found.productName,
        quantity: effectiveQty,
        originalUnitPrice,
        proposedUnitPrice,
        originalLineTotal,
        proposedLineTotal,
        unitPriceDiff,
        lineSavings,
        isContested: true,
        status: 'contested',
        godownStock: godownAvailable,
        isStockSufficient,
        moq: found.moq,
      });

      // Update active proposed price in state
      state.activeProposedPrices[found.id] = proposedUnitPrice;

      // Record in OrderPriceHistory
      const historyEntry: OrderPriceHistoryDto = {
        id: `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        orderId: resolvedOrderId,
        orderItemId: found.id,
        productName: found.productName,
        changedByUserId: userId,
        changeType: params.isFinalOffer
          ? 'final_offer_locked'
          : userType === 'retailer'
          ? 'retailer_counter_offer'
          : 'wholesaler_rate_proposal',
        previousPrice: originalUnitPrice,
        newPrice: proposedUnitPrice,
        notes: proposalItem.reason || notes || (params.isFinalOffer ? 'Final take-it-or-leave-it offer' : null),
        createdAt: new Date().toISOString(),
      };

      if (!IN_MEMORY_PRICE_HISTORY[resolvedOrderId]) {
        IN_MEMORY_PRICE_HISTORY[resolvedOrderId] = [];
      }
      IN_MEMORY_PRICE_HISTORY[resolvedOrderId].unshift(historyEntry);
    }

    // Process uncontested items: they remain locked at their current active or quoted price
    for (const oi of orderItemsData) {
      if (!contestedItemIds.has(oi.id) && !contestedItemIds.has(oi.productId)) {
        const lockedUnitPrice = state.activeProposedPrices[oi.id] ?? oi.quotedUnitPrice;
        const effectiveQty = state.activeProposedQuantities[oi.id] ?? oi.quantity;
        const originalUnitPrice = oi.quotedUnitPrice;
        const originalLineTotal = originalUnitPrice * effectiveQty;
        const proposedLineTotal = lockedUnitPrice * effectiveQty;
        const lineSavings = originalLineTotal - proposedLineTotal;

        totalOrderOriginalSubtotal += originalLineTotal;
        totalOrderProposedSubtotal += proposedLineTotal;

        proposalItemDetails.push({
          orderItemId: oi.id,
          productId: oi.productId,
          productName: oi.productName,
          quantity: effectiveQty,
          originalUnitPrice,
          proposedUnitPrice: lockedUnitPrice,
          originalLineTotal,
          proposedLineTotal,
          unitPriceDiff: originalUnitPrice - lockedUnitPrice,
          lineSavings,
          isContested: false,
          status: 'locked',
          godownStock: oi.godownStock,
          isStockSufficient: (oi.godownStock ?? 100) >= effectiveQty,
          moq: oi.moq,
        });
      }
    }

    const previousSubtotal = totalOrderOriginalSubtotal;
    const proposedSubtotal = totalOrderProposedSubtotal;
    const totalSavings = previousSubtotal - proposedSubtotal;
    const contestedItemsCount = items.length;
    const uncontestedItemsCount = orderItemsData.length - items.length;

    // Requirement 1: State Machine Transition (DO NOT AUTO-LOCK!)
    state.status = (params.isFinalOffer ? 'final_offer_locked' : 'rate_proposed') as any;
    state.isFinalOffer = Boolean(params.isFinalOffer);
    state.lastProposerUserId = userId;
  
    // Proposer accepts their own offer; counterparty must explicitly choose to Accept or Counter
    if (userType === 'retailer') {
      state.retailerConfirmed = true;
      state.wholesalerConfirmed = false;
    } else {
      state.wholesalerConfirmed = true;
      state.retailerConfirmed = false;
    }
  
    // Persist final state transition to DB (real orders only)
    if (state.isPersisted) {
      await tx.negotiationState.update({
        where: { orderId: resolvedOrderId },
        data: {
          status: state.status as any,
          isFinalOffer: state.isFinalOffer,
          lastProposerUserId: state.lastProposerUserId,
          retailerConfirmed: state.retailerConfirmed,
          wholesalerConfirmed: state.wholesalerConfirmed,
          activeProposedPrices: state.activeProposedPrices,
          activeProposedQuantities: state.activeProposedQuantities,
        },
      });
    }
  
    const senderDisplayName: string = userName || (userType === 'retailer' ? verification.retailerName : verification.wholesalerName) || (userType === 'retailer' ? 'Retailer' : 'Wholesaler');
  
    // Generate structured system Chat Message
    const offerLabel = params.isFinalOffer ? '🔒 FINAL TAKE-IT-OR-LEAVE-IT OFFER' : 'proposed a counter-offer';
    const contestedNames = items.map(pi => {
      const it = orderItemsData.find(oi => oi.id === pi.orderItemId || oi.productId === pi.orderItemId);
      return it ? it.productName.split(' ')[0] : 'Item';
    }).join(' & ');
  
    const summaryText = uncontestedItemsCount > 0
      ? `${senderDisplayName} ${offerLabel} on ${contestedItemsCount} item(s) [${contestedNames}] while ${uncontestedItemsCount} item(s) remain locked. Recalculated Order Total: ₹${proposedSubtotal.toLocaleString('en-IN')} (saves ₹${totalSavings.toLocaleString('en-IN')}). Pending response.`
      : `${senderDisplayName} ${offerLabel} across all ${contestedItemsCount} items. Recalculated Order Total: ₹${proposedSubtotal.toLocaleString('en-IN')} (saves ₹${totalSavings.toLocaleString('en-IN')}). Pending response.`;
  
    const systemMessage = await this.saveMessage({
      orderId: resolvedOrderId,
      senderUserId: userId,
      senderUserType: userType,
      senderName: senderDisplayName,
      messageType: 'system',
      messageText: summaryText,
      fileAttachments: {
        type: 'rate_proposal',
        proposalId,
        version: state.version,
        isFinalOffer: state.isFinalOffer,
        proposerUserId: userId,
        proposerName: senderDisplayName,
        proposerRole: userType,
        items: proposalItemDetails,
        previousSubtotal,
        proposedSubtotal,
        totalSavings,
        contestedItemsCount,
        uncontestedItemsCount,
        stockWarning: stockWarningMsg,
        stockExhausted: hasStockExhausted,
        notes: notes || null,
        status: state.status as any,
        timestamp: new Date().toISOString(),
      },
    }, tx);
  
    return {
      proposalId,
      orderId: resolvedOrderId,
      orderNumber: verification.orderNumber,
      version: state.version,
      status: state.status as any,
      isFinalOffer: state.isFinalOffer,
      proposerUserId: userId,
      proposerName: senderDisplayName,
      proposerRole: userType,
      items: proposalItemDetails,
      previousSubtotal,
      proposedSubtotal,
      totalSavings,
      orderTotalAmount: proposedSubtotal,
      contestedItemsCount,
      uncontestedItemsCount,
      stockWarning: stockWarningMsg,
      stockExhausted: hasStockExhausted,
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
      systemMessage,
    };
  });
}

  /**
   * Mutual Bilateral Rate Confirmation & Deal Locking Mechanism.
   * Requires matching confirmation from both retailer and wholesaler.
   * Implements Row-Level Locking to prevent race conditions during deal lock.
   */
  static async confirmRate(params: {
    orderId: string;
    userId: string;
    userType: SenderUserType;
    userName?: string;
    clientVersion?: number;
    notes?: string;
  }): Promise<RateLockResult> {
    const { orderId, userId, userType, userName, notes } = params;
  
    // 1. Verify participant (Read-only, outside transaction)
    const verification = await this.verifyOrderParticipant(orderId, userId);
    if (!verification.isAuthorized) {
      throw new AppError(AppErrorCode.FORBIDDEN, 'Unauthorized: User is not a participant in this order', 403);
    }
  
    const resolvedOrderId = verification.orderId;
  
    return await prisma.$transaction(async (tx) => {
      // 2. Lock the negotiation state row to prevent concurrent confirms
      const state = await getLockedConfirmationState(tx, resolvedOrderId);
  
      if (state.status === 'deal_locked') {
        throw new AppError(AppErrorCode.CONFLICT, 'Order pricing is already locked into an immutable contract', 409);
      }
  
      // Edge Case 1: Optimistic Locking / Concurrent Confirms Check
      if (params.clientVersion !== undefined && params.clientVersion !== state.version) {
        throw new AppError(
          AppErrorCode.OPTIMISTIC_LOCK_ERROR,
          `OptimisticLockError: Conflicting rate edit detected! The offer was modified concurrently (version mismatch: client=${params.clientVersion}, server=${state.version}). Please reload the latest offer before accepting.`,
          409
        );
      }
      
      // P1.6: Terminal-state guard. An order that has already progressed past
      // negotiation (dispatched / delivered / cancelled / rejected, etc.) can never
      // be re-confirmed or re-locked. Enforced for persisted (real) orders only.
      if (state.isPersisted) {
        const lifecycleSnapshot = await tx.order.findUnique({
          where: { id: resolvedOrderId },
          select: { orderStatus: true, lifecycleStatus: true },
        });
        if (lifecycleSnapshot) {
          const terminalLifecycle: string[] = ['dispatched', 'delivered', 'partially_fulfilled', 'cancelled', 'rejected'];
          const terminalLegacy: string[] = ['dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled'];
          if (
            terminalLifecycle.includes(lifecycleSnapshot.lifecycleStatus) ||
            terminalLegacy.includes(lifecycleSnapshot.orderStatus)
          ) {
            throw new AppError(
              AppErrorCode.CONFLICT,
              `Cannot accept & lock: this order has already progressed to "${lifecycleSnapshot.lifecycleStatus}" and is no longer open for negotiation.`,
              409,
              { lifecycleStatus: lifecycleSnapshot.lifecycleStatus, orderStatus: lifecycleSnapshot.orderStatus },
            );
          }
        }
      }

      // Advance version
      state.version += 1;
  
      // Persist version bump (real orders only)
      if (state.isPersisted) {
        await tx.negotiationState.update({
          where: { orderId: resolvedOrderId },
          data: { version: state.version },
        });
      }
  
      // 3. Fetch order items to compute current locked snapshot
      let orderItemsData: Array<DemoOrderItem> = [];
      let hasPersistedOrderItems = false;
  
      try {
        const dbOrder = await tx.order.findFirst({
          where: { OR: [{ id: resolvedOrderId }, { orderNumber: resolvedOrderId }] },
          include: { orderItems: { include: { product: true } } },
        });
  
        if (dbOrder && dbOrder.orderItems.length > 0) {
          hasPersistedOrderItems = true;
          orderItemsData = dbOrder.orderItems.map((oi) => ({
            id: oi.id,
            productId: oi.productId,
            productName: oi.product.productName,
            quantity: state.activeProposedQuantities[oi.id] ?? oi.quantity,
            quotedUnitPrice: state.activeProposedPrices[oi.id] ?? (oi.quotedUnitPrice ? Number(oi.quotedUnitPrice) : 0),
            godownStock: 100,
          }));
        }
      } catch (e) {
        // Fallback for demo resilience
      }
  
      if (orderItemsData.length === 0) {
        const demoItems = DEMO_ORDER_ITEMS[orderId] || DEMO_ORDER_ITEMS[verification.orderNumber] || [
          { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00, marginFloor: 380.00, moq: 10, godownStock: 140 },
          { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00, marginFloor: 400.00, moq: 10, godownStock: 65 },
          { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00, marginFloor: 118.00, moq: 24, godownStock: 80 },
        ];
  
        orderItemsData = demoItems.map((di) => ({
          id: di.id,
          productId: di.productId,
          productName: di.productName,
          quantity: state.activeProposedQuantities[di.id] ?? di.quantity,
          quotedUnitPrice: state.activeProposedPrices[di.id] ?? di.quotedUnitPrice,
          godownStock: di.godownStock ?? 100,
        }));
      }
  
      // Edge Case 2: Stock Reservation Depletion Check on Accept
      for (const item of orderItemsData) {
        const effectiveQty = state.activeProposedQuantities[item.id] ?? item.quantity;
        const godownStock = item.godownStock ?? 100;
        if (godownStock < effectiveQty) {
          throw new AppError(
            AppErrorCode.STOCK_EXHAUSTED,
            `StockExhaustedError: Cannot accept offer! Wholesaler godown stock is depleted for "${item.productName}" (Available: ${godownStock}, Requested: ${effectiveQty}). Wholesaler stock replenishment is required.`,
            409
          );
        }
      }
  
      const lockedItemSnapshots: RateLockItemSnapshot[] = orderItemsData.map((item) => ({
        orderItemId: item.id,
        productName: item.productName,
        quantity: item.quantity,
        finalUnitPrice: item.quotedUnitPrice,
        lineTotal: item.quotedUnitPrice * item.quantity,
      }));
  
      const finalPrice = lockedItemSnapshots.reduce((acc, curr) => acc + curr.lineTotal, 0);
  
      // 4. Mark current participant's confirmation
      if (userType === 'retailer') {
        state.retailerConfirmed = true;
      } else {
        state.wholesalerConfirmed = true;
      }
  
      // Persist confirmation (real orders only)
      if (state.isPersisted) {
        await tx.negotiationState.update({
          where: { orderId: resolvedOrderId },
          data: {
            retailerConfirmed: state.retailerConfirmed,
            wholesalerConfirmed: state.wholesalerConfirmed,
          },
        });
      }
  
      const senderDisplayName: string = userName || (userType === 'retailer' ? verification.retailerName : verification.wholesalerName) || (userType === 'retailer' ? 'Retailer' : 'Wholesaler');
  
      // 5. Check if Bilateral Agreement is reached (BOTH confirmed)
      const isBothConfirmed = state.retailerConfirmed && state.wholesalerConfirmed;
  
      if (isBothConfirmed) {
        state.status = 'deal_locked';
        const lockedAt = new Date().toISOString();
  
        // Update Database records (real orders only)
        if (state.isPersisted) {
          await tx.negotiationState.update({
            where: { orderId: resolvedOrderId },
            data: { status: 'deal_locked' },
          });
  
          await tx.order.update({
            where: { id: resolvedOrderId },
            data: {
              orderStatus: 'deal_locked',
              finalPrice,
              finalPriceEnteredAt: new Date(),
              finalPriceAcceptedAt: new Date(),
            },
          });

          // A mutually confirmed, persisted rate lock completes the OMS acceptance
          // step for orders that have already been submitted through the cart flow.
          if (userType === 'retailer' || userType === 'wholesaler') {
            const lifecycleOrder = await tx.order.findUnique({
              where: { id: resolvedOrderId },
              select: { lifecycleStatus: true },
            });
            if (lifecycleOrder?.lifecycleStatus === 'submitted') {
              await transitionOrderLifecycleInTransaction(tx, {
                orderId: resolvedOrderId,
                toStatus: 'accepted',
                actorUserId: userId,
                actorRole: userType,
                reason: {
                  code: 'bilateral_rate_locked',
                  message: 'Both trading parties confirmed the negotiated order prices',
                },
                expectedFromStatus: 'submitted',
              });
            }
          }
  
          if (hasPersistedOrderItems) {
            for (const item of lockedItemSnapshots) {
              await tx.orderItem.update({
                where: { id: item.orderItemId },
                data: {
                  finalUnitPrice: item.finalUnitPrice,
                  lineTotal: item.lineTotal,
                  priceLockedAt: new Date(),
                },
              });
            }
          }
        }
  
        // Record in price history
        const lockAudit: OrderPriceHistoryDto = {
          id: `lock-${Date.now()}`,
          orderId: resolvedOrderId,
          changedByUserId: userId,
          changeType: 'deal_locked',
          newPrice: finalPrice,
          notes: notes || 'Bilateral Rate Locked by mutual confirmation',
          createdAt: new Date().toISOString(),
        };
        if (!IN_MEMORY_PRICE_HISTORY[resolvedOrderId]) {
          IN_MEMORY_PRICE_HISTORY[resolvedOrderId] = [];
        }
        IN_MEMORY_PRICE_HISTORY[resolvedOrderId].unshift(lockAudit);
  
        // Celebratory System Message
        const systemMessage = await this.saveMessage({
          orderId: resolvedOrderId,
          senderUserId: userId,
          senderUserType: userType,
          senderName: senderDisplayName,
          messageType: 'system',
          messageText: `🤝 BILATERAL RATE LOCKED! Both parties confirmed agreed rates. Order total: ₹${finalPrice.toLocaleString('en-IN')}. Frozen for delivery dispatch.`,
          fileAttachments: {
            type: 'deal_locked',
            finalPrice,
            lockedAt: lockedAt,
            lockedItems: lockedItemSnapshots,
            notes: notes || null,
          },
        }, tx);
  
        return {
          orderId: resolvedOrderId,
          orderNumber: verification.orderNumber,
          version: state.version,
          orderStatus: 'deal_locked',
          isDealLocked: true,
          retailerConfirmed: state.retailerConfirmed,
          wholesalerConfirmed: state.wholesalerConfirmed,
          finalPrice,
          lockedAt,
          confirmedBy: {
            userId,
            role: userType,
            name: senderDisplayName,
          },
          lockedItems: lockedItemSnapshots,
          systemMessage,
        };
      }

      // Pending counterparty confirmation
      const counterpartRole = userType === 'retailer' ? 'wholesaler' : 'retailer';
      const pendingSystemMessage = await this.saveMessage({
        orderId: resolvedOrderId,
        senderUserId: userId,
        senderUserType: userType,
        senderName: senderDisplayName,
        messageType: 'system',
        messageText: `✍️ ${senderDisplayName} confirmed agreed rate (₹${finalPrice.toLocaleString('en-IN')}). Awaiting ${counterpartRole} confirmation to seal the deal.`,
        fileAttachments: {
          type: 'rate_confirmation_pending',
          proposerRole: userType,
          finalPrice,
          retailerConfirmed: state.retailerConfirmed,
          wholesalerConfirmed: state.wholesalerConfirmed,
        },
      }, tx);

      return {
        orderId: resolvedOrderId,
        orderNumber: verification.orderNumber,
        version: state.version,
        orderStatus: 'negotiating',
        isDealLocked: false,
        retailerConfirmed: state.retailerConfirmed,
        wholesalerConfirmed: state.wholesalerConfirmed,
        finalPrice,
        lockedAt: null,
        confirmedBy: {
          userId,
          role: userType,
          name: senderDisplayName,
        },
        lockedItems: lockedItemSnapshots,
        systemMessage: pendingSystemMessage,
      };
    }, { maxWait: 5_000, timeout: 15_000 });
  }

  /**
   * Retrieve current live negotiation state, items, and confirmation status.
   */
  static async getNegotiationStatus(orderId: string, userId: string = ''): Promise<NegotiationStatusResult> {

    const verification = await this.verifyOrderParticipant(orderId, userId);
    const resolvedOrderId = verification.orderId;
    const state = await getOrCreateConfirmationState(resolvedOrderId);


    // Fetch items
    let rawItems: Array<{
      id: string;
      productName: string;
      quantity: number;
      quotedUnitPrice: number;
    }> = [];
    let dbOrder: any = null;
  
    try {
      dbOrder = await prisma.order.findFirst({
        where: { OR: [{ id: resolvedOrderId }, { orderNumber: resolvedOrderId }] },
        include: { orderItems: { include: { product: true } } },
      });
  
       if (dbOrder && dbOrder.orderItems.length > 0) {
         rawItems = dbOrder.orderItems.map((oi: any) => ({
           id: oi.id,
          productName: oi.product.productName,
          quantity: oi.quantity,
          quotedUnitPrice: oi.quotedUnitPrice ? Number(oi.quotedUnitPrice) : 0,
        }));
      }
    } catch (e) {
      // Fallback
    }

    if (rawItems.length === 0) {
      const demoItems = DEMO_ORDER_ITEMS[orderId] || DEMO_ORDER_ITEMS[verification.orderNumber] || [
        { id: 'item-01', productId: 'p-001', productName: 'Aashirvaad Shudh Chakki Atta 10kg', quantity: 25, quotedUnitPrice: 420.00 },
        { id: 'item-02', productId: 'p-004', productName: 'India Gate Basmati Rice Feast Rozzana 5kg', quantity: 15, quotedUnitPrice: 460.00 },
        { id: 'item-03', productId: 'p-002', productName: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', quantity: 30, quotedUnitPrice: 128.00 },
      ];

      rawItems = demoItems.map((di) => ({
        id: di.id,
        productName: di.productName,
        quantity: di.quantity,
        quotedUnitPrice: di.quotedUnitPrice,
      }));
    }

    let catalogSubtotal = 0;
    let currentSubtotal = 0;

    const items = rawItems.map((item) => {
      const catalogPrice = item.quotedUnitPrice;
      const activePrice = state.activeProposedPrices[item.id] ?? catalogPrice;
      const isPriceModified = activePrice !== catalogPrice;

      catalogSubtotal += catalogPrice * item.quantity;
      currentSubtotal += activePrice * item.quantity;

      return {
        orderItemId: item.id,
        productName: item.productName,
        quantity: item.quantity,
        quotedUnitPrice: catalogPrice,
        activeProposedPrice: activePrice,
        lineTotal: activePrice * item.quantity,
        isPriceModified,
        gstRate: InvoiceService.getHsnAndGstRate(item.productName).gstRate,
      };
    });

    return {
      orderId: resolvedOrderId,
      orderNumber: verification.orderNumber,
      version: state.version,
      status: state.status as any,
      isFinalOffer: state.isFinalOffer,
      orderStatus: state.status === 'deal_locked' ? 'deal_locked' : verification.orderStatus,
      retailerConfirmed: state.retailerConfirmed,
      wholesalerConfirmed: state.wholesalerConfirmed,
      isDealLocked: state.status === 'deal_locked',
      currentSubtotal,
      catalogSubtotal,
      finalPrice: dbOrder?.finalPrice ? Number(dbOrder.finalPrice) : null,
      lockedAt: dbOrder?.finalPriceAcceptedAt?.toISOString() || null,
      retailerName: verification.retailerName || 'Retailer',
      wholesalerName: verification.wholesalerName || 'Wholesaler',
      items,
    };
  }

  /**
   * Retrieve price negotiation history / audit trail for an order.
   */
  static async getOrderPriceHistory(orderId: string): Promise<OrderPriceHistoryDto[]> {
    try {
      const records = await prisma.orderPriceHistory.findMany({
        where: { orderId },
        include: {
          orderItem: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (records.length > 0) {
        return records.map((r) => ({
          id: r.id,
          orderId: r.orderId || orderId,
          orderItemId: r.orderItemId,
          productName: r.orderItem?.product.productName || null,
          changedByUserId: r.changedByUserId,
          changeType: r.changeType,
          previousPrice: r.previousPrice ? Number(r.previousPrice) : null,
          newPrice: r.newPrice ? Number(r.newPrice) : null,
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
        }));
      }
    } catch (e) {
      Logger.warn(`[ChatService] Failed to fetch price history from DB for ${orderId}:`, e);
    }

    return IN_MEMORY_PRICE_HISTORY[orderId] || [];
  }

  /**
   * Retrieve message history for an order with chronological sorting and pagination.
   */
  static async getOrderMessages(orderId: string, limit = 50, before?: string): Promise<ChatMessageDto[]> {
    try {
      const messages = await prisma.chatMessage.findMany({
        where: {
          orderId,
          createdAt: before ? { lt: new Date(before) } : undefined,
        },
        include: {
          senderUser: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: limit,
      });

      if (messages.length > 0) {
        return messages.map((m) => ({
          id: m.id,
          orderId: m.orderId || orderId,
          connectionId: m.connectionId,
          senderUserId: m.senderUserId,
          senderUserType: m.senderUserType,
          senderName: m.senderUser?.businessName || (m.senderUserType === 'retailer' ? 'Retailer' : 'Wholesaler'),
          messageType: m.messageType,
          messageText: m.messageText || '',
          fileAttachments: m.fileAttachments,
          isDelivered: m.isDelivered,
          deliveredAt: m.deliveredAt?.toISOString() || null,
          createdAt: m.createdAt.toISOString(),
        }));
      }
    } catch (err) {
      Logger.warn(`[ChatService] Could not read from database for order ${orderId}:`, err);
    }

    // Fallback to in-memory messages or default seed negotiation history
    const existing = IN_MEMORY_MESSAGES[orderId];
    if (existing && existing.length > 0) {
      return existing;
    }

    // Initial mock negotiation conversation for instant live demo experience
    const initialSeed: ChatMessageDto[] = [
      {
        id: `seed-1-${orderId}`,
        orderId,
        connectionId: `conn-${orderId}`,
        senderUserId: 'w-101',
        senderUserType: 'wholesaler',
        senderName: 'Gupta Wholesale Agro & Grains',
        messageType: 'text',
        messageText: 'Namaste! Received your restock draft order. Looking at your 25 bags of Atta and 15 bags of Rice.',
        isDelivered: true,
        deliveredAt: new Date(Date.now() - 3600000).toISOString(),
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: `seed-2-${orderId}`,
        orderId,
        connectionId: `conn-${orderId}`,
        senderUserId: 'ret-001',
        senderUserType: 'retailer',
        senderName: 'Sharma Kirana Store',
        messageType: 'text',
        messageText: 'Namaste Gupta ji. If I take 25 bags of Atta and 15 bags of Rice, can we do ₹410 per bag for Atta?',
        isDelivered: true,
        deliveredAt: new Date(Date.now() - 1800000).toISOString(),
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: `seed-3-${orderId}`,
        orderId,
        connectionId: `conn-${orderId}`,
        senderUserId: 'w-101',
        senderUserType: 'wholesaler',
        senderName: 'Gupta Wholesale Agro & Grains',
        messageType: 'text',
        messageText: 'I can offer ₹410 per bag for Atta with free local van delivery. Let us confirm and lock this rate.',
        isDelivered: true,
        deliveredAt: new Date(Date.now() - 900000).toISOString(),
        createdAt: new Date(Date.now() - 900000).toISOString(),
      },
    ];

    IN_MEMORY_MESSAGES[orderId] = [...initialSeed];
    return initialSeed;
  }
}
