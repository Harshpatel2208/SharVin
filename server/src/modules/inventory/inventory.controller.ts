import { Response, NextFunction } from 'express';
import { AppError } from '../../utils/app-error';
import { AuthenticatedRequest } from '../../types/auth.types';
import { InventoryService } from './inventory.service';
import { 
  updateThresholdSchema, 
  quickRestockSchema, 
  batchRestockSchema,
  simulateVelocitySchema 
} from './inventory.validation';

export class InventoryController {
  /**
   * GET /api/v1/inventory/low-stock
   */
  static async getLowStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const data = await InventoryService.getLowStockItems(retailerId);
      res.json({
        success: true,
        data,
        total: data.count,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch low-stock inventory',
      });
    }
  }

  /**
   * GET /api/v1/inventory/alerts
   */
  static async getAlerts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const alerts = await InventoryService.getStockAlerts(retailerId);
      res.json({
        success: true,
        data: alerts,
        total: alerts.length,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch stock alerts',
      });
    }
  }

  /**
   * PATCH /api/v1/inventory/threshold
   */
  static async updateThreshold(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const validatedInput = updateThresholdSchema.parse(req.body);
      const result = await InventoryService.updateThreshold(retailerId, validatedInput);
      res.json({
        success: true,
        message: 'Inventory threshold updated successfully',
        data: result,
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
        error: error.message || 'Failed to update threshold',
      });
    }
  }

  /**
   * POST /api/v1/inventory/restock/quick-add
   */
  static async quickRestock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const validatedInput = quickRestockSchema.parse(req.body);
      const result = await InventoryService.quickRestock(retailerId, validatedInput);
      res.status(201).json({
        success: true,
        message: '1-Click Restock: Item drafted into wholesaler cart',
        data: result,
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
        error: error.message || 'Failed to trigger 1-click restock',
      });
    }
  }

  /**
   * POST /api/v1/inventory/restock/batch
   */
  static async batchRestock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const validatedInput = batchRestockSchema.parse(req.body);
      const result = await InventoryService.batchRestock(retailerId, validatedInput);
      res.status(201).json({
        success: true,
        message: 'Batch 1-Click Restock completed',
        data: result,
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
        error: error.message || 'Failed to execute batch restock',
      });
    }
  }

  /**
   * POST /api/v1/inventory/alerts/:alertId/dismiss
   */
  static async dismissAlert(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const alertId = req.params.alertId as string;
      const result = await InventoryService.dismissAlert(retailerId, alertId);
      res.json({
        success: true,
        message: 'Stock alert dismissed',
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to dismiss stock alert',
      });
    }
  }

  /**
   * GET /api/v1/inventory/reorder-predictions
   * Phase 3 Task 7: 7-Day Velocity AI Reorder Predictor
   */
  static async getReorderPredictions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const data = await InventoryService.getReorderPredictions(retailerId);
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
        error: error.message || 'Failed to compute 7-day velocity reorder predictions',
      });
    }
  }

  /**
   * POST /api/v1/inventory/simulate-velocity
   * Phase 3 Task 7: Simulation helper for testing & browser demo
   */
  static async simulateVelocity(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const retailerId = req.user!.tenantId;
      const validatedInput = simulateVelocitySchema.parse(req.body);
      const result = InventoryService.simulateVelocity(retailerId, validatedInput);
      res.json({
        ...result,
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
        error: error.message || 'Failed to configure velocity simulation',
      });
    }
  }
}
