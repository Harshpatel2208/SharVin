import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../db';
import { AuthenticatedRequest, JwtAuthPayload } from '../types/auth.types';
import { getJwtSecret } from '../config/security';
import { resolvePermissions } from '../modules/auth/permissions';

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      data: null,
      error: 'Authorization token missing or malformed',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: 'sharvin-api',
      audience: 'sharvin-clients',
      algorithms: ['HS256'],
    }) as JwtAuthPayload;
    const principalId = decoded.principalId || decoded.userId;
    const principalKind = decoded.principalKind || 'owner';

    if (principalKind === 'owner') {
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, userType: true, isActive: true, isEmailVerified: true, phoneNumber: true, email: true, businessName: true } });
      if (!user || !user.isActive || !user.isEmailVerified || user.userType !== decoded.userType) {
        res.status(401).json({ success: false, data: null, error: 'Session is no longer active', code: 'SESSION_REVOKED' });
        return;
      }
      req.user = { ...decoded, userId: user.id, tenantId: user.id, principalId, principalKind, roleName: user.userType === 'driver' ? 'driver' : 'owner', permissions: user.userType === 'driver' ? [] : ['*'], userType: user.userType, phoneNumber: user.phoneNumber, email: user.email, businessName: user.businessName };
    } else if (principalKind === 'retailer_staff' || principalKind === 'wholesaler_staff') {
      const retailer = principalKind === 'retailer_staff';
      const tenant = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, userType: true, isActive: true, isEmailVerified: true } });
      const staff = retailer
        ? await prisma.retailerSubUser.findFirst({ where: { id: principalId, retailerId: decoded.userId, isActive: true }, include: { permissions: true } })
        : await prisma.wholesalerSubUser.findFirst({ where: { id: principalId, wholesalerId: decoded.userId, isActive: true }, include: { permissions: true } });
      const expectedType = retailer ? 'retailer' : 'wholesaler';
      if (!tenant?.isActive || !tenant.isEmailVerified || tenant.userType !== expectedType || !staff) {
        res.status(401).json({ success: false, data: null, error: 'Session is no longer active', code: 'SESSION_REVOKED' });
        return;
      }
      req.user = {
        ...decoded,
        userId: tenant.id,
        tenantId: tenant.id,
        principalId,
        principalKind,
        userType: tenant.userType,
        roleName: staff.roleName,
        permissions: resolvePermissions(staff.roleName, staff.permissions),
        phoneNumber: staff.phoneNumber,
        email: staff.email,
        businessName: undefined,
      };
    } else {
      res.status(401).json({ success: false, data: null, error: 'Invalid session', code: 'INVALID_TOKEN' });
      return;
    }
    next();
  } catch (error: any) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Authorization token has expired. Please refresh your session.',
        code: 'TOKEN_EXPIRED',
        expiredAt: error.expiredAt,
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Invalid or tampered authorization token',
        code: 'INVALID_TOKEN',
      });
      return;
    }
    res.status(401).json({
      success: false,
      data: null,
      error: 'Invalid or expired authorization token',
      code: 'AUTH_FAILED',
    });
  }
}

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.userType)) {
      res.status(403).json({
        success: false,
        data: null,
        error: `Access forbidden: requires one of the roles [${allowedRoles.join(', ')}]`,
        code: 'FORBIDDEN_ROLE',
      });
      return;
    }
    next();
  };
}

/** Role checks describe tenant type; sensitive capabilities also require this DB-resolved permission. */
export function authorizePermissions(...required: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, data: null, error: 'Authentication required', code: 'UNAUTHORIZED' });
      return;
    }
    const granted = req.user.permissions || [];
    if (!granted.includes('*') && !required.every((permission) => granted.includes(permission))) {
      res.status(403).json({ success: false, data: null, error: 'Insufficient permission', code: 'FORBIDDEN_PERMISSION' });
      return;
    }
    next();
  };
}

export function authorizeOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user?.principalKind !== 'owner') {
    res.status(403).json({ success: false, data: null, error: 'Business owner access required', code: 'OWNER_REQUIRED' });
    return;
  }
  next();
}

export function authorizeOrderTransition(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const status = req.body?.toStatus;
  const permission = status === 'accepted'
    ? 'orders.accept'
    : status === 'picking' || status === 'dispatched'
      ? 'orders.fulfill'
      : status === 'delivered' || status === 'partially_fulfilled'
        ? 'delivery.manage'
        : status === 'submitted' || status === 'cancelled' || status === 'rejected'
          ? 'orders.manage'
          : null;
  if (!permission) {
    res.status(400).json({ success: false, data: null, error: 'Unsupported order transition', code: 'INVALID_TRANSITION' });
    return;
  }
  authorizePermissions(permission)(req, res, next);
}

/**
 * Middleware to enforce tenant boundary isolation.
 * Prevents retailers or wholesalers from accessing resources belonging to other tenants.
 */
export function enforceTenantScoping(paramName: string = 'userId') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Unauthorized: User authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const requestedTenantId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (!requestedTenantId || requestedTenantId === req.user.tenantId) {
      next();
      return;
    }
    try {
      const target = String(requestedTenantId);
      const connection = req.user.userType === 'retailer'
        ? await prisma.retailerWholesalerConnection.findFirst({ where: { retailerId: req.user.tenantId, OR: [{ wholesalerId: target }, { id: target }] }, select: { id: true } })
        : req.user.userType === 'wholesaler'
          ? await prisma.retailerWholesalerConnection.findFirst({ where: { wholesalerId: req.user.tenantId, OR: [{ retailerId: target }, { id: target }] }, select: { id: true } })
          : null;
      if (!connection) {
        res.status(403).json({ success: false, data: null, error: 'Forbidden: The requested business is outside your tenant relationships', code: 'CROSS_TENANT_VIOLATION' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, data: null, error: 'Unable to verify tenant relationship', code: 'TENANT_CHECK_FAILED' });
    }
  };
}

/**
 * Middleware to enforce Order-level boundary isolation.
 * Verifies that the authenticated user is either the retailer or wholesaler of the order.
 */
export function enforceOrderScoping(paramName: string = 'orderId') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Unauthorized: User authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const orderId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (!orderId) {
      next();
      return;
    }

    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { id: orderId },
            { orderNumber: orderId },
          ],
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          data: null,
          error: 'Order not found',
          code: 'NOT_FOUND',
        });
        return;
      }

      if (order.retailerId !== req.user.tenantId && order.wholesalerId !== req.user.tenantId) {
        res.status(403).json({
          success: false,
          data: null,
          error: 'Forbidden: You are not a participant in this order',
          code: 'CROSS_TENANT_VIOLATION',
        });
        return;
      }

      next();
    } catch (error: any) {
      res.status(500).json({
        success: false,
        data: null,
        error: 'Internal server error during order scoping',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}

/**
 * Middleware to enforce Invoice-level boundary isolation.
 * Verifies that the authenticated user is either the retailer or wholesaler of the order linked to the invoice.
 */
export function enforceInvoiceScoping(paramName: string = 'id') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Unauthorized: User authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const invoiceId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (!invoiceId) {
      next();
      return;
    }

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { order: true },
      });

      if (!invoice) {
        res.status(404).json({
          success: false,
          data: null,
          error: 'Invoice not found',
          code: 'NOT_FOUND',
        });
        return;
      }

      const order = invoice.order;
      if (!order || (order.retailerId !== req.user.tenantId && order.wholesalerId !== req.user.tenantId)) {
        res.status(403).json({
          success: false,
          data: null,
          error: 'Forbidden: You are not authorized to access this invoice',
          code: 'CROSS_TENANT_VIOLATION',
        });
        return;
      }

      next();
    } catch (error: any) {
      res.status(500).json({
        success: false,
        data: null,
        error: 'Internal server error during invoice scoping',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}

/**
 * Middleware to enforce Master Owner PIN authorization for sensitive B2B trade actions
 * when operating in cashier / counter-staff sub-role.
 */
export async function requireOwnerPin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const subRole = req.user?.roleName;
  const pinHeader = req.headers['x-owner-pin'] as string;

  if (subRole === 'cashier') {
    if (!pinHeader) {
      res.status(403).json({
        success: false,
        data: null,
        error: 'Master Owner PIN authorization required to access confidential trade data',
        code: 'PIN_REQUIRED',
      });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user?.userId },
        include: {
          retailerProfile: true,
          wholesalerProfile: true,
        },
      });

      const pinHash = user?.retailerProfile?.ownerPinHash || user?.wholesalerProfile?.ownerPinHash;

      if (!pinHash || !(await bcrypt.compare(pinHeader, pinHash))) {
        res.status(403).json({
          success: false,
          data: null,
          error: 'Invalid Owner PIN. Access denied.',
          code: 'INVALID_PIN',
        });
        return;
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        error: 'Internal server error during PIN verification',
        code: 'INTERNAL_ERROR',
      });
      return;
    }
  }

  next();
}
