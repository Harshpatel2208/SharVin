import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../utils/logger';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { InvoiceService } from './invoice.service';
import { Gstr1FilterQuery } from './invoice.types';
import { AuthenticatedRequest } from '../../types/auth.types';
import { prisma } from '../../db';

export class InvoiceController {
  /**
   * Auto-generate or retrieve an immutable B2B GST Tax Invoice for an order.
   * POST /api/v1/invoices/generate
   */
  static async generateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId, items, wholesalerState, retailerState } = req.body;
      const user = (req as AuthenticatedRequest).user;
      if (!user?.tenantId) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication is required', 401);

      if (!orderId) {
        res.status(400).json({
          success: false,
          error: 'Order ID is required to generate a GST Tax Invoice.',
        });
        return;
      }

      const order = await prisma.order.findFirst({
        where: { id: orderId, OR: [{ retailerId: user.tenantId }, { wholesalerId: user.tenantId }] },
        select: { retailerId: true, wholesalerId: true },
      });
      if (!order) throw new AppError(AppErrorCode.NOT_FOUND, 'Order not found for this business', 404);

      const invoice = await InvoiceService.autoGenerateInvoiceForOrder({
        orderId,
        wholesalerId: order.wholesalerId,
        retailerId: order.retailerId,
        items,
        wholesalerState,
        retailerState,
      });

      res.status(201).json({
        success: true,
        data: invoice,
        message: 'Immutable B2B GST Tax Invoice generated successfully with SHA-256 digital signature.',
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      Logger.error('[InvoiceController] generateInvoice error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate GST Tax Invoice.',
      });
    }
  }

  /**
   * Retrieve invoice by ID or Invoice Number.
   * GET /api/v1/invoices/:id
   */
  static async getInvoiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const invoice = await InvoiceService.getInvoiceById(id);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: `Invoice '${id}' not found.`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: invoice,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      Logger.error('[InvoiceController] getInvoiceById error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve invoice.',
      });
    }
  }

  /**
   * Retrieve invoice by Order ID.
   * GET /api/v1/invoices/order/:orderId
   */
  static async getInvoiceByOrderId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String(req.params.orderId);
      let invoice = await InvoiceService.getInvoiceByOrderId(orderId);

      // If not yet generated, auto-generate for delivered/confirmed order
      if (!invoice) {
        invoice = await InvoiceService.autoGenerateInvoiceForOrder({ orderId });
      }

      res.status(200).json({
        success: true,
        data: invoice,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      Logger.error('[InvoiceController] getInvoiceByOrderId error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve invoice for order.',
      });
    }
  }

  /**
   * Cryptographically verify invoice authenticity & detect tampering.
   * GET /api/v1/invoices/verify/:invoiceId
   * POST /api/v1/invoices/verify/:invoiceId (supports simulating altered payload)
   */
  static async verifyInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceId = String(req.params.invoiceId);
      const verification = await InvoiceService.verifyPublicInvoice(invoiceId);
      if (!verification) throw new AppError(AppErrorCode.NOT_FOUND, 'Invoice verification record not found', 404);

      if (!verification.authentic || verification.isTampered) {
        res.status(200).json({
          success: false,
          data: verification,
          error: 'Invalid/Tampered Invoice',
          alert: 'Tamper Detected! Digital signature mismatch. Stored record differs from payload.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: verification,
        message: 'Valid Authentic Invoice. Digital signature verified against SharVin ledger.',
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      Logger.error('[InvoiceController] verifyInvoice error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Invoice verification service error.',
      });
    }
  }

  static async verifyInvoiceInternal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceId = String(req.params.invoiceId);
      const verification = await InvoiceService.verifyInvoiceIntegrity(
        invoiceId,
        req.method === 'POST' ? req.body : undefined,
      );
      res.status(200).json({
        success: verification.authentic && !verification.isTampered,
        data: verification,
        error: verification.isTampered ? 'Invalid/Tampered Invoice' : null,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List invoices for user with date-range filters.
   * GET /api/v1/invoices
   */
  static async listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.tenantId) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication is required', 401);
      const { period, startDate, endDate } = req.query as Gstr1FilterQuery;

      const invoices = await InvoiceService.listInvoices(
        user.tenantId,
        user.userType,
        { period, startDate, endDate }
      );

      res.status(200).json({
        success: true,
        data: invoices,
        count: invoices.length,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      Logger.error('[InvoiceController] listInvoices error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list invoices.',
      });
    }
  }

  /**
   * Export CA GSTR-1 in tabular .xlsx or .csv format.
   * GET /api/v1/invoices/export/gstr-1
   */
  static async exportGstr1(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.tenantId) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication is required', 401);
      if (user.userType !== 'wholesaler') throw new AppError(AppErrorCode.FORBIDDEN, 'Only wholesalers can export GSTR-1 records', 403);
      const { period = 'current_month', startDate, endDate, format = 'csv' } = req.query as Gstr1FilterQuery;

      const rows = await InvoiceService.generateGstr1Rows(
        user.tenantId,
        { period, startDate, endDate }
      );

      if (format === 'json') {
        res.status(200).json({
          success: true,
          data: rows.map((row) => ({
            invoiceNo: row.invoiceNumber,
            date: row.invoiceDate,
            buyerGstin: row.gstinRecipient,
            taxableValue: row.taxableValue,
            cgst: row.cgstAmount,
            sgst: row.sgstAmount,
            igst: row.igstAmount,
            total: row.invoiceValue,
          })),
        });
        return;
      }

      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === 'xlsx') {
        const xmlContent = InvoiceService.formatGstr1ExcelXml(rows);
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename="GSTR1_B2B_Export_${period}_${timestamp}.xls"`);
        res.status(200).send(xmlContent);
        return;
      }

      // Default CSV format
      const csvContent = InvoiceService.formatGstr1Csv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="GSTR1_B2B_Export_${period}_${timestamp}.csv"`);
      res.status(200).send(csvContent);
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      Logger.error('[InvoiceController] exportGstr1 error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to export GSTR-1 records.',
      });
    }
  }
}
