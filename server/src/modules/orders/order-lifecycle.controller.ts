import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OrderLifecycleStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../types/auth.types';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { OrderLifecycleService } from './order-lifecycle.service';
import { transitionOrderLifecycleSchema } from './order-lifecycle.validation';
import { prisma } from '../../db';

const zOrderId = z.string().uuid();

export class OrderLifecycleController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user?.tenantId) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication is required', 401);
      const [total, orders] = await Promise.all([
        prisma.order.count({ where: { OR: [{ retailerId: authReq.user.tenantId }, { wholesalerId: authReq.user.tenantId }] } }),
        prisma.order.findMany({
          where: { OR: [{ retailerId: authReq.user.tenantId }, { wholesalerId: authReq.user.tenantId }] },
          include: {
            retailer: { select: { id: true, businessName: true, fullName: true, phoneNumber: true, addresses: true } },
            wholesaler: { select: { id: true, businessName: true, fullName: true } },
            orderItems: { include: { product: true, wholesalerProduct: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        }),
      ]);
      res.status(200).json({ success: true, data: orders, total, error: null });
    } catch (error) { next(error); }
  }

  static async transition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication is required', 401);
      }

      const orderId = Array.isArray(req.params.orderId)
        ? req.params.orderId[0]
        : String(req.params.orderId);
      const parsedOrderId = zOrderId.safeParse(orderId);
      if (!parsedOrderId.success) {
        throw new AppError(AppErrorCode.BAD_REQUEST, 'A valid order ID is required', 400);
      }

      const input = transitionOrderLifecycleSchema.parse(req.body);
      const result = await OrderLifecycleService.transition({
        orderId: parsedOrderId.data,
        toStatus: input.toStatus as OrderLifecycleStatus,
        ...(input.expectedFromStatus ? { expectedFromStatus: input.expectedFromStatus as OrderLifecycleStatus } : {}),
        actorUserId: authReq.user.tenantId,
        actorRole: authReq.user.userType,
        actorReference: authReq.user.principalKind === 'owner' ? undefined : authReq.user.principalId,
        reason: input.reason,
      });

      res.status(200).json({ success: true, data: result, error: null });
    } catch (error) {
      next(error);
    }
  }
}
