import { Server as SocketIOServer, Socket } from 'socket.io';
import { Logger } from '../../utils/logger';
import jwt from 'jsonwebtoken';
import { SenderUserType } from '@prisma/client';
import { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  SocketData, 
  ChatUserContext 
} from './chat.types';
import { 
  joinOrderSchema, 
  leaveOrderSchema, 
  sendMessageSchema, 
  typingSchema,
  proposeRateSchema,
  confirmRateSchema
} from './chat.validation';
import { ChatService } from './chat.service';
import { InvoiceService } from '../invoice/invoice.service';
import { JwtAuthPayload } from '../../types/auth.types';
import { getJwtSecret } from '../../config/security';
import { prisma } from '../../db';
import { resolvePermissions } from '../auth/permissions';


export type TypedSocketServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Round a currency amount to 2 decimals. */
function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * P1.2: Derive per-line GST/landed-cost using the single-source invoice HSN/GST
 * convention so the client never re-implements tax logic.
 */
function deriveLineTax(productName: string, unitPrice: number, quantity: number) {
  const gstRate = InvoiceService.getHsnAndGstRate(productName).gstRate;
  const lineExGstTotal = round2(unitPrice * quantity);
  const lineGstAmount = round2((lineExGstTotal * gstRate) / 100);
  const lineLandedCost = round2(lineExGstTotal + lineGstAmount);
  return { gstRate, lineExGstTotal, lineGstAmount, lineLandedCost };
}

/**
 * Register the authenticated Socket.io order negotiation gateway.
 */
export function registerChatGateway(io: any): void {
  // 1. Connection Authentication Middleware
  io.use(async (socket: any, next: (err?: any) => void) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      
      let token: string | undefined;
      if (typeof authHeader === 'string') {
        token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
      }

      if (!token || token === 'demo-token' || token.startsWith('demo-')) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT
      const decoded = jwt.verify(token, getJwtSecret(), {
        algorithms: ['HS256'], issuer: 'sharvin-api', audience: 'sharvin-clients',
      }) as JwtAuthPayload;
      const activeTenant = await prisma.user.findFirst({
        where: { id: decoded.userId, isActive: true, isEmailVerified: true, userType: decoded.userType },
        select: { id: true },
      });
      if (!activeTenant) return next(new Error('Account is inactive or email is unverified'));
      let roleName = 'owner';
      let permissions: string[] = decoded.userType === 'driver' ? [] : ['*'];
      if (decoded.principalKind === 'retailer_staff') {
        const staff = await prisma.retailerSubUser.findFirst({ where: { id: decoded.principalId || decoded.userId, retailerId: decoded.userId, isActive: true }, include: { permissions: true } });
        if (!staff) return next(new Error('Account is inactive or unavailable'));
        roleName = staff.roleName;
        permissions = resolvePermissions(roleName, staff.permissions);
      } else if (decoded.principalKind === 'wholesaler_staff') {
        const staff = await prisma.wholesalerSubUser.findFirst({ where: { id: decoded.principalId || decoded.userId, wholesalerId: decoded.userId, isActive: true }, include: { permissions: true } });
        if (!staff) return next(new Error('Account is inactive or unavailable'));
        roleName = staff.roleName;
        permissions = resolvePermissions(roleName, staff.permissions);
      }
      socket.data.user = {
        userId: decoded.userId,
        userType: decoded.userType as SenderUserType,
        roleName,
        permissions,
        phoneNumber: decoded.phoneNumber,
        businessName: decoded.businessName,
      };

      Logger.info(`[Socket.io] Authenticated user: ${socket.data.user.userId} (${socket.data.user.userType})`);
      next();
    } catch (err: any) {
      Logger.warn(`[Socket.io] Authentication failed: ${err.message}`);
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  // 2. Connection Event Handlers
  io.on('connection', (socket: TypedSocket) => {
    const user = socket.data.user;
    Logger.info(`[Socket.io] Client connected: ${socket.id} (User: ${user?.userId})`);

    // Handler: Join Order Bargaining Room
    socket.on('join_order', async (payload, callback) => {
      try {
        const validated = joinOrderSchema.parse(payload);
        if (!user.permissions.includes('*') && !user.permissions.includes('orders.read')) {
          if (callback) callback({ success: false, error: 'Insufficient permission' });
          return;
        }
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        // Verify order tenancy
        const verification = await ChatService.verifyOrderParticipant(validated.orderId, user.userId);
        if (!verification.isAuthorized) {
          const errResponse = { success: false, error: 'Unauthorized: User is not a participant in this order' };
          if (callback) callback(errResponse);
          socket.emit('error', { message: 'Unauthorized order room access', code: 'UNAUTHORIZED' });
          return;
        }

        await socket.join(roomName);
        Logger.info(`[Socket.io] Socket ${socket.id} (${user.userId}) joined ${roomName}`);

        // Broadcast presence to room
        io.to(roomName).emit('user_joined', {
          orderId: validated.orderId,
          userId: user.userId,
          userType: user.userType,
          name: user.businessName || 'Business Partner',
          timestamp: new Date().toISOString(),
        });

        if (callback) {
          callback({
            success: true,
            orderDetails: {
              orderId: verification.orderId,
              orderNumber: verification.orderNumber,
              orderStatus: verification.orderStatus,
              role: verification.role,
              wholesalerName: verification.wholesalerName,
              retailerName: verification.retailerName,
            },
          });
        }
      } catch (error: any) {
        Logger.error('[Socket.io] join_order error:', error.message);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handler: Leave Order Room
    socket.on('leave_order', async (payload) => {
      try {
        const validated = leaveOrderSchema.parse(payload);
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        await socket.leave(roomName);
        Logger.info(`[Socket.io] Socket ${socket.id} (${user.userId}) left ${roomName}`);

        socket.to(roomName).emit('user_left', {
          orderId: validated.orderId,
          userId: user.userId,
          userType: user.userType,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        Logger.error('[Socket.io] leave_order error:', error.message);
      }
    });

    // Handler: Send Message
    socket.on('send_message', async (payload, callback) => {
      try {
        const validated = sendMessageSchema.parse(payload);
        if (!user.permissions.includes('*') && !user.permissions.includes('orders.manage')) {
          if (callback) callback({ success: false, error: 'Insufficient permission' });
          return;
        }
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        // Verify participant
        const verification = await ChatService.verifyOrderParticipant(validated.orderId, user.userId);
        if (!verification.isAuthorized) {
          if (callback) callback({ success: false, error: 'Unauthorized order participant' });
          return;
        }

        // Persist message
        const savedMessage = await ChatService.saveMessage({
          orderId: validated.orderId,
          senderUserId: user.userId,
          senderUserType: user.userType,
          senderName: user.businessName || (user.userType === 'retailer' ? 'Retailer' : 'Wholesaler'),
          messageText: validated.messageText,
          messageType: validated.messageType,
          fileAttachments: validated.fileAttachments,
        });

        // Broadcast to all clients in the order room
        io.to(roomName).emit('new_message', savedMessage);
        Logger.info(`[Socket.io] Broadcasted message ${savedMessage.id} to ${roomName}`);

        if (callback) {
          callback({ success: true, data: savedMessage });
        }
      } catch (error: any) {
        Logger.error('[Socket.io] send_message error:', error.message);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handler: Propose Rate / Counter-Offer
    socket.on('propose_rate', async (payload, callback) => {
      try {
        const validated = proposeRateSchema.parse(payload);
        if (!user.permissions.includes('*') && !user.permissions.includes('orders.manage')) {
          if (callback) callback({ success: false, error: 'Insufficient permission' });
          return;
        }
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        const result = await ChatService.proposeRate({
          orderId: validated.orderId,
          userId: user.userId,
          userType: user.userType,
          userName: user.businessName || undefined,
          items: validated.items,
          proposedDiscountPercent: validated.proposedDiscountPercent,
          clientVersion: validated.clientVersion,
          isFinalOffer: validated.isFinalOffer,
          notes: validated.notes,
        });

        // Broadcast to all clients in the order room
        io.to(roomName).emit('rate_proposed', result);
        io.to(roomName).emit('new_message', result.systemMessage);

        // P1.2: per-line negotiation signals (emitted alongside the whole-order event)
        for (const line of result.items) {
          const tax = deriveLineTax(line.productName, line.proposedUnitPrice, line.quantity);
          const timestamp = new Date().toISOString();
          if (line.isContested) {
            io.to(roomName).emit('line_rate_proposed', {
              orderId: result.orderId,
              proposalId: result.proposalId,
              version: result.version,
              orderItemId: line.orderItemId,
              productName: line.productName,
              quantity: line.quantity,
              originalUnitPrice: line.originalUnitPrice,
              proposedUnitPrice: line.proposedUnitPrice,
              gstRate: tax.gstRate,
              lineExGstTotal: tax.lineExGstTotal,
              lineGstAmount: tax.lineGstAmount,
              lineLandedCost: tax.lineLandedCost,
              isContested: true,
              status: 'contested',
              proposerRole: result.proposerRole,
              timestamp,
            });
          } else {
            io.to(roomName).emit('line_rate_locked', {
              orderId: result.orderId,
              proposalId: result.proposalId,
              version: result.version,
              orderItemId: line.orderItemId,
              productName: line.productName,
              quantity: line.quantity,
              finalUnitPrice: line.proposedUnitPrice,
              gstRate: tax.gstRate,
              lineExGstTotal: tax.lineExGstTotal,
              lineGstAmount: tax.lineGstAmount,
              lineLandedCost: tax.lineLandedCost,
              reason: 'uncontested',
              timestamp,
            });
          }
        }
        Logger.info(`[Socket.io] Broadcasted rate proposal ${result.proposalId} to ${roomName}`);

        if (callback) {
          callback({ success: true, data: result });
        }
      } catch (error: any) {
        Logger.error('[Socket.io] propose_rate error:', error.message);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handler: Confirm Rate / Mutual Deal Lock
    socket.on('confirm_rate', async (payload, callback) => {
      try {
        const validated = confirmRateSchema.parse(payload);
        if (!user.permissions.includes('*') && !user.permissions.includes('orders.manage')) {
          if (callback) callback({ success: false, error: 'Insufficient permission' });
          return;
        }
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        const result = await ChatService.confirmRate({
          orderId: validated.orderId,
          userId: user.userId,
          userType: user.userType,
          userName: user.businessName || undefined,
          clientVersion: validated.clientVersion,
          notes: validated.notes,
        });

        // Broadcast to all clients in the order room
        if (result.isDealLocked) {
          io.to(roomName).emit('rate_locked', result);
          // P1.2: whole-order lock alias + per-line sealed signal
          io.to(roomName).emit('order_price_locked', result);
          for (const li of result.lockedItems || []) {
            const tax = deriveLineTax(li.productName, li.finalUnitPrice, li.quantity);
            io.to(roomName).emit('line_rate_locked', {
              orderId: result.orderId,
              version: result.version,
              orderItemId: li.orderItemId,
              productName: li.productName,
              quantity: li.quantity,
              finalUnitPrice: li.finalUnitPrice,
              gstRate: tax.gstRate,
              lineExGstTotal: tax.lineExGstTotal,
              lineGstAmount: tax.lineGstAmount,
              lineLandedCost: tax.lineLandedCost,
              reason: 'deal_sealed',
              timestamp: new Date().toISOString(),
            });
          }
          Logger.info(`[Socket.io] Bilateral Rate Locked for order ${result.orderNumber} (₹${result.finalPrice})`);
        } else {
          io.to(roomName).emit('rate_confirmation_pending', result);
          Logger.info(`[Socket.io] Rate confirmation pending counterparty review for order ${result.orderNumber}`);
        }

        io.to(roomName).emit('new_message', result.systemMessage);

        if (callback) {
          callback({ success: true, data: result });
        }
      } catch (error: any) {
        Logger.error('[Socket.io] confirm_rate error:', error.message);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handler: Typing Indicator Start
    socket.on('typing_start', async (payload) => {
      try {
        const validated = typingSchema.parse(payload);
        if (!user.permissions.includes('*') && !user.permissions.includes('orders.read')) return;
        const verification = await ChatService.verifyOrderParticipant(validated.orderId, user.userId);
        if (!verification.isAuthorized) return;
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        socket.to(roomName).emit('user_typing', {
          orderId: validated.orderId,
          userId: user.userId,
          name: user.businessName || (user.userType === 'retailer' ? 'Retailer' : 'Wholesaler'),
          isTyping: true,
        });
      } catch (err: any) {
        // Silently ignore typing error
      }
    });

    // Handler: Typing Indicator Stop
    socket.on('typing_stop', async (payload) => {
      try {
        const validated = typingSchema.parse(payload);
        if (!user.permissions.includes('*') && !user.permissions.includes('orders.read')) return;
        const verification = await ChatService.verifyOrderParticipant(validated.orderId, user.userId);
        if (!verification.isAuthorized) return;
        const roomName = ChatService.getOrderRoomName(validated.orderId);

        socket.to(roomName).emit('user_typing', {
          orderId: validated.orderId,
          userId: user.userId,
          name: user.businessName || (user.userType === 'retailer' ? 'Retailer' : 'Wholesaler'),
          isTyping: false,
        });
      } catch (err: any) {
        // Silently ignore typing error
      }
    });

    // Handler: Disconnect
    socket.on('disconnect', (reason) => {
      Logger.info(`[Socket.io] Socket disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });
}
