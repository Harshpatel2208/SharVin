import { prisma } from '../../db';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { randomUUID } from 'node:crypto';
import { 
  UpdateThresholdInput, 
  QuickRestockInput, 
  BatchRestockInput,
  SimulateVelocityInput 
} from './inventory.validation';

export class InventoryService {
  /**
   * Atomically reserve wholesaler stock and create an order with one order item.
   *
   * Stock is stored on wholesaler_products.stock_quantity in the current schema.
   * The row lock serializes competing reservations for the same wholesaler offer;
   * the decrement and order writes commit or roll back together.
   */
  static async reserveStockAndPlaceOrder(input: {
    retailerId: string;
    wholesalerId: string;
    productId: string;
    quantity: number;
  }) {
    const { retailerId, wholesalerId, productId, quantity } = input;

    if (!retailerId || !wholesalerId || !productId) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Retailer, wholesaler, and product are required', 400);
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Quantity must be a positive safe integer', 400);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Verify the retailer is allowed to place an order with this wholesaler.
        const connection = await tx.retailerWholesalerConnection.findFirst({
          where: {
            retailerId,
            wholesalerId,
            connectionStatus: 'active',
          },
          select: { id: true },
        });

        if (!connection) {
          throw new AppError(AppErrorCode.FORBIDDEN, 'No active retailer-wholesaler connection', 403);
        }

        // Lock the seller-specific stock row (not the shared product catalog row).
        // PostgreSQL holds this lock through commit/rollback, serializing reservations
        // for this offer across concurrent API workers.
        const [offer] = await tx.$queryRaw<Array<{
          id: string;
          stock_quantity: number | null;
          base_price: string;
          minimum_order_quantity: number;
          batch_number: string | null;
          expiry_date: Date | null;
          is_active: boolean;
        }>>`
          SELECT
            wholesaler_product_id AS id,
            stock_quantity,
            base_price,
            minimum_order_quantity,
            batch_number,
            expiry_date,
            is_active
          FROM wholesaler_products
          WHERE wholesaler_id = ${wholesalerId}
            AND product_id = ${productId}
          FOR UPDATE
        `;

        if (!offer || !offer.is_active) {
          throw new AppError(AppErrorCode.NOT_FOUND, 'Active wholesaler product offer not found', 404);
        }
        if (offer.stock_quantity === null) {
          throw new AppError(
            AppErrorCode.CONFLICT,
            'Stock is not tracked for this wholesaler offer; reservation is unavailable',
            409,
          );
        }
        if (quantity < offer.minimum_order_quantity) {
          throw new AppError(
            AppErrorCode.MOQ_BREACH,
            `Minimum order quantity is ${offer.minimum_order_quantity}`,
            409,
          );
        }
        if (offer.stock_quantity < quantity) {
          throw new AppError(
            AppErrorCode.STOCK_EXHAUSTED,
            'Insufficient available stock',
            409,
            { requested: quantity, available: offer.stock_quantity },
          );
        }

        // The offer row remains locked until this update and the order writes commit.
        await tx.wholesalerProduct.update({
          where: {
            wholesalerId_productId: { wholesalerId, productId },
          },
          data: { stockQuantity: offer.stock_quantity - quantity },
        });

        const order = await tx.order.create({
          data: {
            retailerId,
            wholesalerId,
            connectionId: connection.id,
            orderNumber: `ORD-${randomUUID()}`,
            orderStatus: 'negotiating',
          },
        });

        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId,
            wholesalerProductId: offer.id,
            quantity,
            quotedUnitPrice: offer.base_price,
            batchNumber: offer.batch_number,
            expiryDate: offer.expiry_date,
          },
        });

        await tx.wholesalerStockReservation.create({
          data: {
            orderId: order.id,
            orderItemId: orderItem.id,
            wholesalerProductId: offer.id,
            quantity,
          },
        });

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderItemId: orderItem.id,
          retailerId,
          wholesalerId,
          productId,
          quantityReserved: quantity,
          remainingStock: offer.stock_quantity - quantity,
          status: order.orderStatus,
        };
      }, {
        // Fail rather than wait indefinitely behind a hot inventory row.
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      // Prisma interactive transactions roll back automatically when the callback
      // throws. The Prisma pool also returns its connection after transaction cleanup.
      if (error instanceof AppError) throw error;

      throw new AppError(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        'Unable to reserve stock and place order',
        500,
        process.env.NODE_ENV === 'development' ? error : undefined,
      );
    }
  }

  /**
   * Get all products in retailer's inventory that have breached or reached their low-stock threshold.
   */
  static async getLowStockItems(retailerId: string) {
    // 1. Fetch inventory items with low stock
    const inventoryItems = await prisma.retailerInventory.findMany({
      where: {
        retailerId,
      },
      include: {
        product: true,
      },
      orderBy: [
        { currentStock: 'asc' },
        { lowStockThreshold: 'desc' },
      ],
    });

    // 2. Fetch active connected wholesalers for this retailer
    const connections = await prisma.retailerWholesalerConnection.findMany({
      where: {
        retailerId,
        connectionStatus: 'active',
      },
      include: {
        wholesaler: {
          include: {
            wholesalerProfile: true,
          },
        },
      },
    });

    const activeWholesalers = connections.map((c) => ({
      connectionId: c.id,
      wholesalerId: c.wholesalerId,
      businessName: c.wholesaler.businessName,
      phoneNumber: c.wholesaler.phoneNumber,
      gstNumber: c.wholesaler.wholesalerProfile?.gstNumber || null,
    }));

    // Filter to items where currentStock <= lowStockThreshold
    const lowStockItems = inventoryItems
      .filter((inv) => inv.currentStock <= inv.lowStockThreshold)
      .map((inv) => {
        const defaultWholesaler = activeWholesalers[0] || null;
        const deficit = Math.max(0, inv.lowStockThreshold - inv.currentStock);
        const recommendedQty = inv.reorderQuantity || Math.max(inv.lowStockThreshold * 2, 20);

        return {
          inventoryId: inv.id,
          productId: inv.productId,
          productName: inv.product.productName,
          brandName: inv.product.brandName,
          barcode: inv.product.manufacturerBarcode || inv.product.systemGeneratedBarcode,
          unitOfMeasure: inv.product.unitOfMeasure,
          currentStock: inv.currentStock,
          lowStockThreshold: inv.lowStockThreshold,
          reorderQuantity: inv.reorderQuantity,
          recommendedRestockQuantity: recommendedQty,
          stockDeficit: deficit,
          costPrice: Number(inv.costPrice ?? 0),
          sellingPrice: Number(inv.sellingPrice ?? 0),
          predictedStockoutDate: inv.predictedStockoutDate,
          suggestedWholesaler: defaultWholesaler,
          availableWholesalers: activeWholesalers,
        };
      });

    return {
      count: lowStockItems.length,
      items: lowStockItems,
      hasActiveWholesalers: activeWholesalers.length > 0,
      activeWholesalersCount: activeWholesalers.length,
    };
  }

  /**
   * Get all active (pending) stock alerts for the retailer.
   */
  static async getStockAlerts(retailerId: string) {
    const alerts = await prisma.stockAlert.findMany({
      where: {
        retailerId,
        actionTaken: 'pending',
      },
      include: {
        product: true,
        inventory: true,
      },
      orderBy: {
        triggeredAt: 'desc',
      },
    });

    return alerts.map((a) => ({
      alertId: a.id,
      productId: a.productId,
      productName: a.product.productName,
      currentStock: a.currentStock,
      lowStockThreshold: a.lowStockThreshold,
      recommendedQuantity: a.recommendedQuantity,
      recommendedWholesalerId: a.recommendedWholesalerId,
      alertType: a.alertType,
      triggeredAt: a.triggeredAt,
      actionTaken: a.actionTaken,
    }));
  }

  /**
   * Update low-stock threshold and reorder quantity for an inventory item.
   */
  static async updateThreshold(retailerId: string, input: UpdateThresholdInput) {
    return prisma.$transaction(async (tx) => {
      // Row-level lock serializes threshold edits with concurrent POS sales,
      // preventing lost updates and duplicate pending stock alerts.
      const [locked] = await tx.$queryRaw<Array<{ inventory_id: string }>>`
        SELECT inventory_id FROM retailer_inventory
        WHERE retailer_id = ${retailerId} AND product_id = ${input.productId}
        LIMIT 1
        FOR UPDATE
      `;

      if (!locked) {
        throw new AppError(AppErrorCode.NOT_FOUND, 'Product not found in your inventory catalog', 404);
      }

      const updated = await tx.retailerInventory.update({
        where: { id: locked.inventory_id },
        data: {
          lowStockThreshold: input.lowStockThreshold,
          ...(input.reorderQuantity !== undefined ? { reorderQuantity: input.reorderQuantity } : {}),
        },
        include: {
          product: true,
        },
      });

      // If stock is now at or below threshold, ensure a pending stock alert exists
      let alertCreated = false;
      if (updated.currentStock <= updated.lowStockThreshold) {
        const existingAlert = await tx.stockAlert.findFirst({
          where: {
            retailerId,
            productId: input.productId,
            actionTaken: 'pending',
          },
          select: { id: true },
        });

        if (!existingAlert) {
          await tx.stockAlert.create({
            data: {
              retailerId,
              inventoryId: updated.id,
              productId: updated.productId,
              alertType: 'manual_threshold_update',
              currentStock: updated.currentStock,
              lowStockThreshold: updated.lowStockThreshold,
              recommendedQuantity: updated.reorderQuantity || updated.lowStockThreshold * 2,
              actionTaken: 'pending',
            },
          });
          alertCreated = true;
        }
      }

      return {
        inventoryId: updated.id,
        productId: updated.productId,
        productName: updated.product.productName,
        currentStock: updated.currentStock,
        lowStockThreshold: updated.lowStockThreshold,
        reorderQuantity: updated.reorderQuantity,
        isLowStock: updated.currentStock <= updated.lowStockThreshold,
        alertCreated,
      };
    });
  }

  /**
   * 1-Click Quick Restock: add depleted product into wholesaler draft restock cart.
   */
  static async quickRestock(retailerId: string, input: QuickRestockInput) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch inventory and product
      const inventory = await tx.retailerInventory.findUnique({
        where: {
          retailerId_productId: {
            retailerId,
            productId: input.productId,
          },
        },
        include: {
          product: true,
        },
      });

      if (!inventory) {
        throw new AppError(AppErrorCode.NOT_FOUND, 'Product not found in your store inventory', 404);
      }

      // 2. Resolve Wholesaler Connection
      let connection = null;
      if (input.wholesalerId) {
        connection = await tx.retailerWholesalerConnection.findFirst({
          where: {
            retailerId,
            wholesalerId: input.wholesalerId,
            connectionStatus: 'active',
          },
          include: {
            wholesaler: true,
          },
        });
      } else {
        // Find default/first active connection
        connection = await tx.retailerWholesalerConnection.findFirst({
          where: {
            retailerId,
            connectionStatus: 'active',
          },
          include: {
            wholesaler: true,
          },
        });
      }

      if (!connection) {
        throw new AppError(
          AppErrorCode.CONFLICT,
          'No active wholesale supplier connected. Please connect with a wholesaler to enable 1-Click Restock.',
          409
        );
      }

      // Serialize concurrent restock calls for this retailer-wholesaler pair.
      // Prevents duplicate draft orders and lost quantity updates (find-then-create race).
      await tx.$queryRaw`
        SELECT connection_id FROM retailer_wholesaler_connections
        WHERE connection_id = ${connection.id}
        FOR UPDATE
      `;

      // 3. Check wholesaler godown stock
      const wholesalerProduct = await tx.wholesalerProduct.findUnique({
        where: {
          wholesalerId_productId: {
            wholesalerId: connection.wholesalerId,
            productId: input.productId,
          },
        },
      });

      if (wholesalerProduct && wholesalerProduct.stockQuantity !== null && wholesalerProduct.stockQuantity <= 0) {
        throw new AppError(AppErrorCode.STOCK_EXHAUSTED, 'Item is currently out of stock in wholesaler godown', 409);
      }

      const restockQty = input.quantity || inventory.reorderQuantity || Math.max(inventory.lowStockThreshold * 2, 20);

      // 4. Find or create existing draft Order (cart) with this wholesaler
      let order = await tx.order.findFirst({
        where: {
          retailerId,
          wholesalerId: connection.wholesalerId,
          orderStatus: 'negotiating', // draft cart status in current schema
        },
        include: {
          orderItems: true,
        },
      });

      if (!order) {
        const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
        order = await tx.order.create({
          data: {
            retailerId,
            wholesalerId: connection.wholesalerId,
            connectionId: connection.id,
            orderNumber,
            orderStatus: 'negotiating',
          },
          include: {
            orderItems: true,
          },
        });
      }

      // 5. Add or update OrderItem
      const existingItem = order.orderItems.find((i) => i.productId === input.productId);
      let orderItem = null;

      if (existingItem) {
        orderItem = await tx.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + restockQty,
            batchNumber: wholesalerProduct?.batchNumber || existingItem.batchNumber || null,
            expiryDate: wholesalerProduct?.expiryDate || existingItem.expiryDate || null,
          },
        });
      } else {
        orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: input.productId,
            wholesalerProductId: wholesalerProduct?.id || null,
            quantity: restockQty,
            quotedUnitPrice: wholesalerProduct?.basePrice || inventory.costPrice || null,
            batchNumber: wholesalerProduct?.batchNumber || null,
            expiryDate: wholesalerProduct?.expiryDate || null,
          },
        });
      }

      // 5. Update any pending StockAlert for this product
      await tx.stockAlert.updateMany({
        where: {
          retailerId,
          productId: input.productId,
          actionTaken: 'pending',
        },
        data: {
          actionTaken: 'cart_created',
          actionTakenAt: new Date(),
          orderId: order.id,
          recommendedWholesalerId: connection.wholesalerId,
        },
      });

      // Count total items in this wholesaler's cart
      const totalCartItems = await tx.orderItem.count({
        where: { orderId: order.id },
      });

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        wholesalerId: connection.wholesalerId,
        wholesalerName: connection.wholesaler.businessName,
        productId: input.productId,
        productName: inventory.product.productName,
        quantityAdded: restockQty,
        totalItemsInCart: totalCartItems,
        restockedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * 1-Click Restock All: Add all depleted items to respective wholesaler carts.
   */
  static async batchRestock(retailerId: string, input: BatchRestockInput) {
    const results = [];
    for (const item of input.items) {
      try {
        const res = await this.quickRestock(retailerId, {
          productId: item.productId,
          wholesalerId: item.wholesalerId,
          quantity: item.quantity,
        });
        results.push({ productId: item.productId, status: 'success', data: res });
      } catch (err: any) {
        results.push({ productId: item.productId, status: 'failed', error: err.message });
      }
    }
    return {
      totalRequested: input.items.length,
      successful: results.filter((r) => r.status === 'success').length,
      results,
    };
  }

  /**
   * Dismiss a stock alert.
   */
  static async dismissAlert(retailerId: string, alertId: string) {
    const alert = await prisma.stockAlert.findFirst({
      where: {
        id: alertId,
        retailerId,
      },
    });

    if (!alert) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Stock alert not found', 404);
    }

    const updated = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        actionTaken: 'dismissed',
        actionTakenAt: new Date(),
      },
    });

    return {
      alertId: updated.id,
      actionTaken: updated.actionTaken,
      dismissedAt: updated.actionTakenAt,
    };
  }

  // ==========================================
  // PHASE 3 TASK 7: 7-DAY VELOCITY AI REORDER PREDICTOR
  // ==========================================

  private static velocitySimulations = new Map<string, {
    productId?: string;
    unitsSoldLast7Days: number;
    currentStock: number;
  }>();

  /**
   * Set or reset 7-day velocity simulation for testing and browser demo
   */
  static simulateVelocity(retailerId: string, input: SimulateVelocityInput) {
    if (input.reset) {
      this.velocitySimulations.delete(retailerId);
      return {
        success: true,
        message: 'Velocity simulation reset to real/default inventory data',
        simulated: false,
      };
    }

    const sim = {
      productId: input.productId,
      unitsSoldLast7Days: input.unitsSoldLast7Days ?? 14,
      currentStock: input.currentStock ?? 3,
    };

    this.velocitySimulations.set(retailerId, sim);

    return {
      success: true,
      message: `Velocity simulation active: ${sim.unitsSoldLast7Days} units sold in 7 days, ${sim.currentStock} in stock`,
      simulated: true,
      simulation: sim,
    };
  }

  /**
   * Calculate 7-Day Velocity and Stockout Horizons across retailer inventory
   */
  static async getReorderPredictions(retailerId: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [inventory, connections, recentSalesAgg] = await Promise.all([
      prisma.retailerInventory.findMany({
        where: { retailerId },
        include: { product: true },
      }),
      prisma.retailerWholesalerConnection.findMany({
        where: { retailerId, connectionStatus: 'active' },
        include: { wholesaler: true },
        orderBy: { totalOrdersPlaced: 'desc' },
      }),
      prisma.retailerSaleItem.groupBy({
        by: ['productId'],
        where: {
          sale: {
            retailerId,
            saleDate: { gte: sevenDaysAgo },
          },
        },
        _sum: {
          quantity: true,
        },
      }),
    ]);

    const salesByProduct = new Map(recentSalesAgg.map((s) => [s.productId, s._sum.quantity || 0]));
    const supplier = connections[0]?.wholesaler;
    const simulation = this.velocitySimulations.get(retailerId);

    const predictions: ReorderPrediction[] = inventory.map((inv) => {
      const simulated = simulation && (!simulation.productId || simulation.productId === inv.productId);
      const actualSales = Math.max(salesByProduct.get(inv.productId) || 0, inv.salesLast7Days || 0);
      const unitsSold = simulated ? simulation.unitsSoldLast7Days : actualSales;
      const stock = simulated ? simulation.currentStock : inv.currentStock;
      const dailyVelocity = Number((unitsSold / 7).toFixed(2));
      const daysRemaining = Number((dailyVelocity > 0 ? (stock <= 0 ? 0 : stock / dailyVelocity) : (stock <= 0 ? 0 : 999)).toFixed(1));
      const isUrgent = daysRemaining <= 2.5 || (stock <= inv.lowStockThreshold && dailyVelocity > 0);
      const urgencyLevel: ReorderPrediction['urgencyLevel'] =
        stock <= 0 || daysRemaining <= 1 ? 'CRITICAL'
        : daysRemaining <= 2.5 || stock <= inv.lowStockThreshold ? 'HIGH'
        : daysRemaining <= 4 ? 'MODERATE' : 'HEALTHY';
      const reorderQuantity = inv.reorderQuantity || Math.max(inv.lowStockThreshold * 2, 20);
      const recommendedBufferQty = Math.max(1, dailyVelocity > 0 ? Math.round(dailyVelocity * 5) : reorderQuantity);
      const recommendedOrderQty = dailyVelocity > 0
        ? Math.ceil(dailyVelocity * 15)
        : (inv.reorderQuantity || 10);
      const displayVelocity = dailyVelocity % 1 === 0 ? dailyVelocity.toString() : dailyVelocity.toFixed(1);

      return {
        inventoryId: inv.id,
        productId: inv.productId,
        productName: inv.product.productName,
        brandName: inv.product.brandName,
        barcode: inv.product.manufacturerBarcode || inv.product.systemGeneratedBarcode || '',
        unitOfMeasure: inv.product.unitOfMeasure,
        currentStock: stock,
        lowStockThreshold: inv.lowStockThreshold,
        unitsSoldLast7Days: unitsSold,
        dailyVelocity,
        daysRemaining,
        isUrgent,
        urgencyLevel,
        supplierLeadTimeHours: 24,
        recommendedBufferQty,
        recommendedOrderQty,
        reorderQuantity,
        costPrice: Number(inv.costPrice ?? 0),
        sellingPrice: Number(inv.sellingPrice ?? 0),
        estimatedRestockCost: recommendedBufferQty * Number(inv.costPrice ?? 0),
        line1: daysRemaining <= 0 ? `Stockout: 0 days remaining (${inv.product.productName})` : `Stockout in ~${daysRemaining} days (${inv.product.productName})`,
        line2: `7-day sales: ${unitsSold} units (${displayVelocity}/day) • Stock remaining: ${stock} units`,
        line3: `Supplier lead time: ~24h. AI recommends ${recommendedOrderQty} units for a 15-day supply.`,
        suggestedWholesaler: supplier ? {
          wholesalerId: supplier.id,
          businessName: supplier.businessName || supplier.fullName,
          phoneNumber: supplier.phoneNumber || undefined,
        } : null,
      };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);
    const urgentPredictions = predictions.filter((prediction) => prediction.isUrgent);
    const highestUrgency: ReorderPrediction['urgencyLevel'] = urgentPredictions.some((item) => item.urgencyLevel === 'CRITICAL') ? 'CRITICAL'
      : urgentPredictions.some((item) => item.urgencyLevel === 'HIGH') ? 'HIGH'
      : urgentPredictions.some((item) => item.urgencyLevel === 'MODERATE') ? 'MODERATE' : 'HEALTHY';
    return {
      predictions,
      urgentPredictions,
      totalUrgentCount: urgentPredictions.length,
      highestUrgency,
      simulated: Boolean(simulation),
      activeSimulation: simulation || null,
    };
  }
}

export interface ReorderPrediction {
  inventoryId: string;
  productId: string;
  productName: string;
  brandName: string | null;
  barcode: string;
  unitOfMeasure: string;
  currentStock: number;
  lowStockThreshold: number;
  unitsSoldLast7Days: number;
  dailyVelocity: number;
  daysRemaining: number;
  isUrgent: boolean;
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY';
  supplierLeadTimeHours: number;
  recommendedBufferQty: number;
  recommendedOrderQty: number;
  reorderQuantity: number;
  costPrice: number;
  sellingPrice: number;
  estimatedRestockCost: number;
  line1: string;
  line2: string;
  line3: string;
  suggestedWholesaler: {
    wholesalerId: string;
    businessName: string;
    phoneNumber?: string;
  } | null;
}
