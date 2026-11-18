import { prisma } from '../../db';
import { Prisma } from '@prisma/client';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { UpsertProductInput, CreateSaleInput } from './pos.validation';

export class PosService {
  private static inventoryConflict(): AppError {
    return new AppError(AppErrorCode.CONFLICT, 'Inventory state changed. Please refresh and try again.', 409);
  }

  /**
   * Search retailer's inventory by product name or barcode.
   */
  static async searchProducts(retailerId: string, query?: string) {
    const searchFilter = query && query.trim().length > 0 ? {
      OR: [
        { productName: { contains: query.trim(), mode: 'insensitive' as const } },
        { manufacturerBarcode: { contains: query.trim() } },
        { systemGeneratedBarcode: { contains: query.trim() } },
        { brandName: { contains: query.trim(), mode: 'insensitive' as const } },
      ],
    } : undefined;

    const inventoryItems = await prisma.retailerInventory.findMany({
      where: {
        retailerId,
        product: searchFilter,
      },
      include: {
        product: true,
      },
      orderBy: {
        lastSoldAt: 'desc',
      },
    });

    return inventoryItems.map((inv) => ({
      inventoryId: inv.id,
      productId: inv.productId,
      productName: inv.product.productName,
      brandName: inv.product.brandName,
      barcode: inv.product.manufacturerBarcode || inv.product.systemGeneratedBarcode,
      unitOfMeasure: inv.product.unitOfMeasure,
      currentStock: inv.currentStock,
      version: inv.version,
      sellingPrice: Number(inv.sellingPrice ?? 0),
      costPrice: Number(inv.costPrice ?? 0),
      lowStockThreshold: inv.lowStockThreshold,
      isLowStock: inv.currentStock <= inv.lowStockThreshold,
      hasWarranty: inv.product.hasWarranty,
      warrantyDurationMonths: inv.product.warrantyDurationMonths,
      lastSoldAt: inv.lastSoldAt,
    }));
  }

  /**
   * Upsert a product into the retailer's inventory catalog.
   */
  static async upsertProduct(retailerId: string, input: UpsertProductInput) {
    return prisma.$transaction(async (tx) => {
      // Find or create the master product
      let product = null;
      if (input.barcode) {
        product = await tx.product.findFirst({
          where: {
            OR: [
              { manufacturerBarcode: input.barcode },
              { systemGeneratedBarcode: input.barcode },
            ],
          },
        });
      }

      if (!product) {
        // Create new master product
        const sysBarcode = input.barcode ? null : `BC-${Date.now().toString().slice(-8)}`;
        product = await tx.product.create({
          data: {
            productName: input.productName,
            brandName: input.brandName || null,
            manufacturerBarcode: input.barcode || null,
            systemGeneratedBarcode: sysBarcode,
            unitOfMeasure: input.unitOfMeasure,
            hasWarranty: input.hasWarranty,
            warrantyDurationMonths: input.warrantyDurationMonths || null,
            createdByUserId: retailerId,
          },
        });
      }

      // Upsert into retailer inventory
      const existingInventory = await tx.retailerInventory.findUnique({
        where: { retailerId_productId: { retailerId, productId: product.id } },
      });
      let inventory;
      try {
        inventory = existingInventory
          ? await tx.retailerInventory.update({
              where: { id: existingInventory.id, version: existingInventory.version },
              data: {
                sellingPrice: input.sellingPrice,
                costPrice: input.costPrice !== undefined ? input.costPrice : undefined,
                lowStockThreshold: input.lowStockThreshold,
                version: { increment: 1 },
              },
              include: { product: true },
            })
          : await tx.retailerInventory.create({
        data: {
          retailerId,
          productId: product.id,
          currentStock: input.initialStock,
          sellingPrice: input.sellingPrice,
          costPrice: input.costPrice || 0,
          lowStockThreshold: input.lowStockThreshold,
        },
        include: { product: true },
      });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2025' || error.code === 'P2002')) {
          throw this.inventoryConflict();
        }
        throw error;
      }

      return {
        inventoryId: inventory.id,
        productId: product.id,
        productName: product.productName,
        barcode: product.manufacturerBarcode || product.systemGeneratedBarcode,
        currentStock: inventory.currentStock,
        version: inventory.version,
        sellingPrice: Number(inventory.sellingPrice),
        costPrice: Number(inventory.costPrice),
        lowStockThreshold: inventory.lowStockThreshold,
        brandName: product.brandName,
        unitOfMeasure: product.unitOfMeasure,
        hasWarranty: product.hasWarranty,
        warrantyDurationMonths: product.warrantyDurationMonths,
      };
    });
  }

  /**
   * Record POS counter sale bill, decrement stock, and raise stock alerts if necessary.
   */
  static async recordSale(retailerId: string, input: CreateSaleInput) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify stock availability for all items
      const productIds = input.items.map((i) => i.productId);
      const inventoryList = await tx.retailerInventory.findMany({
        where: {
          retailerId,
          productId: { in: productIds },
        },
        include: {
          product: true,
        },
      });
  
      const invMap = new Map(inventoryList.map((inv) => [inv.productId, inv]));
  
      // Lock all affected inventory rows in a deterministic order to avoid deadlocks.
      for (const id of inventoryList.map((inv) => inv.id).sort()) {
        await tx.$queryRaw`SELECT inventory_id FROM retailer_inventory WHERE inventory_id = ${id} FOR UPDATE`;
      }
  
      let totalGross = new Prisma.Decimal(0);
      let hasAnyWarranty = false;
  
      for (const item of input.items) {
        const inv = invMap.get(item.productId);
        if (!inv) {
          throw new AppError(AppErrorCode.NOT_FOUND, `Product ID ${item.productId} is not in your store inventory`, 404);
        }
        if (inv.currentStock < item.quantity) {
          throw new AppError(
            AppErrorCode.STOCK_EXHAUSTED,
            `Insufficient stock for "${inv.product.productName}". Available: ${inv.currentStock}, Requested: ${item.quantity}`,
            409
          );
        }
  
        const lineSubtotal = new Prisma.Decimal(item.unitPrice).mul(item.quantity).minus(item.discount);
        totalGross = totalGross.plus(lineSubtotal);
  
        if (inv.product.hasWarranty) {
          hasAnyWarranty = true;
        }
      }
  
      const totalAmount = totalGross;
       const netAmount = Prisma.Decimal.max(0, totalAmount.minus(input.discountAmount).plus(input.taxAmount));
  
      // 2. Generate unique human-readable bill number
      const billNumber = `POS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  
      // 3. Create the sale record
      const sale = await tx.retailerSales.create({
        data: {
          retailerId,
          billNumber,
          customerName: input.customerName || null,
          customerPhone: input.customerPhone || null,
          customerEmail: input.customerEmail || null,
          customerAddress: input.customerAddress || null,
          totalAmount: totalAmount,
          discountAmount: input.discountAmount,
          taxAmount: input.taxAmount,
          netAmount: netAmount,
          paymentMethod: input.paymentMethod,
          hasWarrantyItems: hasAnyWarranty,
        },
      });
  
      // 4. Create sale items & decrement stock
      const createdItems = [];
      const lowStockAlerts = [];
  
      for (const item of input.items) {
        const inv = invMap.get(item.productId)!;
        const subtotal = new Prisma.Decimal(item.unitPrice).mul(item.quantity).minus(item.discount);
  
        let warrantyValidUntil: Date | null = null;
        if (inv.product.hasWarranty && inv.product.warrantyDurationMonths) {
          const validDate = new Date();
          validDate.setMonth(validDate.getMonth() + inv.product.warrantyDurationMonths);
          warrantyValidUntil = validDate;
        }
  
        const saleItem = await tx.retailerSaleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            subtotal: subtotal,
            hasWarranty: inv.product.hasWarranty,
            warrantyValidUntil,
          },
        });
  
        // Decrement stock atomically (guards against concurrent oversell)
        const [updated] = await tx.$queryRaw<Array<{
          current_stock: number;
          low_stock_threshold: number;
          reorder_quantity: number | null;
        }>>`
          UPDATE retailer_inventory
          SET current_stock = current_stock - ${item.quantity},
              version = version + 1,
              last_sold_at = NOW(),
              sales_last_7_days = sales_last_7_days + ${item.quantity},
              sales_last_30_days = sales_last_30_days + ${item.quantity},
              updated_at = NOW()
          WHERE inventory_id = ${inv.id}
            AND version = ${inv.version}
            AND current_stock >= ${item.quantity}
          RETURNING current_stock, low_stock_threshold, reorder_quantity
        `;
  
        if (!updated) {
          throw new AppError(
            AppErrorCode.CONFLICT,
            'Inventory state changed. Please refresh and try again.',
            409
          );
        }
  
        const newStock = updated.current_stock;
        const lowStockThreshold = updated.low_stock_threshold;
        const reorderQuantity = updated.reorder_quantity;
  
        // Check if low stock threshold breached
        if (newStock <= lowStockThreshold) {
          lowStockAlerts.push({
            productId: item.productId,
            productName: inv.product.productName,
            remainingStock: newStock,
            threshold: lowStockThreshold,
          });
  
          // Log stock alert (skip if a pending alert already exists; the row lock
          // acquired by the atomic stock update serializes concurrent sales)
          const existingAlert = await tx.stockAlert.findFirst({
            where: {
              retailerId,
              productId: item.productId,
              actionTaken: 'pending',
            },
            select: { id: true },
          });

          if (!existingAlert) {
            await tx.stockAlert.create({
              data: {
                retailerId,
                inventoryId: inv.id,
                productId: item.productId,
                alertType: 'real_time_sale',
                currentStock: newStock,
                lowStockThreshold: lowStockThreshold,
                recommendedQuantity: reorderQuantity || lowStockThreshold * 2,
                actionTaken: 'pending',
              },
            });
          }
        }
  
        createdItems.push({
          id: saleItem.id,
          productName: inv.product.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: subtotal.toNumber(),
          remainingStock: newStock,
        });
      }
  
      return {
        saleId: sale.id,
        billNumber: sale.billNumber,
        saleDate: sale.saleDate,
        totalAmount: sale.totalAmount.toNumber(),
        discountAmount: sale.discountAmount.toNumber(),
        taxAmount: sale.taxAmount.toNumber(),
        netAmount: sale.netAmount.toNumber(),
        paymentMethod: sale.paymentMethod,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        items: createdItems,
        lowStockAlerts,
      };
    });
  }
}
