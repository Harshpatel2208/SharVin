import { prisma } from '../../db';
import { Prisma } from '@prisma/client';
import { Logger } from '../../utils/logger';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { 
  UpsertWholesalerProductInput, 
  UpdateWholesalerProductInput,
  FastInventoryUpdateInput,
  BulkFastInventoryUpdateInput,
  SearchCatalogQuery 
} from './wholesaler.validation';

export interface ExpiryStatusDetails {
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  isNearExpiryWarning: boolean; // <= 45 days (yellow warning badge on order line)
  isNearExpiryClearance: boolean; // <= 60 days (Near-Expiry Clearance tag)
  statusTag: 'EXPIRED' | 'NEAR_EXPIRY_CRITICAL' | 'NEAR_EXPIRY_CLEARANCE' | 'FRESH' | 'NO_EXPIRY';
}

const inventoryConflict = () => new AppError(
  AppErrorCode.CONFLICT,
  'Inventory state changed. Please refresh and try again.',
  409
);

const isPrismaRecordChanged = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

export function computeExpiryStatus(expiryDateInput: Date | string | null | undefined): ExpiryStatusDetails {
  if (!expiryDateInput) {
    return {
      expiryDate: null,
      daysUntilExpiry: null,
      isExpired: false,
      isNearExpiryWarning: false,
      isNearExpiryClearance: false,
      statusTag: 'NO_EXPIRY',
    };
  }

  const exp = new Date(expiryDateInput);
  if (isNaN(exp.getTime())) {
    return {
      expiryDate: null,
      daysUntilExpiry: null,
      isExpired: false,
      isNearExpiryWarning: false,
      isNearExpiryClearance: false,
      statusTag: 'NO_EXPIRY',
    };
  }

  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const isExpired = daysUntilExpiry <= 0;
  const isNearExpiryWarning = !isExpired && daysUntilExpiry <= 45;
  const isNearExpiryClearance = !isExpired && daysUntilExpiry <= 60;

  let statusTag: ExpiryStatusDetails['statusTag'] = 'FRESH';
  if (isExpired) {
    statusTag = 'EXPIRED';
  } else if (isNearExpiryWarning) {
    statusTag = 'NEAR_EXPIRY_CRITICAL';
  } else if (isNearExpiryClearance) {
    statusTag = 'NEAR_EXPIRY_CLEARANCE';
  }

  return {
    expiryDate: exp.toISOString().slice(0, 10),
    daysUntilExpiry,
    isExpired,
    isNearExpiryWarning,
    isNearExpiryClearance,
    statusTag,
  };
}

export class WholesalerService {
  /** Create or link a catalog product owned by this wholesaler. */
  static async upsertWholesalerProduct(wholesalerId: string, input: UpsertWholesalerProductInput) {
    if (input.marginFloorPrice !== undefined && input.marginFloorPrice > input.basePrice) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Margin floor cannot exceed base price', 400);
    }
    return prisma.$transaction(async (tx) => {
      let productId = input.productId;
      if (productId) {
        const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!product) throw new AppError(AppErrorCode.NOT_FOUND, 'Product not found', 404);
      } else {
        const product = await tx.product.create({
          data: {
            productName: input.productName!,
            brandName: input.brandName,
            manufacturerBarcode: input.barcode || undefined,
            unitOfMeasure: input.unitOfMeasure,
            createdByUserId: wholesalerId,
          },
          select: { id: true },
        });
        productId = product.id;
      }

      const existing = await tx.wholesalerProduct.findUnique({
        where: { wholesalerId_productId: { wholesalerId, productId } },
        select: { id: true, version: true },
      });
      const data = {
        wholesalerId,
        productId,
        basePrice: input.basePrice,
        marginFloorPrice: input.marginFloorPrice,
        minimumOrderQuantity: input.minimumOrderQuantity,
        stockQuantity: input.stockQuantity,
        lowStockThreshold: input.lowStockThreshold,
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        isClearance: input.isClearance,
        clearanceDiscountPercent: input.clearanceDiscountPercent,
        isActive: input.isActive,
      };
      let record;
      try {
        record = existing
          ? await tx.wholesalerProduct.update({
              where: { id: existing.id, version: existing.version },
              data: { ...data, version: { increment: 1 } },
              include: { product: true },
            })
          : await tx.wholesalerProduct.create({ data, include: { product: true } });
      } catch (error) {
        if (isPrismaRecordChanged(error)) throw inventoryConflict();
        throw error;
      }
      return {
        wholesalerProductId: record.id,
        productId: record.productId,
        productName: record.product.productName,
        basePrice: Number(record.basePrice),
        marginFloorPrice: record.marginFloorPrice ? Number(record.marginFloorPrice) : null,
        minimumOrderQuantity: record.minimumOrderQuantity,
        stockQuantity: record.stockQuantity,
        version: record.version,
        lowStockThreshold: record.lowStockThreshold,
        isActive: record.isActive,
      };
    });
  }

  /**
   * Wholesaler: Retrieve own catalog items with batch numbers, expiry dates, and near-expiry tags.
   */
  static async getWholesalerCatalog(wholesalerId: string, query?: SearchCatalogQuery) {
    try {
      const searchFilter = query?.query && query.query.trim().length > 0 ? {
        OR: [
          { productName: { contains: query.query.trim(), mode: 'insensitive' as const } },
          { brandName: { contains: query.query.trim(), mode: 'insensitive' as const } },
          { manufacturerBarcode: { contains: query.query.trim() } },
          { systemGeneratedBarcode: { contains: query.query.trim() } },
        ],
      } : undefined;

      const page = query?.page || 1;
      const limit = query?.limit || 50;
      const skip = (page - 1) * limit;

      const [total, items] = await Promise.all([
        prisma.wholesalerProduct.count({
          where: {
            wholesalerId,
            product: searchFilter,
          },
        }),
        prisma.wholesalerProduct.findMany({
          where: {
            wholesalerId,
            product: searchFilter,
          },
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
      ]);

      return {
        total,
        page,
        limit,
        items: items.map((wp: any) => {
            const expiryStatus = computeExpiryStatus(wp.expiryDate);
            const marginFloor = wp.marginFloorPrice ? Number(wp.marginFloorPrice) : Number((Number(wp.basePrice) * 0.9).toFixed(2));
            const isClearanceActive = wp.isClearance || expiryStatus.isNearExpiryClearance;
            const discountPct = wp.clearanceDiscountPercent ? Number(wp.clearanceDiscountPercent) : (expiryStatus.isNearExpiryClearance ? 15 : 0);
            const effectivePrice = isClearanceActive && discountPct > 0 
              ? Number((Number(wp.basePrice) * (1 - discountPct / 100)).toFixed(2))
              : Number(wp.basePrice);

            return {
              wholesalerProductId: wp.id,
              productId: wp.productId,
              productName: wp.product.productName,
              brandName: wp.product.brandName,
              category: wp.product.category?.categoryName || null,
              barcode: wp.product.manufacturerBarcode || wp.product.systemGeneratedBarcode,
              unitOfMeasure: wp.product.unitOfMeasure,
              basePrice: Number(wp.basePrice),
              availableQty: wp.stockQuantity ?? 0,
              version: wp.version,
              marginFloorPrice: marginFloor,
              minimumOrderQuantity: wp.minimumOrderQuantity,
              stockQuantity: wp.stockQuantity,
              lowStockThreshold: wp.lowStockThreshold,
              batchNumber: wp.batchNumber || null,
              expiryDate: wp.expiryDate ? new Date(wp.expiryDate).toISOString().slice(0, 10) : null,
              expiryStatus,
              isNearExpiryWarning: expiryStatus.isNearExpiryWarning,
              isNearExpiryClearance: expiryStatus.isNearExpiryClearance,
              isClearance: isClearanceActive,
              clearanceDiscountPercent: discountPct,
              clearanceDiscountPct: discountPct,
              gstRate: wp.product.gstRate ?? null,
              isNearExpiry: Boolean(wp.expiryDate && new Date(wp.expiryDate).getTime() <= Date.now() + 60 * 24 * 60 * 60 * 1000),
              effectivePrice,
              isOutOfStock: wp.stockQuantity !== null && wp.stockQuantity <= 0,
              isActive: wp.isActive,
              createdAt: wp.createdAt,
              updatedAt: wp.updatedAt,
            };
          }),
      };
    } catch (err) { throw err; }
  }

  /**
   * Wholesaler: Update existing catalog item.
   */
  static async updateWholesalerProduct(
    wholesalerId: string, 
    wholesalerProductId: string, 
    input: UpdateWholesalerProductInput
  ) {
    if (input.marginFloorPrice !== undefined && input.marginFloorPrice !== null && input.basePrice !== undefined && input.marginFloorPrice > input.basePrice) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Margin floor cannot exceed base price', 400);
    }
    try {
      const existing = await prisma.wholesalerProduct.findFirst({
        where: {
          id: wholesalerProductId,
          wholesalerId,
        },
      });

      if (!existing) throw new AppError(AppErrorCode.NOT_FOUND, 'Catalog item not found', 404);

      const effectiveBasePrice = input.basePrice !== undefined ? input.basePrice : Number(existing.basePrice);
      if (input.marginFloorPrice !== undefined && input.marginFloorPrice !== null && input.marginFloorPrice > effectiveBasePrice) {
        throw new AppError(AppErrorCode.BAD_REQUEST, 'Margin floor cannot exceed base price', 400);
      }

      if (existing) {
        let updated;
        try {
          updated = await prisma.wholesalerProduct.update({
          where: { id: wholesalerProductId, version: existing.version },
          data: {
            basePrice: input.basePrice !== undefined ? input.basePrice : undefined,
            marginFloorPrice: input.marginFloorPrice !== undefined ? (input.marginFloorPrice === null ? null : input.marginFloorPrice) : undefined,
            minimumOrderQuantity: input.minimumOrderQuantity !== undefined ? input.minimumOrderQuantity : undefined,
            stockQuantity: input.stockQuantity !== undefined ? input.stockQuantity : undefined,
            lowStockThreshold: input.lowStockThreshold !== undefined ? input.lowStockThreshold : undefined,
            batchNumber: input.batchNumber !== undefined ? input.batchNumber : undefined,
            expiryDate: input.expiryDate !== undefined ? (input.expiryDate ? new Date(input.expiryDate) : null) : undefined,
            isClearance: input.isClearance !== undefined ? input.isClearance : undefined,
            clearanceDiscountPercent: input.clearanceDiscountPercent !== undefined ? (input.clearanceDiscountPercent === null ? null : input.clearanceDiscountPercent) : undefined,
            isActive: input.isActive !== undefined ? input.isActive : undefined,
            version: { increment: 1 },
          },
          include: {
            product: true,
          },
          });
        } catch (error) {
          if (isPrismaRecordChanged(error)) throw inventoryConflict();
          throw error;
        }

        const expiryStatus = computeExpiryStatus(updated.expiryDate);
        return {
          wholesalerProductId: updated.id,
          productId: updated.productId,
          productName: updated.product.productName,
          basePrice: Number(updated.basePrice),
          availableQty: updated.stockQuantity ?? 0,
          gstRate: (updated.product as any).gstRate ?? null,
          marginFloorPrice: updated.marginFloorPrice ? Number(updated.marginFloorPrice) : null,
          minimumOrderQuantity: updated.minimumOrderQuantity,
          stockQuantity: updated.stockQuantity,
          version: updated.version,
          lowStockThreshold: updated.lowStockThreshold,
          batchNumber: updated.batchNumber,
          expiryDate: updated.expiryDate ? updated.expiryDate.toISOString().slice(0, 10) : null,
          expiryStatus,
          isNearExpiryWarning: expiryStatus.isNearExpiryWarning,
          isNearExpiryClearance: expiryStatus.isNearExpiryClearance,
          isClearance: updated.isClearance,
          clearanceDiscountPercent: updated.clearanceDiscountPercent ? Number(updated.clearanceDiscountPercent) : 0,
          clearanceDiscountPct: updated.clearanceDiscountPercent ? Number(updated.clearanceDiscountPercent) : 0,
          isNearExpiry: Boolean(updated.expiryDate && updated.expiryDate.getTime() <= Date.now() + 60 * 24 * 60 * 60 * 1000),
          isActive: updated.isActive,
        };
      }
      throw new AppError(AppErrorCode.NOT_FOUND, 'Catalog item not found', 404);
    } catch (err) { throw err; }
  }

  /**
   * Wholesaler: Fast inline update for physical godown stock, base price, margin floor, batch & expiry.
   */
  static async updateFastInventory(
    wholesalerId: string,
    wholesalerProductId: string,
    input: FastInventoryUpdateInput
  ) {
    try {
      const existing = await prisma.wholesalerProduct.findFirst({
        where: {
          id: wholesalerProductId,
          wholesalerId,
        },
        include: {
          product: true,
        },
      });

      if (!existing) throw new AppError(AppErrorCode.NOT_FOUND, 'Catalog item not found', 404);

      if (existing) {
        let updated;
        try {
          updated = await prisma.wholesalerProduct.update({
          where: { id: wholesalerProductId, version: existing.version },
          data: {
            stockQuantity: input.stockQuantity !== undefined ? input.stockQuantity : undefined,
            basePrice: input.basePrice !== undefined ? input.basePrice : undefined,
            marginFloorPrice: input.marginFloorPrice !== undefined ? (input.marginFloorPrice === null ? null : input.marginFloorPrice) : undefined,
            batchNumber: input.batchNumber !== undefined ? input.batchNumber : undefined,
            expiryDate: input.expiryDate !== undefined ? (input.expiryDate ? new Date(input.expiryDate) : null) : undefined,
            isClearance: input.isClearance !== undefined ? input.isClearance : undefined,
            clearanceDiscountPercent: input.clearanceDiscountPercent !== undefined ? (input.clearanceDiscountPercent === null ? null : input.clearanceDiscountPercent) : undefined,
            version: { increment: 1 },
          },
          include: {
            product: true,
          },
          });
        } catch (error) {
          if (isPrismaRecordChanged(error)) throw inventoryConflict();
          throw error;
        }

        const expiryStatus = computeExpiryStatus(updated.expiryDate);
        const marginFloor = updated.marginFloorPrice ? Number(updated.marginFloorPrice) : Number((Number(updated.basePrice) * 0.9).toFixed(2));
        const isClearanceActive = updated.isClearance || expiryStatus.isNearExpiryClearance;
        const discountPct = updated.clearanceDiscountPercent ? Number(updated.clearanceDiscountPercent) : (expiryStatus.isNearExpiryClearance ? 15 : 0);
        const effectivePrice = isClearanceActive && discountPct > 0 
          ? Number((Number(updated.basePrice) * (1 - discountPct / 100)).toFixed(2))
          : Number(updated.basePrice);

        return {
          wholesalerProductId: updated.id,
          productId: updated.productId,
          productName: updated.product.productName,
          stockQuantity: updated.stockQuantity,
          version: updated.version,
          basePrice: Number(updated.basePrice),
          marginFloorPrice: marginFloor,
          batchNumber: updated.batchNumber,
          expiryDate: updated.expiryDate ? updated.expiryDate.toISOString().slice(0, 10) : null,
          expiryStatus,
          isNearExpiryWarning: expiryStatus.isNearExpiryWarning,
          isNearExpiryClearance: expiryStatus.isNearExpiryClearance,
          isClearance: isClearanceActive,
          clearanceDiscountPercent: discountPct,
          effectivePrice,
          isOutOfStock: updated.stockQuantity !== null && updated.stockQuantity <= 0,
          updatedAt: updated.updatedAt,
        };
      }
      throw new AppError(AppErrorCode.NOT_FOUND, 'Catalog item not found', 404);
    } catch (err) { throw err; }
  }

  /**
   * Wholesaler: Bulk fast inventory update across multiple items.
   */
  static async bulkUpdateFastInventory(
    wholesalerId: string,
    input: BulkFastInventoryUpdateInput
  ) {
    const results = [];
    for (const updateItem of input.updates) {
      const res = await this.updateFastInventory(wholesalerId, updateItem.wholesalerProductId, updateItem);
      results.push(res);
    }
    return {
      updatedCount: results.length,
      items: results,
    };
  }

  /**
   * Wholesaler: Soft delete / unlist item.
   */
  static async deleteWholesalerProduct(wholesalerId: string, wholesalerProductId: string) {
    try {
      const existing = await prisma.wholesalerProduct.findFirst({
        where: {
          id: wholesalerProductId,
          wholesalerId,
        },
      });

      if (!existing) throw new AppError(AppErrorCode.NOT_FOUND, 'Catalog item not found', 404);

      if (existing) {
        await prisma.wholesalerProduct.update({
          where: { id: wholesalerProductId },
          data: { isActive: false },
        });
        return { success: true, message: 'Item unlisted from active catalog' };
      }
      throw new AppError(AppErrorCode.NOT_FOUND, 'Catalog item not found', 404);
    } catch (err) { throw err; }
  }

  /**
   * Retailer: Discover connected suppliers.
   */
  static async getConnectedSuppliers(retailerId: string) {
    try {
      const connections = await prisma.retailerWholesalerConnection.findMany({
        where: {
          retailerId,
          connectionStatus: 'active',
        },
        include: {
          wholesaler: {
            include: {
              wholesalerProfile: true,
              wholesalerProducts: {
                where: { isActive: true },
                select: { id: true },
              },
            },
          },
        },
        orderBy: {
          totalOrdersPlaced: 'desc',
        },
      });

      return connections.map((c) => ({
          connectionId: c.id,
          wholesalerId: c.wholesalerId,
          businessName: c.wholesaler.businessName,
          phoneNumber: c.wholesaler.phoneNumber,
          gstNumber: c.wholesaler.wholesalerProfile?.gstNumber || null,
          businessCategory: c.wholesaler.wholesalerProfile?.businessCategory || null,
          defaultDeliveryRangeKm: c.wholesaler.wholesalerProfile?.defaultDeliveryRangeKm || null,
          totalOrdersPlaced: c.totalOrdersPlaced,
          totalAmountTraded: Number(c.totalAmountTraded),
          activeCatalogCount: c.wholesaler.wholesalerProducts.length,
          connectedSince: c.createdAt,
        }));
    } catch (err: any) {
      Logger.warn(`[WholesalerService] DB fallback for getConnectedSuppliers:`, err.message);
      throw err;
    }


  }

  /**
   * Retailer: View active catalog of a specific connected supplier with stock, expiry warnings, and clearance flags.
   */
  static async getSupplierCatalogForRetailer(
    retailerId: string, 
    wholesalerId: string, 
    query?: SearchCatalogQuery
  ) {
    try {
      const connection = await prisma.retailerWholesalerConnection.findFirst({
        where: {
          retailerId,
          wholesalerId,
          connectionStatus: 'active',
        },
        include: {
          wholesaler: true,
        },
      });

      if (connection) {
        const searchFilter = query?.query && query.query.trim().length > 0 ? {
          OR: [
            { productName: { contains: query.query.trim(), mode: 'insensitive' as const } },
            { brandName: { contains: query.query.trim(), mode: 'insensitive' as const } },
            { manufacturerBarcode: { contains: query.query.trim() } },
          ],
        } : undefined;

        const page = query?.page || 1;
        const limit = query?.limit || 50;
        const skip = (page - 1) * limit;

        const [total, items] = await Promise.all([
          prisma.wholesalerProduct.count({
            where: {
              wholesalerId,
              isActive: true,
              product: searchFilter,
            },
          }),
          prisma.wholesalerProduct.findMany({
            where: {
              wholesalerId,
              isActive: true,
              product: searchFilter,
            },
            include: {
              product: {
                include: {
                  category: true,
                },
              },
            },
            orderBy: {
              basePrice: 'asc',
            },
            skip,
            take: limit,
          }),
        ]);

        return {
          supplier: {
            wholesalerId: connection.wholesalerId,
            businessName: connection.wholesaler.businessName,
            phoneNumber: connection.wholesaler.phoneNumber,
          },
          total,
          page,
          limit,
          catalog: items.map((wp: any) => {
            const expiryStatus = computeExpiryStatus(wp.expiryDate);
            const isClearanceActive = wp.isClearance || expiryStatus.isNearExpiryClearance;
            const discountPct = wp.clearanceDiscountPercent ? Number(wp.clearanceDiscountPercent) : (expiryStatus.isNearExpiryClearance ? 15 : 0);
            const effectivePrice = isClearanceActive && discountPct > 0 
              ? Number((Number(wp.basePrice) * (1 - discountPct / 100)).toFixed(2))
              : Number(wp.basePrice);
            const isOutOfStock = wp.stockQuantity !== null && wp.stockQuantity <= 0;

            return {
              wholesalerProductId: wp.id,
              productId: wp.productId,
              productName: wp.product.productName,
              brandName: wp.product.brandName,
              category: wp.product.category?.categoryName || null,
              barcode: wp.product.manufacturerBarcode || wp.product.systemGeneratedBarcode,
              unitOfMeasure: wp.product.unitOfMeasure,
              basePrice: Number(wp.basePrice),
              effectivePrice,
              marginFloorPrice: wp.marginFloorPrice ? Number(wp.marginFloorPrice) : null,
              minimumOrderQuantity: wp.minimumOrderQuantity,
              stockAvailable: wp.stockQuantity !== null ? wp.stockQuantity : null,
              isAvailable: !isOutOfStock,
              isOutOfStock,
              batchNumber: wp.batchNumber || null,
              expiryDate: wp.expiryDate ? new Date(wp.expiryDate).toISOString().slice(0, 10) : null,
              expiryStatus,
              isNearExpiryWarning: expiryStatus.isNearExpiryWarning,
              isNearExpiryClearance: expiryStatus.isNearExpiryClearance,
              isClearance: isClearanceActive,
              clearanceDiscountPercent: discountPct,
            };
          }),
        };
      }
      return { supplier: null, total: 0, page: query?.page || 1, limit: query?.limit || 50, catalog: [] };
    } catch (err: any) {
      Logger.warn(`[WholesalerService] DB fallback for getSupplierCatalogForRetailer:`, err.message);
      throw err;
    }


  }

  // ============================================================
  // B2B NETWORK DISCOVERY & CONNECTION
  // ============================================================

  /**
   * GET /api/v1/wholesalers/discover
   * Returns all verified wholesalers NOT yet connected (pending or active) to this retailer.
   */
  static async discoverWholesalers(retailerId: string) {
    // Collect wholesalerIds already in any connection with this retailer
    const existing = await prisma.retailerWholesalerConnection.findMany({
      where: { retailerId },
      select: { wholesalerId: true },
    });
    const connectedIds = existing.map((c) => c.wholesalerId);

    const wholesalers = await prisma.user.findMany({
      where: {
        userType: 'wholesaler',
        isEmailVerified: true,
        id: { notIn: [retailerId, ...connectedIds] },
      },
      include: {
        wholesalerProfile: { select: { gstNumber: true, businessCategory: true } },
        addresses: { take: 1, select: { city: true, state: true } },
      },
      orderBy: { businessName: 'asc' },
    });

    return wholesalers.map((w) => ({
      id: w.id,
      businessName: w.businessName ?? w.fullName,
      phoneNumber: w.phoneNumber ?? '',
      city: w.addresses[0]?.city ?? null,
      state: w.addresses[0]?.state ?? null,
      gstNumber: w.wholesalerProfile?.gstNumber ?? null,
      businessCategory: w.wholesalerProfile?.businessCategory ?? null,
      productCategories: w.wholesalerProfile?.businessCategory
        ? w.wholesalerProfile.businessCategory.split(',').map((s) => s.trim())
        : null,
    }));
  }

  /**
   * POST /api/v1/wholesalers/connect/:wholesalerId
   * Retailer sends a connection request → creates record with connectionStatus = pending.
   */
  static async sendConnectionRequest(retailerId: string, wholesalerId: string) {
    // Validate target is a wholesaler
    const wholesaler = await prisma.user.findFirst({
      where: { id: wholesalerId, userType: 'wholesaler' },
    });
    if (!wholesaler) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Wholesaler not found', 404);
    }

    // Check for existing connection
    const existing = await prisma.retailerWholesalerConnection.findUnique({
      where: { retailerId_wholesalerId: { retailerId, wholesalerId } },
    });
    if (existing) {
      if (existing.connectionStatus === 'active') {
        throw new AppError(AppErrorCode.CONFLICT, 'Already connected to this wholesaler', 409);
      }
      if (existing.connectionStatus === 'pending') {
        return existing; // idempotent — already pending
      }
    }

    return prisma.retailerWholesalerConnection.create({
      data: {
        retailerId,
        wholesalerId,
        connectionStatus: 'pending',
        creditLimit: 0,
        paymentTermDays: 30,
      },
    });
  }

  /**
   * GET /api/v1/wholesalers/requests/pending
   * Returns all pending connection requests directed at this wholesaler.
   */
  static async getPendingRequests(wholesalerId: string) {
    return prisma.retailerWholesalerConnection.findMany({
      where: { wholesalerId, connectionStatus: 'pending' },
      include: {
        retailer: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            phoneNumber: true,
            addresses: { take: 1, select: { city: true, state: true } },
            retailerProfile: { select: { gstNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * PATCH /api/v1/wholesalers/requests/:connectionId
   * Wholesaler accepts a pending request and assigns credit terms.
   */
  static async acceptConnectionRequest(
    wholesalerId: string,
    connectionId: string,
    creditLimit: number,
    paymentTermDays: number,
  ) {
    const connection = await prisma.retailerWholesalerConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Connection request not found', 404);
    }
    if (connection.wholesalerId !== wholesalerId) {
      throw new AppError(AppErrorCode.FORBIDDEN, 'You are not authorised to accept this request', 403);
    }
    if (connection.connectionStatus !== 'pending') {
      throw new AppError(AppErrorCode.CONFLICT, 'This connection is not in a pending state', 409);
    }

    return prisma.retailerWholesalerConnection.update({
      where: { id: connectionId },
      data: {
        connectionStatus: 'active',
        creditLimit,
        paymentTermDays,
      },
      include: {
        retailer: { select: { businessName: true, fullName: true } },
      },
    });
  }
}

