import { Response, NextFunction } from 'express';
import { AppError } from '../../utils/app-error';
import { AuthenticatedRequest } from '../../types/auth.types';
import { LedgerService } from './ledger.service';
import { 
  recordPaymentSchema, 
  postOrderSchema,
  updateCreditTermsSchema,
  creditOverrideSchema,
  demandPaymentSchema,
  splitSettlementSchema
} from './ledger.validation';

export class LedgerController {
  /**
   * GET /api/v1/ledger/accounts/:partnerId
   * Retrieve active ledger account summary, outstanding balance, and credit terms.
   */
  static async getLedgerAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const partnerId = Array.isArray(req.params.partnerId) ? req.params.partnerId[0] : String(req.params.partnerId);
      const user = req.user!;

      const summary = await LedgerService.getLedgerAccount(
        partnerId,
        user.tenantId,
        user.userType
      );

      res.status(200).json({
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
        error: error.message || 'Failed to retrieve ledger account',
      });
    }
  }

  /**
   * GET /api/v1/ledger/transactions/:partnerId
   * Retrieve chronological statement of ledger debits and credits.
   */
  static async getLedgerTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const partnerId = Array.isArray(req.params.partnerId) ? req.params.partnerId[0] : String(req.params.partnerId);
      const user = req.user!;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const transactions = await LedgerService.getLedgerTransactions(
        partnerId,
        user.tenantId,
        user.userType,
        limit
      );

      res.status(200).json({
        success: true,
        data: transactions,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve ledger transactions',
      });
    }
  }

  /**
   * POST /api/v1/ledger/payments
   * Record a payment settlement (Cash, UPI, Bank Transfer, Cheque) against outstanding balance.
   */
  static async recordPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const validatedInput = recordPaymentSchema.parse(req.body);

      const result = await LedgerService.recordPaymentSettlement(
        validatedInput,
        user.userId,
        user.userType
      );

      // Broadcast realtime event if Socket.io is attached
      const io = req.app.get('io');
      if (io) {
        const partnerRoom = `partner:${validatedInput.partnerId}`;
        const orderRoom = validatedInput.orderId ? `order:${validatedInput.orderId}` : null;

        const eventPayload = {
          type: 'payment_received',
          amount: result.amount,
          paymentMethod: result.paymentMethod,
          receiptNumber: result.receiptNumber,
          newBalance: result.newBalance,
          timestamp: result.paymentDate,
        };

        io.to(partnerRoom).emit('ledger_updated', eventPayload);
        if (orderRoom) {
          io.to(orderRoom).emit('ledger_updated', eventPayload);
          io.to(orderRoom).emit('new_message', {
            id: `sys-msg-${Date.now()}`,
            orderId: validatedInput.orderId,
            connectionId: 'conn-system',
            senderUserId: user.userId,
            senderUserType: user.userType,
            senderName: user.businessName || 'System',
            messageType: 'system',
            messageText: `💰 Payment of ₹${result.amount.toLocaleString('en-IN')} received via ${result.paymentMethod.toUpperCase()} (Receipt: ${result.receiptNumber}). Net balance: ₹${result.newBalance.toLocaleString('en-IN')}.`,
            fileAttachments: {
              type: 'ledger_settlement',
              receiptNumber: result.receiptNumber,
              amount: result.amount,
              paymentMethod: result.paymentMethod,
              newBalance: result.newBalance,
            },
            isDelivered: true,
            createdAt: new Date().toISOString(),
          });
        }
      }

      res.status(201).json({
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
        error: error.message || 'Failed to record payment settlement',
      });
    }
  }

  /**
   * POST /api/v1/ledger/orders/:orderId/post
   * Explicitly post delivered order to B2B ledger.
   */
  static async postOrderToLedger(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const validatedInput = postOrderSchema.parse({
        ...req.body,
        orderId,
      });

      const result = await LedgerService.postDeliveredOrderToLedger(
        validatedInput.orderId,
        validatedInput.notes
      );

      res.status(200).json({
        success: true,
        message: 'Order posted to ledger successfully',
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to post order to ledger',
      });
    }
  }

  /**
   * POST /api/v1/ledger/orders/:orderId/rollback
   * Reverse ledger debits and update running credit balances when order is cancelled or rejected (Edge Case 7).
   */
  static async rollbackCancelledOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;
      const { partnerId, reason, amount } = req.body || {};

      const result = await LedgerService.rollbackCancelledOrder(
        { orderId, partnerId, reason, amount: amount ? Number(amount) : undefined },
        user.userId,
        user.userType
      );

      // Realtime notification via Socket.io
      const io = req.app.get('io');
      if (io) {
        const orderRoom = `order:${orderId}`;
        const partnerRoom = partnerId ? `partner:${partnerId}` : null;
        const payload = {
          type: 'ledger_rollback',
          orderId,
          reversedAmount: result.reversedAmount,
          newBalance: result.newBalance,
          reason: reason || 'Counter rejection / transit cancellation',
          timestamp: new Date().toISOString(),
        };

        io.to(orderRoom).emit('ledger_updated', payload);
        if (partnerRoom) io.to(partnerRoom).emit('ledger_updated', payload);
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
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to rollback cancelled order in ledger',
      });
    }
  }

  /**
   * POST /api/v1/ledger/orders/:orderId/settle-split
   * Settle delivery with partial cash payment and remainder on Khata credit.
   */
  static async settleSplitPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const validatedInput = splitSettlementSchema.parse(req.body);
      const user = req.user!;

      const result = await LedgerService.settleOrderDeliverySplitPayment(
        {
          orderId,
          ...validatedInput,
        },
        user.userId,
        user.userType
      );

      // Realtime notification via Socket.io
      const io = req.app.get('io');
      if (io) {
        const orderRoom = `order:${orderId}`;
        const partnerRoom = validatedInput.partnerId ? `partner:${validatedInput.partnerId}` : null;
        const payload = {
          type: 'split_payment_settled',
          orderId,
          totalOrderAmount: result.totalOrderAmount,
          cashPaid: result.cashPaid,
          creditAddedToKhata: result.creditAddedToKhata,
          newBalance: result.newBalance,
          receiptNumber: result.receiptNumber,
          timestamp: new Date().toISOString(),
        };

        io.to(orderRoom).emit('ledger_updated', payload);
        if (partnerRoom) io.to(partnerRoom).emit('ledger_updated', payload);
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
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to settle split payment in ledger',
      });
    }
  }

  /**
   * GET /api/v1/ledger/vouchers/:id
   * Retrieve official B2B Khata Settlement Voucher with CA Double-Entry Audit details.
   */
  static async getSettlementVoucher(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const voucherIdOrNumber = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const voucher = await LedgerService.getSettlementVoucher(voucherIdOrNumber, req.user!.tenantId);

      res.status(200).json({
        success: true,
        data: voucher,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(404).json({
        success: false,
        error: error.message || 'Settlement voucher not found',
      });
    }
  }

  /**
   * GET /api/v1/ledger/vouchers/:id/csv
   * Download official B2B Khata Settlement Voucher in RFC-4180 CSV format for CA records.
   */
  static async exportVoucherCsv(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const voucherIdOrNumber = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const csv = await LedgerService.exportVoucherCsv(voucherIdOrNumber, req.user!.tenantId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=Khata-Voucher-${voucherIdOrNumber}.csv`);
      res.status(200).send(csv);
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(404).json({
        success: false,
        error: error.message || 'Failed to export settlement voucher CSV',
      });
    }
  }

  /**
   * GET /api/v1/ledger/credit-profile/:partnerId
   * Retrieve comprehensive credit assessment: utilization, limit, overdue invoices, and freeze status.
   */
  static async getCreditProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const partnerId = Array.isArray(req.params.partnerId) ? req.params.partnerId[0] : String(req.params.partnerId);
      const user = req.user!;
      const cartTotal = req.query.cartTotal ? Number(req.query.cartTotal) : undefined;
      const orderId = req.query.orderId ? String(req.query.orderId) : undefined;
      const simulateOverdue = req.query.simulateOverdue === 'true';
      const simulateCreditExceeded = req.query.simulateCreditExceeded === 'true';

      const creditProfile = await LedgerService.getCreditProfile(
        partnerId,
        user.userId,
        user.userType,
        {
          cartTotal,
          orderId,
          simulateOverdue,
          simulateCreditExceeded,
        }
      );

      res.status(200).json({
        success: true,
        data: creditProfile,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to evaluate credit profile',
      });
    }
  }

  /**
   * PATCH /api/v1/ledger/credit-terms/:partnerId
   * Wholesaler sets/updates credit limit and payment term days.
   */
  static async updateCreditTerms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const partnerId = Array.isArray(req.params.partnerId) ? req.params.partnerId[0] : String(req.params.partnerId);
      const user = req.user!;
      const validation = updateCreditTermsSchema.safeParse({ ...req.body, partnerId });

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: validation.error.issues[0]?.message || 'Invalid credit terms parameters',
        });
        return;
      }

      const { creditLimit, paymentTermDays } = validation.data;
      const result = await LedgerService.updateCreditTerms(
        partnerId,
        creditLimit,
        paymentTermDays,
        user.userId
      );

      const io = req.app.get('io');
      if (io) {
        io.emit('credit_terms_updated', {
          partnerId,
          creditLimit,
          paymentTermDays,
          updatedBy: user.userId,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update credit terms',
      });
    }
  }

  /**
   * POST /api/v1/ledger/orders/:orderId/credit-override
   * Wholesaler overrides credit block or overdue freeze for an order.
   */
  static async overrideOrderCredit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;
      const validation = creditOverrideSchema.safeParse({ ...req.body, orderId });

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: validation.error.issues[0]?.message || 'Invalid override payload',
        });
        return;
      }

      const { reason } = validation.data;
      const result = await LedgerService.overrideOrderCredit(orderId, reason, user.userId, user.userType);

      const io = req.app.get('io');
      if (io) {
        io.emit('order_credit_overridden', {
          orderId,
          reason,
          overriddenBy: user.userId,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to override credit limit',
      });
    }
  }

  /**
   * POST /api/v1/ledger/orders/:orderId/demand-payment
   * Wholesaler freezes deal and demands payment before dispatch.
   */
  static async demandPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : String(req.params.orderId);
      const user = req.user!;
      const validation = demandPaymentSchema.safeParse({ ...req.body, orderId });

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: validation.error.issues[0]?.message || 'Invalid demand payment payload',
        });
        return;
      }

      const result = await LedgerService.demandPayment(orderId, user.userId, validation.data.notes);

      const io = req.app.get('io');
      if (io) {
        io.emit('payment_demanded', {
          orderId,
          notes: validation.data.notes,
          demandedBy: user.userId,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to issue payment demand',
      });
    }
  }

  /**
   * POST /api/v1/ledger/simulate-overdue
   * Testing & demo helper to trigger overdue invoice scenario.
   */
  static async simulateOverdue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { partnerId, daysOverdue, amount, clear } = req.body;
      const targetPartner = partnerId || 'demo-retailer-01';

      if (clear) {
        LedgerService.clearOverdueSimulation(targetPartner);
        res.status(200).json({ success: true, message: `Overdue simulation cleared for ${targetPartner}` });
        return;
      }

      LedgerService.simulateOverdue(targetPartner, Number(daysOverdue) || 7, Number(amount) || 14500.00);
      res.status(200).json({
        success: true,
        message: `Simulated overdue invoice for ${targetPartner} (${daysOverdue || 7} days overdue, ₹${amount || 14500})`,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

