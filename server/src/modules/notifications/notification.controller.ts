import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types';
import { NotificationService } from './notification.service';

export class NotificationController {
  /** Returns the tenant's real recent activities plus badge counters (no mocks, no seeded data). */
  static async getActivity(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.tenantId) {
        res.status(401).json({ success: false, data: null, error: 'Unauthorized' });
        return;
      }
      const result = await NotificationService.getTenantActivity(req.user);
      res.status(200).json({ success: true, data: result, error: null });
    } catch (error) {
      next(error);
    }
  }
}
