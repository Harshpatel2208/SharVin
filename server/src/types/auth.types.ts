import { Request } from 'express';
import { UserType } from '@prisma/client';

export interface JwtAuthPayload {
  /** Tenant owner ID retained for compatibility with existing business-scoped services. */
  userId: string;
  /** Canonical business boundary. This currently aliases the tenant owner User ID. */
  tenantId: string;
  userType: UserType;
  principalId?: string;
  principalKind?: 'owner' | 'retailer_staff' | 'wholesaler_staff';
  roleName?: string;
  permissions?: string[];
  phoneNumber?: string | null;
  email?: string | null;
  businessName?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtAuthPayload;
}
