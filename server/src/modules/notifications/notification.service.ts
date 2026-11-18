import { Prisma, DeliveryStatus, OrderLifecycleStatus } from '@prisma/client';
import { prisma } from '../../db';
import { JwtAuthPayload } from '../../types/auth.types';

export interface ActivityItem {
  id: string;
  category: 'notification' | 'stock_alert' | 'order' | 'rate' | 'delivery';
  title: string;
  message: string;
  createdAt: string;
}

/**
 * Tenant-scoped, DB-backed activity feed and sidebar badge counters.
 * All reads are filtered by the authenticated principal's tenantId;
 * nothing here is mocked or seeded.
 */
export class NotificationService {
  /** Open order buckets used for sidebar badges. */
  private static readonly draftStatuses: OrderLifecycleStatus[] = ['draft'];
  private static readonly completedStatuses: OrderLifecycleStatus[] = ['delivered', 'partially_fulfilled', 'rejected', 'cancelled'];
  private static readonly settledDeliveryStatuses: DeliveryStatus[] = ['delivered', 'failed', 'returned'];

  static async getTenantActivity(auth: JwtAuthPayload): Promise<{
    activities: ActivityItem[];
    badges: {
      activeAlerts: number;
      openPos: number;
      activeOrders: number;
      pendingDeliveries: number;
      newOrders: number;
      unreadNotifications: number;
    };
  }> {
    const tenantId = auth.tenantId;
    const userType = auth.userType;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      notificationRows,
      stockAlertRows,
      orderEventRows,
      priceHistoryRows,
      deliveryRows,
      activeAlertCount,
      openPoCount,
      activeOrderCount,
      pendingDeliveryCount,
      newOrderCount,
      unreadNotificationCount,
    ] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: tenantId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      userType === 'retailer'
        ? prisma.stockAlert.findMany({
            where: { retailerId: tenantId, triggeredAt: { gte: since } },
            include: { product: { select: { productName: true } } },
            orderBy: { triggeredAt: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
      prisma.orderEvent.findMany({
        where: { createdAt: { gte: since }, order: { OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }] } },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.orderPriceHistory.findMany({
        where: { createdAt: { gte: since }, order: { OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }] } },
        include: { order: { select: { orderNumber: true } }, orderItem: { include: { product: { select: { productName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.delivery.findMany({
        where: { updatedAt: { gte: since }, order: { OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }] } },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      userType === 'retailer'
        ? prisma.stockAlert.count({ where: { retailerId: tenantId, actionTaken: 'pending' } })
        : Promise.resolve(0),
      prisma.order.count({
        where: {
          OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }],
          lifecycleStatus: { notIn: NotificationService.draftStatuses },
        },
      }),
      prisma.order.count({
        where: {
          OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }],
          lifecycleStatus: { notIn: [...NotificationService.draftStatuses, ...NotificationService.completedStatuses] },
        },
      }),
      prisma.delivery.count({
        where: {
          deliveryStatus: { notIn: NotificationService.settledDeliveryStatuses },
          order: { OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }] },
        },
      }),
      // Orders awaiting first wholesaler action (submitted) or in bargaining/lock stages.
      prisma.order.count({
        where: { wholesalerId: tenantId, lifecycleStatus: { in: ['submitted', 'accepted', 'picking'] as OrderLifecycleStatus[] } },
      }),
      prisma.notification.count({ where: { userId: tenantId, isDeleted: false, isRead: false } }),
    ]);

    const activities: ActivityItem[] = [
      ...notificationRows.map((n) => ({
        id: `notif-${n.id}`,
        category: 'notification' as const,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
      })),
      ...stockAlertRows.map((a) => ({
        id: `alert-${a.id}`,
        category: 'stock_alert' as const,
        title: a.currentStock <= 0 ? 'Stock Depleted' : 'Low Stock Threshold Breached',
        message: `${a.product.productName} down to ${a.currentStock} (threshold ${a.lowStockThreshold})`,
        createdAt: a.triggeredAt.toISOString(),
      })),
      ...orderEventRows.map((e) => ({
        id: `event-${e.id}`,
        category: 'order' as const,
        title: `Order ${NotificationService.humanize(e.toStatus)}`,
        message: `${e.order.orderNumber} moved to ${NotificationService.humanize(e.toStatus)}${NotificationService.jsonMessage(e.reason) ? ` — ${NotificationService.jsonMessage(e.reason)}` : ''}`,
        createdAt: e.createdAt.toISOString(),
      })),
      ...priceHistoryRows.map((p) => ({
        id: `rate-${p.id}`,
        category: 'rate' as const,
        title: p.changeType === 'price_locked' || p.changeType === 'deal_locked' ? 'Rate Locked' : 'Counter Rate Proposed',
        message: `${p.orderItem?.product?.productName ? `${p.orderItem.product.productName} on ` : ''}${p.order.orderNumber} at ₹${p.newPrice ?? '—'}`,
        createdAt: p.createdAt.toISOString(),
      })),
      ...deliveryRows.map((d) => ({
        id: `delivery-${d.id}`,
        category: 'delivery' as const,
        title: d.deliveryStatus === 'delivered' ? 'Delivery Handover Confirmed' : `Delivery ${NotificationService.humanize(d.deliveryStatus)}`,
        message: `${d.order.orderNumber} — ${NotificationService.humanize(d.deliveryStatus).toLowerCase()}${d.driverName ? ` by ${d.driverName}` : ''}`,
        createdAt: d.updatedAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    return {
      activities,
      badges: {
        activeAlerts: activeAlertCount,
        openPos: openPoCount,
        activeOrders: activeOrderCount,
        pendingDeliveries: pendingDeliveryCount,
        newOrders: newOrderCount,
        unreadNotifications: unreadNotificationCount,
      },
    };
  }

  private static humanize(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Safely extracts the `message` field from a JSON reason payload. */
  private static jsonMessage(value: Prisma.JsonValue): string | null {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'message' in value) {
      const message = (value as { message: unknown }).message;
      return typeof message === 'string' ? message : null;
    }
    return null;
  }
}

