import { Response, NextFunction } from 'express';
import { AppError } from '../../utils/app-error';
import { AuthenticatedRequest } from '../../types/auth.types';
import { CartService } from './cart.service';
import { 
  addToCartSchema, 
  updateCartItemSchema, 
  submitCartSchema 
} from './cart.validation';

export class CartController {
  /**
   * GET /api/v1/cart
   */
  static async getCarts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const data = await CartService.getRetailerCarts(retailerId);
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
        error: error.message || 'Failed to retrieve wholesale carts',
      });
    }
  }

  /**
   * POST /api/v1/cart/items
   */
  static async addItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const validatedInput = addToCartSchema.parse(req.body);
      const data = await CartService.addItemToCart(retailerId, validatedInput);
      res.status(201).json({
        success: true,
        message: 'Item added to wholesaler cart',
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
        error: error.message || 'Failed to add item to cart',
      });
    }
  }

  /**
   * PATCH /api/v1/cart/items/:orderItemId
   */
  static async updateItemQuantity(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const orderItemId = req.params.orderItemId as string;
      const validatedInput = updateCartItemSchema.parse(req.body);
      const data = await CartService.updateItemQuantity(
        retailerId,
        orderItemId,
        validatedInput.quantity
      );
      res.json({
        success: true,
        message: 'Cart item updated',
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
        error: error.message || 'Failed to update cart item',
      });
    }
  }

  /**
   * DELETE /api/v1/cart/items/:orderItemId
   */
  static async removeItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const orderItemId = req.params.orderItemId as string;
      const data = await CartService.removeItem(retailerId, orderItemId);
      res.json({
        success: true,
        message: 'Cart item removed',
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to remove cart item',
      });
    }
  }

  /**
   * DELETE /api/v1/cart/wholesaler/:wholesalerId
   */
  static async clearCart(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const wholesalerId = req.params.wholesalerId as string;
      const data = await CartService.clearCart(retailerId, wholesalerId);
      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to clear cart',
      });
    }
  }

  /**
   * POST /api/v1/cart/wholesaler/:wholesalerId/submit
   */
  static async submitCart(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const retailerId = req.user!.tenantId;
      const wholesalerId = req.params.wholesalerId as string;
      const validatedInput = submitCartSchema.parse(req.body || {});
      const data = await CartService.submitCart(retailerId, wholesalerId, validatedInput);
      res.json({
        success: true,
        message: 'Wholesale cart submitted for price negotiation',
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
        error: error.message || 'Failed to submit cart',
      });
    }
  }
}
