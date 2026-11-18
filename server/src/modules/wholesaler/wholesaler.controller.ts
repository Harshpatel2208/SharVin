import { Response, NextFunction } from 'express';
import { AppError } from '../../utils/app-error';
import { AuthenticatedRequest } from '../../types/auth.types';
import { WholesalerService } from './wholesaler.service';
import { 
  upsertWholesalerProductSchema, 
  updateWholesalerProductSchema,
  fastInventoryUpdateSchema,
  bulkFastInventoryUpdateSchema,
  searchCatalogQuerySchema 
} from './wholesaler.validation';

export class WholesalerController {
  /**
   * Wholesaler: GET /api/v1/wholesaler/catalog
   */
  static async getOwnCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const wholesalerId = req.user!.tenantId;
      const query = searchCatalogQuerySchema.parse(req.query);
      const data = await WholesalerService.getWholesalerCatalog(wholesalerId, query);
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve catalog',
      });
    }
  }

  /**
   * Wholesaler: POST /api/v1/wholesaler/catalog
   */
  static async upsertOwnProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const wholesalerId = req.user!.tenantId;
      const validatedInput = upsertWholesalerProductSchema.parse(req.body);
      const data = await WholesalerService.upsertWholesalerProduct(wholesalerId, validatedInput);
      res.status(201).json({
        success: true,
        message: 'Product catalog item saved successfully',
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to save catalog item',
      });
    }
  }

  /**
   * Wholesaler: PATCH /api/v1/wholesaler/catalog/:wholesalerProductId
   */
  static async updateOwnProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const wholesalerId = req.user!.tenantId;
      const wholesalerProductId = req.params.wholesalerProductId as string;
      const payload = {
        ...req.body,
        ...(req.body.availableQty !== undefined && req.body.stockQuantity === undefined
          ? { stockQuantity: req.body.availableQty }
          : {}),
        ...(req.body.clearanceDiscountPct !== undefined && req.body.clearanceDiscountPercent === undefined
          ? { clearanceDiscountPercent: req.body.clearanceDiscountPct }
          : {}),
      };
      const validatedInput = updateWholesalerProductSchema.parse(payload);
      const data = await WholesalerService.updateWholesalerProduct(
        wholesalerId,
        wholesalerProductId,
        validatedInput
      );
      res.json({
        success: true,
        message: 'Product catalog item updated',
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update catalog item',
      });
    }
  }

  /**
   * Wholesaler: PATCH /api/v1/wholesaler/catalog/:wholesalerProductId/fast-inventory
   */
  static async updateFastInventory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const wholesalerId = req.user!.tenantId;
      const wholesalerProductId = req.params.wholesalerProductId as string;
      const validatedInput = fastInventoryUpdateSchema.parse(req.body);
      const data = await WholesalerService.updateFastInventory(
        wholesalerId,
        wholesalerProductId,
        validatedInput
      );
      res.json({
        success: true,
        message: 'Godown inventory updated successfully',
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update fast inventory',
      });
    }
  }

  /**
   * Wholesaler: POST /api/v1/wholesaler/catalog/bulk-fast-inventory
   */
  static async bulkUpdateFastInventory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const wholesalerId = req.user!.tenantId;
      const validatedInput = bulkFastInventoryUpdateSchema.parse(req.body);
      const data = await WholesalerService.bulkUpdateFastInventory(wholesalerId, validatedInput);
      res.json({
        success: true,
        message: `${data.updatedCount} godown items updated successfully`,
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to bulk update fast inventory',
      });
    }
  }

  /**
   * Wholesaler: DELETE /api/v1/wholesaler/catalog/:wholesalerProductId
   */
  static async deleteOwnProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const wholesalerId = req.user!.tenantId;
      const wholesalerProductId = req.params.wholesalerProductId as string;
      const data = await WholesalerService.deleteWholesalerProduct(wholesalerId, wholesalerProductId);
      res.json(data);
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to unlist catalog item',
      });
    }
  }

  /**
   * Retailer: GET /api/v1/wholesaler/suppliers
   */
  static async getConnectedSuppliers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const suppliers = await WholesalerService.getConnectedSuppliers(retailerId);
      res.json({
        success: true,
        data: suppliers,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch connected suppliers',
      });
    }
  }

  /**
   * Retailer: GET /api/v1/wholesaler/suppliers/:wholesalerId/catalog
   */
  static async getSupplierCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const wholesalerId = req.params.wholesalerId as string;
      const query = searchCatalogQuerySchema.parse(req.query);
      const data = await WholesalerService.getSupplierCatalogForRetailer(retailerId, wholesalerId, query);
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to fetch supplier catalog',
      });
    }
  }

  // ============================================================
  // B2B NETWORK DISCOVERY & CONNECTION
  // ============================================================

  /** GET /api/v1/wholesalers/discover — Retailer only */
  static async discoverWholesalers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const wholesalers = await WholesalerService.discoverWholesalers(retailerId);
      res.json({ success: true, data: wholesalers });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/wholesalers/connect/:wholesalerId — Retailer only */
  static async sendConnectionRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const wholesalerId = String(req.params.wholesalerId);
      const connection = await WholesalerService.sendConnectionRequest(retailerId, wholesalerId);
      res.status(201).json({ success: true, data: connection });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/wholesalers/requests/pending — Wholesaler only */
  static async getPendingRequests(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const wholesalerId = req.user!.tenantId;
      const requests = await WholesalerService.getPendingRequests(wholesalerId);
      res.json({ success: true, data: requests });
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/v1/wholesalers/requests/:id — Wholesaler only */
  static async acceptConnectionRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const wholesalerId = req.user!.tenantId;
      const connectionId = String(req.params.id);
      const creditLimit = Number(req.body.creditLimit);
      const paymentTermDays = Number(req.body.paymentTermDays);

      if (isNaN(creditLimit) || creditLimit < 0) {
        res.status(400).json({ success: false, error: 'Invalid creditLimit' });
        return;
      }
      if (isNaN(paymentTermDays) || paymentTermDays < 1) {
        res.status(400).json({ success: false, error: 'Invalid paymentTermDays' });
        return;
      }

      const connection = await WholesalerService.acceptConnectionRequest(
        wholesalerId,
        connectionId,
        creditLimit,
        paymentTermDays,
      );
      res.json({ success: true, data: connection });
    } catch (error) {
      next(error);
    }
  }
}
