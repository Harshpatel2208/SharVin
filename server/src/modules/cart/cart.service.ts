import { prisma } from '../../db';
import { transitionOrderLifecycleInTransaction } from '../orders/order-lifecycle.service';
import { Logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';
import { AddToCartInput, SubmitCartInput } from './cart.validation';
import { computeExpiryStatus } from '../wholesaler/wholesaler.service';
import { AppError, AppErrorCode } from '../../utils/app-error';

export class CartService {
  /**
   * Retrieve all active supplier-isolated wholesale carts for a retailer.
   */
  static async getRetailerCarts(retailerId: string) {
    let orders: any[] = [];
    try {
      orders = await prisma.order.findMany({
        where: {
          retailerId,
          orderStatus: 'negotiating', // draft cart status
          lifecycleStatus: 'draft',
        },
        include: {
          wholesaler: {
            include: {
              wholesalerProfile: true,
            },
          },
          connection: true,
          orderItems: {
            include: {
              product: true,
              wholesalerProduct: true,
            },
            orderBy: {
              addedAt: 'asc',
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    } catch (err) {
      throw err;
    }

    const carts = orders.map((order: any) => {
      let subtotal = new Prisma.Decimal(0);
      let totalQuantity = 0;
      const moqViolations: Array<{
        productName: string;
        currentQuantity: number;
        minimumOrderQuantity: number;
        deficit: number;
      }> = [];
  
      const formattedItems = order.orderItems.map((item: any) => {
        const basePrice = item.quotedUnitPrice 
          ? new Prisma.Decimal(item.quotedUnitPrice) 
          : item.wholesalerProduct 
            ? new Prisma.Decimal(item.wholesalerProduct.basePrice) 
            : new Prisma.Decimal(0);
  
        const lineTotal = basePrice.mul(item.quantity);
        subtotal = subtotal.plus(lineTotal);
        totalQuantity += item.quantity;
  
        const moq = item.wholesalerProduct?.minimumOrderQuantity ?? 1;
        const isMoqSatisfied = item.quantity >= moq;
  
        if (!isMoqSatisfied) {
          moqViolations.push({
            productName: item.product.productName,
            currentQuantity: item.quantity,
            minimumOrderQuantity: moq,
            deficit: moq - item.quantity,
          });
        }
  
        const rawExpiry = item.expiryDate || item.wholesalerProduct?.expiryDate;
        const expiryStatus = computeExpiryStatus(rawExpiry);
        const isOutOfStock = item.wholesalerProduct?.stockQuantity !== null && (item.wholesalerProduct?.stockQuantity ?? 0) <= 0;
  
        return {
          orderItemId: item.id,
          productId: item.productId,
          wholesalerProductId: item.wholesalerProductId,
          productName: item.product.productName,
          brandName: item.product.brandName,
          barcode: item.product.manufacturerBarcode || item.product.systemGeneratedBarcode,
          unitOfMeasure: item.product.unitOfMeasure,
          quantity: item.quantity,
          quotedUnitPrice: basePrice.toNumber(),
          lineTotal: lineTotal.toNumber(),
          minimumOrderQuantity: moq,
          isMoqSatisfied,
          stockAvailable: item.wholesalerProduct?.stockQuantity ?? null,
          isStockSufficient: item.wholesalerProduct?.stockQuantity === null || (item.wholesalerProduct?.stockQuantity ?? 0) >= item.quantity,
          isOutOfStock,
          batchNumber: item.batchNumber || item.wholesalerProduct?.batchNumber || null,
          expiryDate: rawExpiry ? new Date(rawExpiry).toISOString().slice(0, 10) : null,
          expiryStatus,
          isNearExpiryWarning: expiryStatus.isNearExpiryWarning,
          isNearExpiryClearance: expiryStatus.isNearExpiryClearance,
          addedAt: item.addedAt,
        };
      });
  
      const allMoqSatisfied = moqViolations.length === 0;
  
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        wholesaler: {
          wholesalerId: order.wholesalerId,
          businessName: order.wholesaler.businessName,
          phoneNumber: order.wholesaler.phoneNumber,
          gstNumber: order.wholesaler.wholesalerProfile?.gstNumber || null,
          businessCategory: order.wholesaler.wholesalerProfile?.businessCategory || null,
        },
        connectionId: order.connectionId,
        items: formattedItems,
        summary: {
          totalItems: formattedItems.length,
          totalQuantity,
          subtotal: subtotal.toNumber(),
          allMoqSatisfied,
          canSubmit: formattedItems.length > 0 && allMoqSatisfied,
          moqViolations,
        },
        deliveryMethod: order.deliveryMethod,
        updatedAt: order.updatedAt,
      };
    });

    return {
      totalCarts: carts.length,
      carts,
    };
  }

  /**
   * Add a product to a specific wholesaler's draft cart (or increment quantity).
   */
  static async addItemToCart(retailerId: string, input: AddToCartInput) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify active connection
      const connection = await tx.retailerWholesalerConnection.findFirst({
        where: {
          retailerId,
          wholesalerId: input.wholesalerId,
          connectionStatus: 'active',
        },
        include: {
          wholesaler: true,
        },
      });

      if (!connection) {
        throw new Error('No active connection found with this wholesale supplier');
      }

      // 2. Fetch product and wholesaler's listing if available
      const product = await tx.product.findUnique({
        where: { id: input.productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      const wholesalerProduct = await tx.wholesalerProduct.findUnique({
        where: {
          wholesalerId_productId: {
            wholesalerId: input.wholesalerId,
            productId: input.productId,
          },
        },
      });

      if (wholesalerProduct && wholesalerProduct.stockQuantity !== null && wholesalerProduct.stockQuantity <= 0) {
        throw new Error('Item is currently out of stock in wholesaler godown');
      }

      // Price resolution: wholesalerProduct basePrice -> default to 0
      const unitPrice = wholesalerProduct?.basePrice ? new Prisma.Decimal(wholesalerProduct.basePrice) : new Prisma.Decimal(0);
  
      // 3. Find or create draft Order
      let order = await tx.order.findFirst({
        where: {
          retailerId,
          wholesalerId: input.wholesalerId,
          orderStatus: 'negotiating',
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
            wholesalerId: input.wholesalerId,
            connectionId: connection.id,
            orderNumber,
            orderStatus: 'negotiating',
          },
          include: {
            orderItems: true,
          },
        });
      }
  
      // 4. Add or update OrderItem
      const existingItem = order.orderItems.find((i) => i.productId === input.productId);
      let orderItem = null;
  
      if (existingItem) {
        const newQty = existingItem.quantity + input.quantity;
        orderItem = await tx.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: newQty,
            lineTotal: unitPrice.mul(newQty),
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
            quantity: input.quantity,
            quotedUnitPrice: unitPrice,
            lineTotal: unitPrice.mul(input.quantity),
            batchNumber: wholesalerProduct?.batchNumber || null,
            expiryDate: wholesalerProduct?.expiryDate || null,
          },
        });
      }
  
      // 5. Recalculate order subtotal
      const allItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
      });
      const newSubtotal = allItems.reduce((acc, curr) => acc.plus(curr.lineTotal || 0), new Prisma.Decimal(0));
  
      await tx.order.update({
        where: { id: order.id },
        data: { subtotal: newSubtotal },
      });
  
      const moq = wholesalerProduct?.minimumOrderQuantity ?? 1;
  
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        wholesalerId: input.wholesalerId,
        wholesalerName: connection.wholesaler.businessName,
        orderItemId: orderItem.id,
        productId: input.productId,
        productName: product.productName,
        quantity: orderItem.quantity,
        unitPrice: unitPrice.toNumber(),
        lineTotal: orderItem.lineTotal ? orderItem.lineTotal.toNumber() : 0,
        minimumOrderQuantity: moq,
        isMoqSatisfied: orderItem.quantity >= moq,
        cartSubtotal: newSubtotal.toNumber(),
        totalItemsInCart: allItems.length,
      };
    });
  }
  
  /**
   * Update quantity of a line item in a wholesale cart.
   */
  static async updateItemQuantity(retailerId: string, orderItemId: string, quantity: number) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify item and order ownership
      const orderItem = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        include: {
          order: true,
          product: true,
          wholesalerProduct: true,
        },
      });
  
      if (!orderItem || orderItem.order.retailerId !== retailerId || orderItem.order.orderStatus !== 'negotiating') {
        throw new Error('Cart item not found or unauthorized');
      }
  
      if (quantity === 0) {
        // Delete item
        await tx.orderItem.delete({
          where: { id: orderItemId },
        });
  
        // Recalculate subtotal
        const remaining = await tx.orderItem.findMany({
          where: { orderId: orderItem.orderId },
        });
        const subtotal = remaining.reduce((acc, curr) => acc.plus(curr.lineTotal || 0), new Prisma.Decimal(0));
        await tx.order.update({
          where: { id: orderItem.orderId },
          data: { subtotal },
        });
  
        return {
          deleted: true,
          orderItemId,
          orderId: orderItem.orderId,
          remainingItemsCount: remaining.length,
          cartSubtotal: subtotal.toNumber(),
        };
      }
  
      // Update quantity
      const unitPrice = orderItem.quotedUnitPrice ? new Prisma.Decimal(orderItem.quotedUnitPrice) : new Prisma.Decimal(0);
      const lineTotal = unitPrice.mul(quantity);
  
      const updated = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          quantity,
          lineTotal,
        },
      });
  
      // Recalculate subtotal
      const allItems = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
      });
      const subtotal = allItems.reduce((acc, curr) => acc.plus(curr.lineTotal || 0), new Prisma.Decimal(0));
      await tx.order.update({
        where: { id: orderItem.orderId },
        data: { subtotal },
      });
  
      const moq = orderItem.wholesalerProduct?.minimumOrderQuantity ?? 1;
  
      return {
        deleted: false,
        orderItemId: updated.id,
        orderId: orderItem.orderId,
        quantity: updated.quantity,
        unitPrice: unitPrice.toNumber(),
        lineTotal: lineTotal.toNumber(),
        minimumOrderQuantity: moq,
        isMoqSatisfied: updated.quantity >= moq,
        cartSubtotal: subtotal.toNumber(),
      };
    });
  }

  /**
   * Remove a line item from a wholesale cart.
   */
  static async removeItem(retailerId: string, orderItemId: string) {
    return this.updateItemQuantity(retailerId, orderItemId, 0);
  }

  /**
   * Clear all items from a wholesaler's draft cart.
   */
  static async clearCart(retailerId: string, wholesalerId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          retailerId,
          wholesalerId,
          orderStatus: 'negotiating',
        },
      });
  
      if (!order) {
        throw new Error('Draft cart not found for this wholesaler');
      }
  
      await tx.orderItem.deleteMany({
        where: { orderId: order.id },
      });
  
      await tx.order.update({
        where: { id: order.id },
        data: { subtotal: new Prisma.Decimal(0) },
      });
  
      return {
        success: true,
        orderId: order.id,
        message: 'Wholesale cart cleared',
      };
    });
  }
  
  /**
   * Submit draft cart for live bargaining & order processing.
   */
  static async submitCart(retailerId: string, wholesalerId: string, input: SubmitCartInput) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          retailerId,
          wholesalerId,
          orderStatus: 'negotiating',
        },
        include: {
          wholesaler: true,
          orderItems: {
            include: {
              product: true,
              wholesalerProduct: true,
            },
          },
        },
      });
  
      if (!order || order.orderItems.length === 0) {
        throw new Error('Cannot submit an empty cart');
      }
  
      // Verify MOQs
      const moqFailures = [];
      for (const item of order.orderItems) {
        const moq = item.wholesalerProduct?.minimumOrderQuantity ?? 1;
        if (item.quantity < moq) {
          moqFailures.push(
            `"${item.product.productName}" requires MOQ of ${moq} (currently ${item.quantity})`
          );
        }
      }
  
      if (moqFailures.length > 0) {
        throw new Error(`MOQ requirement not met: ${moqFailures.join('; ')}`);
      }
  
      const subtotal = order.orderItems.reduce((acc, curr) => acc.plus(curr.lineTotal || 0), new Prisma.Decimal(0));
  
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          subtotal,
          deliveryMethod: input.deliveryMethod || null,
        },
      });

      if (order.lifecycleStatus === 'draft') {
        await transitionOrderLifecycleInTransaction(tx, {
          orderId: order.id,
          toStatus: 'submitted',
          actorUserId: retailerId,
          actorRole: 'retailer',
          reason: {
            code: 'retailer_submitted_cart',
            message: 'Retailer submitted the cart for wholesale negotiation',
          },
          expectedFromStatus: 'draft',
        });
      } else if (order.lifecycleStatus !== 'submitted') {
        throw new AppError(
          AppErrorCode.CONFLICT,
          `Order cannot be submitted from lifecycle status ${order.lifecycleStatus}`,
          409,
        );
      }
  
      return {
        success: true,
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        wholesalerId: order.wholesalerId,
        wholesalerName: order.wholesaler.businessName,
        totalItems: order.orderItems.length,
        subtotal: subtotal.toNumber(),
        status: updatedOrder.orderStatus,
        lifecycleStatus: order.lifecycleStatus === 'draft' ? 'submitted' : order.lifecycleStatus,
        message: 'Wholesale cart verified and ready for live price bargaining',
      };
    });
  }
}
