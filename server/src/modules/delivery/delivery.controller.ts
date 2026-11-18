import { Request, Response, NextFunction } from 'express';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { AuthenticatedRequest } from '../../types/auth.types';
import { DeliveryService } from './delivery.service';
import { 
  dispatchOrderSchema, 
  verifyHandoverSchema,
  resolveDisputeSchema,
  updateDriverLocationSchema,
  updateDriverMilestoneSchema,
  driverVerifyOtpSchema
} from './delivery.validation';

export class DeliveryController {
  static async listActiveOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication is required', 401);
      const orders = await DeliveryService.listActiveOrders(tenantId, req.user!.userType);
      res.status(200).json({ success: true, data: orders, total: orders.length, error: null });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/orders/:orderId/dispatch
   * Wholesaler initiates delivery dispatch and generates secure two-way OTP.
   */
  static async dispatchOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const validatedInput = dispatchOrderSchema.parse({
        ...req.body,
        orderId,
      });

      const deliveryRecord = await DeliveryService.dispatchOrder(
        validatedInput,
        user.userId,
        user.userType
      );

      // Broadcast realtime event if Socket.io is attached
      const io = req.app.get('io');
      if (io) {
        const roomName = `order:${deliveryRecord.orderId}`;
        io.to(roomName).emit('delivery_status_changed', {
          orderId: deliveryRecord.orderId,
          orderNumber: deliveryRecord.orderNumber,
          deliveryStatus: deliveryRecord.deliveryStatus,
          driverName: deliveryRecord.driverName,
          trackingMode: deliveryRecord.trackingMode,
          distanceKm: deliveryRecord.distanceKm,
          timestamp: new Date().toISOString(),
        });
        io.to(roomName).emit('new_message', {
          id: `sys-msg-${Date.now()}`,
          orderId: deliveryRecord.orderId,
          connectionId: 'conn-system',
          senderUserId: user.userId,
          senderUserType: user.userType,
          senderName: user.businessName || 'System',
          messageType: 'system',
          messageText: `🚚 Order ${deliveryRecord.orderNumber} dispatched with driver ${deliveryRecord.driverName} (${deliveryRecord.driverPhone}). Two-way Handover OTP generated for retailer.`,
          fileAttachments: {
            type: 'order_dispatched',
            driverName: deliveryRecord.driverName,
            driverPhone: deliveryRecord.driverPhone,
            trackingUrl: deliveryRecord.trackingUrl,
            trackingMode: deliveryRecord.trackingMode,
            distanceKm: deliveryRecord.distanceKm,
            timestamp: new Date().toISOString(),
          },
          isDelivered: true,
          createdAt: new Date().toISOString(),
        });
      }

      res.status(201).json({
        success: true,
        message: 'Order dispatched successfully. Two-way Handover OTP generated.',
        data: {
          deliveryId: deliveryRecord.deliveryId,
          orderId: deliveryRecord.orderId,
          orderNumber: deliveryRecord.orderNumber,
          deliveryStatus: deliveryRecord.deliveryStatus,
          driverName: deliveryRecord.driverName,
          driverPhone: deliveryRecord.driverPhone,
          driverAccessToken: deliveryRecord.driverAccessToken,
          trackingUrl: deliveryRecord.trackingUrl,
          distanceKm: deliveryRecord.distanceKm,
          trackingMode: deliveryRecord.trackingMode,
          destinationAddress: deliveryRecord.destinationAddress,
          assignedAt: deliveryRecord.assignedAt,
        },
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
        error: error.message || 'Failed to dispatch order',
      });
    }
  }

  /**
   * GET /api/v1/orders/:orderId/handover-code
   * Retailer retrieves their confidential 6-digit delivery handover OTP.
   */
  static async getHandoverCode(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const result = await DeliveryService.getRetailerHandoverCode(
        orderId,
        user.userId,
        user.userType
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(403).json({
        success: false,
        error: error.message || 'Failed to retrieve handover OTP code',
      });
    }
  }

  static async getDriverAccessLink(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;
      const result = await DeliveryService.getDriverAccessLink(orderId, user.tenantId, user.userType);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/orders/:orderId/verify-handover
   * Delivery Agent / Wholesaler inputs Retailer OTP on-site to verify physical handover.
   */
  static async verifyHandover(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const validatedInput = verifyHandoverSchema.parse({
        ...req.body,
        orderId,
      });

      const verificationResult = await DeliveryService.verifyHandover(
        validatedInput,
        user.userId,
        user.userType
      );

      // Broadcast realtime event if Socket.io is attached
      const io = req.app.get('io');
      if (io) {
        const roomName = `order:${verificationResult.orderId}`;
        io.to(roomName).emit('delivery_status_changed', {
          orderId: verificationResult.orderId,
          orderNumber: verificationResult.orderNumber,
          deliveryStatus: 'delivered',
          isVerified: true,
          timestamp: verificationResult.verifiedAt,
        });
        io.to(roomName).emit('new_message', {
          id: `sys-msg-${Date.now()}`,
          orderId: verificationResult.orderId,
          connectionId: 'conn-system',
          senderUserId: user.userId,
          senderUserType: user.userType,
          senderName: user.businessName || 'System',
          messageType: 'system',
          messageText: `🤝 HANDOVER CONFIRMED! Two-way delivery OTP verified on-site. Order total ₹${verificationResult.finalAmount.toLocaleString('en-IN')} marked as delivered.`,
          fileAttachments: {
            type: 'delivery_verified',
            certificate: verificationResult.certificate,
          },
          isDelivered: true,
          createdAt: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        message: verificationResult.message,
        data: verificationResult,
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
        error: error.message || 'Failed to verify handover OTP',
      });
    }
  }

  /**
   * GET /api/v1/orders/:orderId/delivery-status
   * Retrieve live delivery handover and tracking status.
   */
  static async getDeliveryStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const status = await DeliveryService.getDeliveryStatus(
        orderId,
        user.userId,
        user.userType
      );

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve delivery status',
      });
    }
  }

  /**
   * GET /api/v1/orders/:orderId/rebalance-summary
   * Retrieve real-time inventory rebalancing report upon delivery handover.
   */
  static async getRebalanceSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const summary = await DeliveryService.getRebalanceSummary(
        orderId,
        user.userId,
        user.userType
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve rebalance summary',
      });
    }
  }

  /**
   * GET /api/v1/orders/:orderId/dispute
   * Retrieve active dispute and credit note for an order.
   */
  static async getDispute(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const dispute = await DeliveryService.getDispute(
        orderId,
        user.userId,
        user.userType
      );

      if (!dispute) {
        res.status(404).json({
          success: false,
          error: `No dispute found for order ${orderId}`,
        });
        return;
      }

      res.json({
        success: true,
        data: dispute,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve dispute',
      });
    }
  }

  /**
   * POST /api/v1/orders/:orderId/dispute/resolve
   * Wholesaler approves credit note, rejects claim, or negotiates allowance.
   */
  static async resolveDispute(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      const validatedInput = resolveDisputeSchema.parse(req.body);

      const resolved = await DeliveryService.resolveDispute(
        orderId,
        validatedInput,
        user.userId,
        user.userType
      );

      // Broadcast realtime event if Socket.io is attached
      const io = req.app.get('io');
      if (io) {
        const roomName = `order:${resolved.orderId}`;
        io.to(roomName).emit('dispute_resolved', {
          orderId: resolved.orderId,
          disputeNumber: resolved.disputeNumber,
          disputeStatus: resolved.disputeStatus,
          resolutionNotes: resolved.resolutionNotes,
          resolvedAt: resolved.resolvedAt,
        });
        io.to(roomName).emit('new_message', {
          id: `sys-msg-${Date.now()}`,
          orderId: resolved.orderId,
          connectionId: 'conn-system',
          senderUserId: user.userId,
          senderUserType: user.userType,
          senderName: user.businessName || 'Wholesaler Settlement Desk',
          messageType: 'system',
          messageText: `🛡️ DISPUTE RESOLVED: Wholesaler has resolved dispute ${resolved.disputeNumber}. Escrow dispute hold released.`,
          fileAttachments: {
            type: 'dispute_resolved',
            creditNote: resolved.creditNote,
          },
          isDelivered: true,
          createdAt: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: 'Dispute resolved successfully. Escrow hold updated.',
        data: resolved,
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
        error: error.message || 'Failed to resolve dispute',
      });
    }
  }

  /**
   * GET /api/v1/delivery/credit-notes/:id
   * Retrieve B2B Credit Note details.
   */
  static async getCreditNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const user = req.user!;

      const creditNote = await DeliveryService.getCreditNote(id, user.userId);
      if (!creditNote) {
        res.status(404).json({
          success: false,
          error: `Credit note '${id}' not found.`,
        });
        return;
      }

      res.json({
        success: true,
        data: creditNote,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve credit note',
      });
    }
  }

  /**
   * GET /api/v1/delivery/credit-notes/:id/csv
   * Export RFC-4180 CSV for CA audit of the statutory Credit Note.
   */
  static async exportCreditNoteCsv(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const user = req.user!;

      const csvContent = await DeliveryService.exportCreditNoteCsv(id, user.userId);
      const creditNote = await DeliveryService.getCreditNote(id, user.userId);
      const filename = creditNote ? `credit-note-${creditNote.creditNoteNumber}.csv` : `credit-note-${id}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvContent);
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(404).json({
        success: false,
        error: error.message || 'Failed to export credit note CSV',
      });
    }
  }

  /**
   * GET /api/v1/deliveries/driver-portal/:token
   * Public tokenized driver web access - NO login or app download required.
   */
  static async getDriverPortalDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : String(req.params.token);
      const details = await DeliveryService.getDriverPortalDetails(token);

      res.status(200).json({
        success: true,
        data: details,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(404).json({
        success: false,
        error: error.message || 'Driver access link is invalid or expired',
      });
    }
  }

  /**
   * POST /api/v1/deliveries/driver-portal/:token/location
   * Driver updates live GPS coordinates (for Local distance mode <100km).
   */
  static async updateDriverLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : String(req.params.token);
      const validatedInput = updateDriverLocationSchema.parse(req.body);

      const result = await DeliveryService.updateDriverLocation(
        token,
        validatedInput.latitude,
        validatedInput.longitude,
        validatedInput.speed,
        validatedInput.accuracy
      );

      // Broadcast real-time location to retailer & wholesaler
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${result.orderId}`).emit('driver_location_updated', {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          latitude: result.latitude,
          longitude: result.longitude,
          speed: result.speed,
          timestamp: result.lastLocationUpdatedAt,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Live GPS location updated successfully',
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
        error: error.message || 'Failed to update driver location',
      });
    }
  }

  /**
   * POST /api/v1/deliveries/driver-portal/:token/milestone
   * Driver updates checkpoint milestone (for Regional freight >100km).
   */
  static async updateDriverMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : String(req.params.token);
      const validatedInput = updateDriverMilestoneSchema.parse(req.body);

      const result = await DeliveryService.updateDriverMilestone(
        token,
        validatedInput.milestone,
        validatedInput.hubName,
        validatedInput.notes
      );

      // Broadcast milestone update to retailer & wholesaler
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${result.orderId}`).emit('delivery_milestone_updated', {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          milestone: result.milestone,
          hubName: result.hubName,
          timestamp: result.updatedAt,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Delivery checkpoint milestone updated successfully',
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
        error: error.message || 'Failed to update delivery milestone',
      });
    }
  }

  /**
   * POST /api/v1/deliveries/driver-portal/:token/verify-otp
   * Driver submits retailer's 6-digit OTP on doorstep to finalize handover.
   */
  static async verifyDriverOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : String(req.params.token);
      const validatedInput = driverVerifyOtpSchema.parse(req.body);

      const result = await DeliveryService.verifyDriverOtp(token, validatedInput);

      // Broadcast completion event
      const io = req.app.get('io');
      if (io) {
        const roomName = `order:${result.orderId}`;
        io.to(roomName).emit('delivery_status_changed', {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          deliveryStatus: 'delivered',
          isVerified: true,
          verifiedAt: result.verifiedAt,
          acceptedUnits: result.acceptedUnits,
          damagedUnits: result.damagedUnits,
          finalAmount: result.finalAmount,
        });
        io.to(roomName).emit('new_message', {
          id: `sys-msg-${Date.now()}`,
          orderId: result.orderId,
          connectionId: 'conn-system',
          senderUserId: 'driver',
          senderUserType: 'driver',
          senderName: 'Delivery Driver',
          messageType: 'system',
          messageText: `✅ Delivery Verified & Completed via Driver Portal. ${result.isPartialDelivery ? `Partial delivery: ${result.acceptedUnits} units accepted, ${result.damagedUnits} returned.` : 'All units accepted intact.'}`,
          isDelivered: true,
          createdAt: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        message: result.message,
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
        error: error.message || 'Driver OTP verification failed',
      });
    }
  }
}
