import { OrderLifecycleStatus, Prisma, UserType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { LedgerService } from '../ledger/ledger.service';

export const orderTransitionReasonSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[a-z0-9_.-]+$/i),
  message: z.string().trim().min(3).max(500),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type OrderTransitionReason = z.infer<typeof orderTransitionReasonSchema>;

export interface TransitionOrderLifecycleInput {
  orderId: string;
  toStatus: OrderLifecycleStatus;
  actorUserId: string | null;
  actorRole: UserType;
  reason: OrderTransitionReason;
  expectedFromStatus?: OrderLifecycleStatus;
  actorSource?: 'authenticated_user' | 'driver_access_token';
  actorReference?: string;
}

type TransitionRule = {
  from: OrderLifecycleStatus;
  to: OrderLifecycleStatus;
  roles: UserType[];
};

const TRANSITION_RULES: TransitionRule[] = [
  { from: 'draft', to: 'submitted', roles: ['retailer'] },
  { from: 'draft', to: 'cancelled', roles: ['retailer', 'wholesaler'] },
  { from: 'submitted', to: 'accepted', roles: ['retailer', 'wholesaler'] },
  { from: 'submitted', to: 'rejected', roles: ['wholesaler'] },
  { from: 'submitted', to: 'cancelled', roles: ['retailer', 'wholesaler'] },
  { from: 'accepted', to: 'picking', roles: ['wholesaler'] },
  { from: 'accepted', to: 'cancelled', roles: ['retailer', 'wholesaler'] },
  { from: 'picking', to: 'dispatched', roles: ['wholesaler'] },
  { from: 'picking', to: 'cancelled', roles: ['wholesaler'] },
  { from: 'dispatched', to: 'delivered', roles: ['driver', 'wholesaler'] },
  { from: 'dispatched', to: 'partially_fulfilled', roles: ['driver', 'wholesaler'] },
  { from: 'partially_fulfilled', to: 'delivered', roles: ['driver', 'wholesaler'] },
];

const REASON_REQUIRED_STATUSES = new Set<OrderLifecycleStatus>([
  'rejected',
  'cancelled',
  'partially_fulfilled',
]);

/** Pure transition and role validator, also usable by UI/API contract tests. */
export function validateOrderTransition(
  from: OrderLifecycleStatus,
  to: OrderLifecycleStatus,
  actorRole: UserType,
  reason: OrderTransitionReason,
): void {
  const rule = TRANSITION_RULES.find((candidate) => candidate.from === from && candidate.to === to);
  if (!rule) {
    throw new AppError(
      AppErrorCode.CONFLICT,
      `Order cannot transition from ${from} to ${to}`,
      409,
      { from, to },
    );
  }

  if (!rule.roles.includes(actorRole)) {
    throw new AppError(AppErrorCode.FORBIDDEN, `Role ${actorRole} cannot transition ${from} to ${to}`, 403);
  }

  if (REASON_REQUIRED_STATUSES.has(to) && !reason.message.trim()) {
    throw new AppError(AppErrorCode.BAD_REQUEST, `A reason is required when transitioning to ${to}`, 400);
  }

  if (to === 'partially_fulfilled' && !reason.details) {
    throw new AppError(
      AppErrorCode.BAD_REQUEST,
      'Partial fulfillment requires structured details describing the fulfilled and outstanding quantities',
      400,
    );
  }
}

/**
 * Transaction-aware transition for use by other domain services. It locks the
 * order row, validates current database state and actor ownership, writes the
 * new lifecycle status, and appends the matching audit event atomically.
 */
export async function transitionOrderLifecycleInTransaction(
  tx: Prisma.TransactionClient,
  input: TransitionOrderLifecycleInput,
) {
  const [lockedOrder] = await tx.$queryRaw<Array<{ order_id: string }>>`
    SELECT order_id
    FROM orders
    WHERE order_id = ${input.orderId}
    FOR UPDATE
  `;

  if (!lockedOrder) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'Order not found', 404);
  }

  const tenantScope: Prisma.OrderWhereInput = input.actorRole === 'retailer'
    ? { retailerId: input.actorUserId ?? '__missing_retailer__' }
    : input.actorRole === 'wholesaler'
      ? { wholesalerId: input.actorUserId ?? '__missing_wholesaler__' }
      : input.actorUserId
        ? { delivery: { driverId: input.actorUserId } }
        : { delivery: { id: input.actorReference ?? '__missing_delivery__' } };

  const [order, actor] = await Promise.all([
    tx.order.findFirst({
      where: { id: input.orderId, ...tenantScope },
      include: {
        delivery: true,
        negotiationState: true,
        orderItems: { select: { id: true, quantity: true, wholesalerProductId: true } },
      },
    }),
    input.actorUserId
      ? tx.user.findUnique({
          where: { id: input.actorUserId },
          select: { id: true, userType: true, isActive: true },
        })
      : Promise.resolve(null),
  ]);

  if (!order) throw new AppError(AppErrorCode.NOT_FOUND, 'Order not found', 404);
  const isTrustedDriverLink =
    !input.actorUserId && input.actorRole === 'driver' &&
    input.actorSource === 'driver_access_token' && Boolean(input.actorReference);
  if (
    (input.actorUserId && (!actor || !actor.isActive || actor.userType !== input.actorRole)) ||
    (!input.actorUserId && !isTrustedDriverLink)
  ) {
    throw new AppError(AppErrorCode.FORBIDDEN, 'Actor identity or role is invalid', 403);
  }

  if (input.expectedFromStatus && input.expectedFromStatus !== order.lifecycleStatus) {
    throw new AppError(
      AppErrorCode.OPTIMISTIC_LOCK_ERROR,
      'Order lifecycle changed; reload the order before retrying',
      409,
      { expected: input.expectedFromStatus, actual: order.lifecycleStatus },
    );
  }

  validateOrderTransition(order.lifecycleStatus, input.toStatus, input.actorRole, input.reason);

  const isParty =
    (input.actorRole === 'retailer' && order.retailerId === input.actorUserId) ||
    (input.actorRole === 'wholesaler' && order.wholesalerId === input.actorUserId);
  const isAssignedDriver =
    input.actorRole === 'driver' && (
      (Boolean(input.actorUserId) && order.delivery?.driverId === input.actorUserId) ||
      (isTrustedDriverLink && order.delivery?.id === input.actorReference)
    );

  if (!isParty && !isAssignedDriver) {
    throw new AppError(AppErrorCode.FORBIDDEN, 'Actor is not authorized for this order', 403);
  }

  if (input.toStatus === 'submitted' && order.orderItems.length === 0) {
    throw new AppError(AppErrorCode.UNPROCESSABLE_ENTITY, 'An empty order cannot be submitted', 422);
  }

  if (input.toStatus === 'submitted' && order.connectionId) {
    const connection = await tx.retailerWholesalerConnection.findUnique({
      where: { id: order.connectionId },
      select: { connectionStatus: true },
    });
    if (connection?.connectionStatus !== 'active') {
      throw new AppError(AppErrorCode.CONFLICT, 'An active trading relationship is required to submit an order', 409);
    }
  }

  if (input.toStatus === 'accepted') {
    const mutualConfirmation =
      order.negotiationState?.retailerConfirmed && order.negotiationState?.wholesalerConfirmed;
    const legacyPriceLock = order.orderStatus === 'deal_locked' || order.orderStatus === 'confirmed';
    if (!mutualConfirmation && !legacyPriceLock) {
      throw new AppError(AppErrorCode.CONFLICT, 'The order must have mutually locked pricing before acceptance', 409);
    }
    const creditExposure = order.finalPrice ?? (order.subtotal?.minus(order.discountAmount).plus(order.taxAmount) ?? null);
    if (!creditExposure || creditExposure.lte(0)) {
      throw new AppError(AppErrorCode.CONFLICT, 'A positive locked order amount is required for credit validation', 409);
    }

    // Reserve the final agreed quantities before accepting. This also adjusts any
    // earlier draft reservation if negotiation changed a line quantity.
    const orderedItems = [...order.orderItems].sort((a, b) =>
      (a.wholesalerProductId ?? '').localeCompare(b.wholesalerProductId ?? '') || a.id.localeCompare(b.id),
    );
    for (const item of orderedItems) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new AppError(AppErrorCode.CONFLICT, 'Accepted order lines require a positive integer quantity', 409);
      }
      if (!item.wholesalerProductId) {
        throw new AppError(AppErrorCode.CONFLICT, 'Every accepted order line must reference an active wholesaler offer', 409);
      }

      const [offer] = await tx.$queryRaw<Array<{
        id: string;
        stock_quantity: number | null;
        is_active: boolean;
      }>>`
        SELECT wholesaler_product_id AS id, stock_quantity, is_active
        FROM wholesaler_products
        WHERE wholesaler_product_id = ${item.wholesalerProductId}
        FOR UPDATE
      `;
      if (!offer || !offer.is_active || offer.stock_quantity === null) {
        throw new AppError(AppErrorCode.CONFLICT, 'Accepted order stock must be tracked on an active wholesaler offer', 409);
      }

      const existingReservation = await tx.wholesalerStockReservation.findUnique({
        where: { orderItemId: item.id },
      });
      if (existingReservation && existingReservation.status !== 'reserved') {
        throw new AppError(AppErrorCode.CONFLICT, 'Order line reservation is no longer active', 409);
      }

      const previousQuantity = existingReservation?.quantity ?? 0;
      const adjustment = item.quantity - previousQuantity;
      if (adjustment > offer.stock_quantity) {
        throw new AppError(
          AppErrorCode.STOCK_EXHAUSTED,
          'Insufficient stock for the final agreed order quantity',
          409,
          { productOfferId: item.wholesalerProductId, requested: item.quantity, available: offer.stock_quantity + previousQuantity },
        );
      }

      if (adjustment !== 0) {
        await tx.wholesalerProduct.update({
          where: { id: item.wholesalerProductId },
          data: { stockQuantity: offer.stock_quantity - adjustment },
        });
      }

      if (existingReservation) {
        if (existingReservation.quantity !== item.quantity) {
          await tx.wholesalerStockReservation.update({
            where: { id: existingReservation.id },
            data: { quantity: item.quantity },
          });
        }
      } else {
        await tx.wholesalerStockReservation.create({
          data: {
            orderId: order.id,
            orderItemId: item.id,
            wholesalerProductId: item.wholesalerProductId,
            quantity: item.quantity,
          },
        });
      }
    }

    await LedgerService.reserveOrderCreditInTransaction(tx, order.id, creditExposure);
  }

  if (input.toStatus === 'picking' && !['deal_locked', 'confirmed', 'packing', 'ready_for_dispatch'].includes(order.orderStatus)) {
    throw new AppError(AppErrorCode.CONFLICT, 'The legacy order workflow is not ready for picking', 409);
  }

  if (input.toStatus === 'dispatched') {
    const deliveryIsActive = order.delivery && !['failed', 'returned'].includes(order.delivery.deliveryStatus);
    if (!deliveryIsActive) {
      throw new AppError(AppErrorCode.CONFLICT, 'Create an active delivery record before dispatching', 409);
    }
  }

  if (input.toStatus === 'delivered' || input.toStatus === 'partially_fulfilled') {
    if (!order.delivery?.deliveryOtpVerifiedAt) {
      throw new AppError(AppErrorCode.CONFLICT, 'Verified delivery handover is required', 409);
    }
  }

  if (input.toStatus === 'cancelled' || input.toStatus === 'rejected') {
    await LedgerService.releaseOrderCreditInTransaction(tx, order.id);
    const reservations = await tx.wholesalerStockReservation.findMany({
      where: { orderId: order.id, status: 'reserved' },
      orderBy: { wholesalerProductId: 'asc' },
    });

    for (const reservation of reservations) {
      const [lockedOffer] = await tx.$queryRaw<Array<{ wholesaler_product_id: string; stock_quantity: number | null }>>`
        SELECT wholesaler_product_id, stock_quantity
        FROM wholesaler_products
        WHERE wholesaler_product_id = ${reservation.wholesalerProductId}
        FOR UPDATE
      `;
      if (!lockedOffer || lockedOffer.stock_quantity === null) {
        throw new AppError(AppErrorCode.CONFLICT, 'Reserved wholesaler stock is no longer countable; manual stock reconciliation is required', 409);
      }

      await tx.wholesalerProduct.update({
        where: { id: reservation.wholesalerProductId },
        data: { stockQuantity: { increment: reservation.quantity } },
      });
      await tx.wholesalerStockReservation.update({
        where: { id: reservation.id },
        data: { status: 'released', releasedAt: new Date() },
      });
    }
  }

  if (input.toStatus === 'dispatched') {
    await tx.wholesalerStockReservation.updateMany({
      where: { orderId: order.id, status: 'reserved' },
      data: { status: 'fulfilled', fulfilledAt: new Date() },
    });
  }

  const updated = await tx.order.update({
    where: { id: order.id, retailerId: order.retailerId, wholesalerId: order.wholesalerId },
    data: { lifecycleStatus: input.toStatus },
    select: { id: true, orderNumber: true, lifecycleStatus: true, updatedAt: true },
  });

  const event = await tx.orderEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.lifecycleStatus,
      toStatus: input.toStatus,
      actorUserId: actor?.id ?? null,
      actorRole: actor?.userType ?? input.actorRole,
      actorSource: input.actorSource ?? 'authenticated_user',
      actorReference: input.actorReference ?? null,
      reason: input.reason as Prisma.InputJsonValue,
    },
  });

  return { order: updated, event };
}

/** Internal entry point for the verified temporary driver-link workflow. */
export async function transitionOrderLifecycleFromDriverLinkInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    deliveryId: string;
    toStatus: 'delivered' | 'partially_fulfilled';
    reason: OrderTransitionReason;
  },
) {
  return transitionOrderLifecycleInTransaction(tx, {
    ...input,
    actorUserId: null,
    actorRole: 'driver',
    actorSource: 'driver_access_token',
    actorReference: input.deliveryId,
  });
}

export class OrderLifecycleService {
  static async transition(input: TransitionOrderLifecycleInput) {
    if (!input.actorUserId) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authenticated actor is required', 401);
    }
    const parsedReason = orderTransitionReasonSchema.safeParse(input.reason);
    if (!parsedReason.success) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Invalid structured transition reason', 400, parsedReason.error.flatten());
    }

    return prisma.$transaction(async (tx) =>
      transitionOrderLifecycleInTransaction(tx, {
        ...input,
        actorSource: 'authenticated_user',
        actorReference: undefined,
        reason: parsedReason.data,
      }),
    {
      maxWait: 5_000,
      timeout: 10_000,
    });
  }
}
