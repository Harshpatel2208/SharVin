import { Response, NextFunction } from 'express';
import { AppError } from '../../utils/app-error';
import { AuthenticatedRequest } from '../../types/auth.types';
import { ChatService } from './chat.service';
import { 
  sendMessageSchema, 
  getMessagesQuerySchema, 
  proposeRateSchema,
  confirmRateSchema
} from './chat.validation';
import { SenderUserType } from '@prisma/client';

export class ChatController {
  /**
   * GET /api/v1/orders/:orderId/messages
   * Fetch chat history for an order.
   */
  static async getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const userId = req.user!.userId;

      // 1. Verify user is authorized participant
      const verification = await ChatService.verifyOrderParticipant(orderId, userId);
      if (!verification.isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not a participant in this order negotiation',
        });
        return;
      }

      // 2. Parse query parameters
      const parsedQuery = getMessagesQuerySchema.parse(req.query);

      // 3. Fetch messages
      const messages = await ChatService.getOrderMessages(orderId, parsedQuery.limit, parsedQuery.before);

      res.json({
        success: true,
        data: {
          orderId: verification.orderId,
          orderNumber: verification.orderNumber,
          orderStatus: verification.orderStatus,
          role: verification.role,
          wholesalerName: verification.wholesalerName,
          retailerName: verification.retailerName,
          messages,
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
          error: 'Invalid query parameters',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch messages',
      });
    }
  }

  /**
   * POST /api/v1/orders/:orderId/messages
   * Send a chat message via HTTP REST and broadcast to live Socket.io room.
   */
  static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      // 1. Verify user is authorized participant
      const verification = await ChatService.verifyOrderParticipant(orderId, user.userId);
      if (!verification.isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not a participant in this order negotiation',
        });
        return;
      }

      // 2. Validate input
      const validatedInput = sendMessageSchema.parse({
        ...req.body,
        orderId,
      });

      // 3. Persist message
      const savedMessage = await ChatService.saveMessage({
        orderId: verification.orderId,
        senderUserId: user.userId,
        senderUserType: user.userType as SenderUserType,
        senderName: user.businessName || (user.userType === 'retailer' ? 'Retailer' : 'Wholesaler'),
        messageText: validatedInput.messageText,
        messageType: validatedInput.messageType,
        fileAttachments: validatedInput.fileAttachments,
      });

      // 4. Broadcast to Socket.io room if IO server is attached to app
      const io = req.app.get('io');
      if (io) {
        const roomName = ChatService.getOrderRoomName(verification.orderId);
        io.to(roomName).emit('new_message', savedMessage);
      }

      res.status(201).json({
        success: true,
        message: 'Message sent',
        data: savedMessage,
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

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send message',
      });
    }
  }

  /**
   * POST /api/v1/orders/:orderId/propose-rate
   * Submit a formal bilateral price counter-offer proposal with minimum margin checks.
   */
  static async proposeRate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      // 1. Verify participant
      const verification = await ChatService.verifyOrderParticipant(orderId, user.userId);
      if (!verification.isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not a participant in this order negotiation',
        });
        return;
      }

      // 2. Validate input
      const validatedInput = proposeRateSchema.parse({
        ...req.body,
        orderId,
      });

      // 3. Process rate proposal
      const result = await ChatService.proposeRate({
        orderId: verification.orderId,
        userId: user.userId,
        userType: user.userType as SenderUserType,
        userName: user.businessName || undefined,
        items: validatedInput.items,
        proposedDiscountPercent: validatedInput.proposedDiscountPercent,
        clientVersion: validatedInput.clientVersion,
        isFinalOffer: validatedInput.isFinalOffer,
        notes: validatedInput.notes,
      });

      // 4. Broadcast to Socket.io room
      const io = req.app.get('io');
      if (io) {
        const roomName = ChatService.getOrderRoomName(verification.orderId);
        io.to(roomName).emit('rate_proposed', result);
        io.to(roomName).emit('new_message', result.systemMessage);
      }

      res.status(201).json({
        success: true,
        message: 'Rate proposal submitted successfully',
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

      // Check for margin guardrail or domain business rule rejections
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to submit rate proposal',
      });
    }
  }

  /**
   * GET /api/v1/orders/:orderId/rate-history
   * Retrieve price negotiation history and proposal audit trail.
   */
  static async getPriceHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const userId = req.user!.userId;

      const verification = await ChatService.verifyOrderParticipant(orderId, userId);
      if (!verification.isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not a participant in this order negotiation',
        });
        return;
      }

      const history = await ChatService.getOrderPriceHistory(verification.orderId);

      res.json({
        success: true,
        data: {
          orderId: verification.orderId,
          orderNumber: verification.orderNumber,
          history,
        },
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve price history',
      });
    }
  }

  /**
   * POST /api/v1/orders/:orderId/confirm-rate
   * Mutual bilateral rate confirmation and atomic deal locking.
   */
  static async confirmRate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;

      // 1. Verify participant
      const verification = await ChatService.verifyOrderParticipant(orderId, user.userId);
      if (!verification.isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not a participant in this order negotiation',
        });
        return;
      }

      // 2. Validate input
      const validatedInput = confirmRateSchema.parse({
        ...req.body,
        orderId,
      });

      // 3. Process rate confirmation
      const result = await ChatService.confirmRate({
        orderId: verification.orderId,
        userId: user.userId,
        userType: user.userType as SenderUserType,
        userName: user.businessName || undefined,
        clientVersion: validatedInput.clientVersion,
        notes: validatedInput.notes,
      });

      // 4. Broadcast via Socket.io
      const io = req.app.get('io');
      if (io) {
        const roomName = ChatService.getOrderRoomName(verification.orderId);
        if (result.isDealLocked) {
          io.to(roomName).emit('rate_locked', result);
        } else {
          io.to(roomName).emit('rate_confirmation_pending', result);
        }
        io.to(roomName).emit('new_message', result.systemMessage);
      }

      res.status(200).json({
        success: true,
        message: result.isDealLocked ? 'Deal locked successfully! Immutable snapshot generated.' : 'Rate confirmation recorded. Awaiting counterparty confirmation.',
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
        error: error.message || 'Failed to confirm rate',
      });
    }
  }

  /**
   * GET /api/v1/orders/:orderId/negotiation-status
   * Retrieve current live pricing state, confirmation status, and item quotes.
   */
  static async getNegotiationStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const userId = req.user!.userId;

      const verification = await ChatService.verifyOrderParticipant(orderId, userId);
      if (!verification.isAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not a participant in this order negotiation',
        });
        return;
      }

      const status = await ChatService.getNegotiationStatus(verification.orderId, userId);

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
        error: error.message || 'Failed to retrieve negotiation status',
      });
    }
  }
}
