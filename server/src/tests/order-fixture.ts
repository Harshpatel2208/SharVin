import prisma from '../db';

/**
 * Shared fixture helpers for the manual delivery suites.
 *
 * Why this exists: dispatch and handover verification are strictly PostgreSQL-backed
 * since roadmap item #1 (P1). An order id that is not persisted now fails with a
 * readable 404 instead of falling back to a process-local record, so any suite that
 * dispatches must create a real order row first.
 *
 * Tenant resolution prefers the demo trade pair used by the older suites and falls
 * back to the first retailer-wholesaler connection in the database, so the suites
 * run against both a seeded and a signup-driven dev database.
 */

const DEMO_RETAILER_ID = 'ret-user-gupta-01';
const DEMO_WHOLESALER_ID = 'ws-user-kailash-01';

export interface FixtureTenants {
  retailerId: string;
  wholesalerId: string;
  connectionId: string;
}

export async function resolveFixtureTenants(): Promise<FixtureTenants> {
  const demoConnection = await prisma.retailerWholesalerConnection.findFirst({
    where: { retailerId: DEMO_RETAILER_ID, wholesalerId: DEMO_WHOLESALER_ID },
  });
  if (demoConnection) {
    return {
      retailerId: demoConnection.retailerId,
      wholesalerId: demoConnection.wholesalerId,
      connectionId: demoConnection.id,
    };
  }

  const anyConnection = await prisma.retailerWholesalerConnection.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!anyConnection) {
    throw new Error('No retailer-wholesaler connection found. Register a retailer and a wholesaler before running this suite.');
  }
  return {
    retailerId: anyConnection.retailerId,
    wholesalerId: anyConnection.wholesalerId,
    connectionId: anyConnection.id,
  };
}

/**
 * Create a dispatch-ready `deal_locked` order row and return the tenant pair that owns it.
 */
export async function createDeliverableOrder(orderId: string, orderNumber: string): Promise<FixtureTenants> {
  const tenants = await resolveFixtureTenants();

  await prisma.order.upsert({
    where: { id: orderId },
    update: { orderStatus: 'deal_locked' },
    create: {
      id: orderId,
      retailerId: tenants.retailerId,
      wholesalerId: tenants.wholesalerId,
      connectionId: tenants.connectionId,
      orderNumber,
      orderStatus: 'deal_locked',
      subtotal: 16600,
      finalPrice: 16600,
    },
  });

  return tenants;
}
