import { Response, NextFunction } from 'express';
import { AppError } from '../../utils/app-error';
import { PosService } from './pos.service';
import { upsertProductSchema, createSaleSchema } from './pos.validation';
import { AuthenticatedRequest } from '../../types/auth.types';

export class PosController {
  static async getProducts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user?.tenantId;
      if (!retailerId) {
        res.status(401).json({ success: false, data: null, error: 'Unauthorized' });
        return;
      }

      const query = typeof req.query.q === 'string' ? req.query.q : undefined;
      const products = await PosService.searchProducts(retailerId, query);

      res.status(200).json({
        success: true,
        data: products,
        total: products.length,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Failed to search products',
      });
    }
  }

  static async upsertProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user?.tenantId;
      if (!retailerId) {
        res.status(401).json({ success: false, data: null, error: 'Unauthorized' });
        return;
      }

      const validation = upsertProductSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const product = await PosService.upsertProduct(retailerId, validation.data);
      res.status(201).json({
        success: true,
        data: product,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        data: null,
        error: error.message || 'Failed to save product',
      });
    }
  }

  static async recordSale(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user?.tenantId;
      if (!retailerId) {
        res.status(401).json({ success: false, data: null, error: 'Unauthorized' });
        return;
      }

      const validation = createSaleSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const receipt = await PosService.recordSale(retailerId, validation.data);
      res.status(201).json({
        success: true,
        data: receipt,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        data: null,
        error: error.message || 'Failed to record counter sale',
      });
    }
  }
}
