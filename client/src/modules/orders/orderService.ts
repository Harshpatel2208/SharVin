// Shared client service for the B2B orders pipeline.
// GET /api/v1/orders is scoped server-side to the authenticated tenant, so for a
// wholesaler caller it returns their incoming purchase orders with nested retailer
// details, line items, and the current lifecycle/legacy status.
//
// The order-level negotiation actions below hit the real backend endpoints:
//   - POST /api/v1/orders/:orderId/propose-rate  (chat.controller.proposeRate)
//   - POST /api/v1/orders/:orderId/confirm-rate  (chat.controller.confirmRate)
//   - PATCH /api/v1/orders/:orderId/lifecycle     (order-lifecycle.controller.transition)
// Each controller also rebroadcasts the matching Socket.io room event (rate_proposed /
// rate_locked / order_price_locked), so calling these REST methods drives the live UI.

import type {
  ProposeRatePayload,
  RateProposalResult,
  ConfirmRatePayload,
  RateLockResult,
} from '../chat/types';

const authHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
});

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || 'The orders request could not be completed.');
  }
  return body.data as T;
}

// Raw shapes returned by the backend (Prisma Decimal fields serialize to strings).
export interface ApiRetailer {
  id: string;
  businessName: string | null;
  fullName: string | null;
  phoneNumber?: string | null;
  addresses?: Array<{
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    isPrimary?: boolean;
  }>;
}

export interface ApiOrderItem {
  id: string;
  quantity: number;
  quotedUnitPrice?: string | number | null;
  finalUnitPrice?: string | number | null;
  lineTotal?: string | number | null;
  product?: {
    productName?: string;
    manufacturerBarcode?: string | null;
    systemGeneratedBarcode?: string | null;
    unitOfMeasure?: string | null;
  } | null;
  wholesalerProduct?: {
    basePrice?: string | number | null;
    marginFloorPrice?: string | number | null;
    stockQuantity?: number | null;
    minimumOrderQuantity?: number | null;
  } | null;
}

export interface ApiOrder {
  id: string;
  orderNumber: string;
  orderStatus: string;
  lifecycleStatus: string;
  subtotal?: string | number | null;
  finalPrice?: string | number | null;
  createdAt: string;
  updatedAt: string;
  retailer?: ApiRetailer | null;
  wholesaler?: { id: string; businessName: string | null; fullName: string | null } | null;
  orderItems: ApiOrderItem[];
}

export class OrderService {
  /**
   * Fetch the active B2B orders for the authenticated wholesaler (server-scoped by token).
   */
  static async fetchWholesalerOrders(signal?: AbortSignal): Promise<ApiOrder[]> {
    const response = await fetch('/api/v1/orders', { headers: authHeaders(), signal });
    return readResponse<ApiOrder[]>(response);
  }

  /**
   * Submit a per-line counter-offer / rate proposal to the retailer.
   * Hits POST /api/v1/orders/:orderId/propose-rate; server enforces margin floor,
   * MOQ & stock guardrails and broadcasts `rate_proposed` to the order room.
   */
  static async submitCounterOffer(
    orderId: string,
    payload: Omit<ProposeRatePayload, 'orderId'>,
    signal?: AbortSignal,
  ): Promise<RateProposalResult> {
    const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/propose-rate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
    return readResponse<RateProposalResult>(response);
  }

  /**
   * Accept & lock the current negotiated rate. This records the wholesaler's
   * confirmation; the deal seals (isDealLocked = true) only once both parties
   * have confirmed. Hits POST /api/v1/orders/:orderId/confirm-rate, which
   * persists the lock via Prisma and broadcasts `rate_locked`/`order_price_locked`.
   */
  static async acceptAndLockOrder(
    orderId: string,
    payload?: Pick<ConfirmRatePayload, 'notes' | 'clientVersion'>,
    signal?: AbortSignal,
  ): Promise<RateLockResult> {
    const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/confirm-rate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload ?? {}),
      signal,
    });
    return readResponse<RateLockResult>(response);
  }

  /**
   * Reject a submitted purchase order (wholesaler declines the request).
   * Hits PATCH /api/v1/orders/:orderId/lifecycle with the OMS 'rejected' target
   * and a structured reason, which the backend validates against the transition rules.
   */
  static async rejectOrder(
    orderId: string,
    reason: { code?: string; message: string },
    expectedFromStatus?: string,
    signal?: AbortSignal,
  ): Promise<OrderTransitionResult> {
    const body: Record<string, unknown> = {
      toStatus: 'rejected',
      reason: { code: reason.code || 'wholesaler_rejected', message: reason.message },
    };
    if (expectedFromStatus) body.expectedFromStatus = expectedFromStatus;
    const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/lifecycle`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    return readResponse<OrderTransitionResult>(response);
  }
}

/** Shape returned by the order-lifecycle PATCH transition endpoint. */
export interface OrderTransitionResult {
  order: { id: string; orderNumber: string; lifecycleStatus: string; updatedAt: string };
  event: unknown;
}
