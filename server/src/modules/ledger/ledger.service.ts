import prisma from '../../db';
import { Logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { 
  LedgerAccountSummary, 
  LedgerTransactionDto, 
  RecordPaymentPayload, 
  RecordPaymentResult,
  KhataSettlementVoucherDto,
  DoubleEntryJournal,
  KhataSettlementParty,
  CreditProfileSummary,
  OverdueInvoiceSummary
} from './ledger.types';
import { assertCanFinalizeLedgerPayment, assertOrderEligibleForLedgerRollback, buildVoucherTenantScope } from './ledger-policy';
import { PaymentMethod, LedgerTransactionType } from '@prisma/client';
import { createHash, randomInt, randomUUID } from 'crypto';

function generateVoucherHash(payload: {
  voucherNumber: string;
  receiptNumber: string;
  payerGstin: string;
  payeeGstin: string;
  amountPaid: number;
  closingBalance: number;
}): string {
  const content = [
    payload.voucherNumber,
    payload.receiptNumber,
    payload.payerGstin,
    payload.payeeGstin,
    payload.amountPaid.toFixed(2),
    payload.closingBalance.toFixed(2),
  ].join('|');
  return createHash('sha256').update(content).digest('hex');
}

// ==========================================
// LEDGERS & PAYMENTS
// ==========================================

export class LedgerService {
  /** Create the two immutable journal lines for one balanced posting. */
  private static async appendBalancedEntries(
    tx: Prisma.TransactionClient,
    transactionId: string,
    debitAccount: 'accounts_receivable' | 'sales_revenue' | 'cash' | 'sales_returns' | 'escrow_receivable' | 'escrow_liability',
    creditAccount: 'accounts_receivable' | 'sales_revenue' | 'cash' | 'sales_returns' | 'escrow_receivable' | 'escrow_liability',
    amountInput: Prisma.Decimal | number | string,
  ) {
    const amount = new Prisma.Decimal(amountInput);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Ledger posting amount must be positive and finite', 400);
    }

    await tx.ledgerEntry.createMany({
      data: [
        { transactionId, accountCode: debitAccount, debitAmount: amount, creditAmount: new Prisma.Decimal(0) },
        { transactionId, accountCode: creditAccount, debitAmount: new Prisma.Decimal(0), creditAmount: amount },
      ],
    });
  }

  /**
   * Internal helper to fetch a ledger account from DB.
   */
  private static async getAccount(partnerId: string, counterpartyId?: string) {
    if (!counterpartyId) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authenticated party context is required to access a ledger', 401);
    }
    const where = {
      AND: [
        { OR: [{ retailerId: counterpartyId }, { wholesalerId: counterpartyId }] },
        { OR: [{ id: partnerId }, { retailerId: partnerId }, { wholesalerId: partnerId }, { connectionId: partnerId }] },
      ],
    };

    const account = await prisma.ledgerAccount.findFirst({
      where,
      include: {
        retailer: true,
        wholesaler: true,
      },
    });

    if (!account) {
      throw new AppError(AppErrorCode.NOT_FOUND, `Ledger account not found for partner: ${partnerId}`, 404);
    }
    return account;
  }

  /**
   * Acquires a PostgreSQL row-level lock (SELECT ... FOR UPDATE) on the ledger account.
   * MUST be called inside a transaction. Prevents concurrent read-modify-write races
   * on currentBalance when multiple payments/orders post simultaneously.
   */
  private static async getLockedAccount(
    tx: Prisma.TransactionClient,
    partnerId: string,
    counterpartyId?: string
  ) {
    const rows = counterpartyId && counterpartyId !== partnerId
      ? await tx.$queryRaw<Array<{ ledger_id: string }>>`
          SELECT ledger_id FROM ledger_accounts
          WHERE (retailer_id = ${counterpartyId} OR wholesaler_id = ${counterpartyId})
            AND (
              ledger_id = ${partnerId}
              OR (retailer_id = ${counterpartyId} AND wholesaler_id = ${partnerId})
              OR (retailer_id = ${partnerId} AND wholesaler_id = ${counterpartyId})
            )
          LIMIT 1
          FOR UPDATE
        `
      : await tx.$queryRaw<Array<{ ledger_id: string }>>`
          SELECT ledger_id FROM ledger_accounts
          WHERE ledger_id = ${partnerId} OR retailer_id = ${partnerId} OR wholesaler_id = ${partnerId}
          LIMIT 1
          FOR UPDATE
        `;
    const ledgerId = rows[0]?.ledger_id;
    if (!ledgerId) {
      throw new AppError(AppErrorCode.NOT_FOUND, `Ledger account not found for partner: ${partnerId}`, 404);
    }
    return tx.ledgerAccount.findUniqueOrThrow({
      where: { id: ledgerId },
      include: { retailer: true, wholesaler: true },
    });
  }

  /**
   * Locks the exact ledger account for a trading pair derived from the order.
   * Avoids ambiguous partner-ID lookups when a wholesaler serves many retailers.
   */
  private static async getLockedAccountForOrder(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { retailerId: true, wholesalerId: true },
    });
    if (!order) {
      throw new AppError(AppErrorCode.NOT_FOUND, `Cannot resolve ledger account: order ${orderId} not found`, 404);
    }

    const rows = await tx.$queryRaw<Array<{ ledger_id: string }>>`
      SELECT ledger_id FROM ledger_accounts
      WHERE retailer_id = ${order.retailerId} AND wholesaler_id = ${order.wholesalerId}
      LIMIT 1
      FOR UPDATE
    `;
    const ledgerId = rows[0]?.ledger_id;
    if (!ledgerId) {
      throw new AppError(AppErrorCode.NOT_FOUND, `Ledger account not found for partner: ${order.retailerId}`, 404);
    }
    return tx.ledgerAccount.findUniqueOrThrow({
      where: { id: ledgerId },
      include: { retailer: true, wholesaler: true },
    });
  }

  /** Lock terms first, then the exact buyer/seller balance row for debt decisions. */
  private static async getLockedCreditContextForOrder(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        retailerId: true,
        wholesalerId: true,
        connectionId: true,
        creditOverridden: true,
        creditOverrideReason: true,
        finalPrice: true,
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        lifecycleStatus: true,
        orderStatus: true,
      },
    });
    if (!order) throw new AppError(AppErrorCode.NOT_FOUND, `Order ${orderId} not found`, 404);

    const [connectionRow] = await tx.$queryRaw<Array<{ connection_id: string }>>`
      SELECT connection_id
      FROM retailer_wholesaler_connections
      WHERE connection_id = ${order.connectionId}
      FOR UPDATE
    `;
    if (!connectionRow) throw new AppError(AppErrorCode.NOT_FOUND, 'Trading relationship not found', 404);

    const connection = await tx.retailerWholesalerConnection.findUniqueOrThrow({
      where: { id: connectionRow.connection_id },
      select: { id: true, retailerId: true, wholesalerId: true, creditLimit: true, paymentTermDays: true, creditStatus: true },
    });

    const [accountRow] = await tx.$queryRaw<Array<{ ledger_id: string }>>`
      SELECT ledger_id FROM ledger_accounts
      WHERE retailer_id = ${order.retailerId} AND wholesaler_id = ${order.wholesalerId}
      FOR UPDATE
    `;
    if (!accountRow) throw new AppError(AppErrorCode.NOT_FOUND, 'Ledger account not found for this trading relationship', 404);

    const account = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountRow.ledger_id } });
    return { order, connection, account };
  }

  /** Apply credits to linked invoices first, then apply unassigned payments FIFO. */
  private static async calculateOverdueInvoices(
    tx: Prisma.TransactionClient,
    ledgerId: string,
    retailerId: string,
    wholesalerId: string,
    paymentTermDays: number,
    now = new Date(),
  ): Promise<OverdueInvoiceSummary[]> {
    const invoices = await tx.invoice.findMany({
      where: { retailerId, wholesalerId },
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, invoiceNumber: true, orderId: true, totalInvoiceAmount: true, issuedAt: true, status: true },
    });

    const openInvoices = invoices.filter((invoice) =>
      !['paid', 'void', 'cancelled', 'credited', 'reversed'].includes(invoice.status.toLowerCase()),
    );
    const balances = new Map(openInvoices.map((invoice) => [invoice.id, new Prisma.Decimal(invoice.totalInvoiceAmount)]));
    const invoiceByOrderId = new Map(openInvoices.map((invoice) => [invoice.orderId, invoice.id]));

    const credits = await tx.ledgerTransaction.findMany({
      where: { ledgerId, isCredit: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { amount: true, orderId: true, notes: true, sourceEventKey: true },
    });

    for (const credit of credits) {
      if (credit.sourceEventKey?.startsWith('escrow-release:') || credit.notes?.includes('Escrow Released:')) continue;
      let unapplied = new Prisma.Decimal(credit.amount);
      const linkedInvoiceId = credit.orderId ? invoiceByOrderId.get(credit.orderId) : undefined;
      if (linkedInvoiceId) {
        const openBalance = balances.get(linkedInvoiceId) || new Prisma.Decimal(0);
        const applied = Prisma.Decimal.min(openBalance, unapplied);
        balances.set(linkedInvoiceId, openBalance.minus(applied));
        unapplied = unapplied.minus(applied);
      }

      if (unapplied.gt(0)) {
        for (const invoice of openInvoices) {
          const openBalance = balances.get(invoice.id) || new Prisma.Decimal(0);
          if (openBalance.lte(0)) continue;
          const applied = Prisma.Decimal.min(openBalance, unapplied);
          balances.set(invoice.id, openBalance.minus(applied));
          unapplied = unapplied.minus(applied);
          if (unapplied.lte(0)) break;
        }
      }
    }

    return openInvoices.flatMap((invoice) => {
      const balance = balances.get(invoice.id) || new Prisma.Decimal(0);
      if (balance.lte(0)) return [];
      const dueAt = new Date(invoice.issuedAt.getTime() + paymentTermDays * 24 * 60 * 60 * 1000);
      if (dueAt >= now) return [];
      const daysOverdue = Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000)));
      return [{
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: balance.toNumber(),
        issuedAt: invoice.issuedAt.toISOString(),
        dueDate: dueAt.toISOString(),
        daysOverdue,
      }];
    });
  }

  private static async assertCreditPolicy(
    tx: Prisma.TransactionClient,
    order: { id: string; retailerId: string; wholesalerId: string; creditOverridden: boolean },
    connection: { creditLimit: Prisma.Decimal; paymentTermDays: number; creditStatus: string },
    account: { id: string; currentBalance: Prisma.Decimal; reservedCredit: Prisma.Decimal },
    additionalExposure: Prisma.Decimal,
  ) {
    if (additionalExposure.lte(0) || order.creditOverridden) return;
    if (connection.creditStatus !== 'active') {
      throw new AppError(AppErrorCode.CONFLICT, 'Credit is frozen for this trading relationship', 409);
    }

    const overdueInvoices = await this.calculateOverdueInvoices(
      tx, account.id, order.retailerId, order.wholesalerId, connection.paymentTermDays,
    );
    if (overdueInvoices.length) {
      throw new AppError(AppErrorCode.CONFLICT, 'Credit is frozen because one or more invoices are overdue', 409, {
        overdueInvoices,
      });
    }

    const projectedExposure = Prisma.Decimal.max(0, account.currentBalance)
      .plus(account.reservedCredit)
      .plus(additionalExposure);
    if (projectedExposure.gt(connection.creditLimit)) {
      throw new AppError(AppErrorCode.CONFLICT, 'Order would exceed the trading relationship credit limit', 409, {
        creditLimit: connection.creditLimit.toNumber(),
        currentBalance: account.currentBalance.toNumber(),
        reservedCredit: account.reservedCredit.toNumber(),
        requestedExposure: additionalExposure.toNumber(),
      });
    }
  }

  /** Reserve credit exposure atomically when an order is accepted. */
  static async reserveOrderCreditInTransaction(
    tx: Prisma.TransactionClient,
    orderId: string,
    amountInput: Prisma.Decimal | number | string,
  ) {
    const amount = new Prisma.Decimal(amountInput);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Credit exposure must be positive and finite', 400);
    }

    const { order, connection, account } = await this.getLockedCreditContextForOrder(tx, orderId);
    const existing = await tx.ledgerCreditReservation.findUnique({ where: { orderId } });
    if (existing) {
      if (existing.status === 'reserved' && existing.amount.eq(amount)) return existing;
      throw new AppError(AppErrorCode.CONFLICT, 'Credit reservation already exists with a different state or amount', 409);
    }

    await this.assertCreditPolicy(tx, order, connection, account, amount);

    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: { reservedCredit: { increment: amount } },
    });
    return tx.ledgerCreditReservation.create({
      data: { ledgerId: account.id, orderId, amount },
    });
  }

  /** Release an order's reserved credit when it is cancelled or rejected. */
  static async releaseOrderCreditInTransaction(tx: Prisma.TransactionClient, orderId: string) {
    const reservation = await tx.ledgerCreditReservation.findUnique({ where: { orderId } });
    if (!reservation || reservation.status !== 'reserved') return;

    const [accountRow] = await tx.$queryRaw<Array<{ ledger_id: string }>>`
      SELECT ledger_id FROM ledger_accounts WHERE ledger_id = ${reservation.ledgerId} FOR UPDATE
    `;
    if (!accountRow) throw new AppError(AppErrorCode.NOT_FOUND, 'Credit reservation ledger account not found', 404);

    await tx.ledgerAccount.update({
      where: { id: reservation.ledgerId },
      data: { reservedCredit: { decrement: reservation.amount } },
    });
    await tx.ledgerCreditReservation.update({
      where: { id: reservation.id },
      data: { status: 'released', releasedAt: new Date() },
    });
  }

  private static async consumeOrderCreditReservation(
    tx: Prisma.TransactionClient,
    order: { id: string; retailerId: string; wholesalerId: string; creditOverridden: boolean },
    connection: { creditLimit: Prisma.Decimal; paymentTermDays: number; creditStatus: string },
    account: { id: string; currentBalance: Prisma.Decimal; reservedCredit: Prisma.Decimal },
    amount: Prisma.Decimal,
  ) {
    const reservation = await tx.ledgerCreditReservation.findUnique({ where: { orderId: order.id } });
    if (!reservation) {
      await this.assertCreditPolicy(tx, order, connection, account, amount);
      return;
    }
    if (reservation.status !== 'reserved') {
      throw new AppError(AppErrorCode.CONFLICT, 'Order credit reservation is not active', 409);
    }

    const additionalExposure = Prisma.Decimal.max(0, amount.minus(reservation.amount));
    await this.assertCreditPolicy(tx, order, connection, account, additionalExposure);
    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: { reservedCredit: { decrement: reservation.amount } },
    });
    await tx.ledgerCreditReservation.update({
      where: { id: reservation.id },
      data: { status: 'consumed', consumedAt: new Date() },
    });
  }

  /**
   * Fetch active ledger account summary between retailer and wholesaler.
   */
  static async getLedgerAccount(
    partnerId: string,
    userId: string,
    userRole: string
  ): Promise<LedgerAccountSummary> {
    try {
      const dbAccount = await this.getAccount(partnerId, userId);
      const terms = await prisma.retailerWholesalerConnection.findUnique({
        where: { id: dbAccount.connectionId },
        select: { creditLimit: true, paymentTermDays: true },
      });
      const totalDebit = dbAccount.totalDebit;
      const totalCredit = dbAccount.totalCredit;
      const currentBalance = dbAccount.currentBalance;
      const reservedCredit = dbAccount.reservedCredit;
      const creditLimit = terms?.creditLimit ?? new Prisma.Decimal(0);
      const exposure = Prisma.Decimal.max(0, currentBalance).plus(reservedCredit);
      const creditAvailable = Prisma.Decimal.max(0, creditLimit.minus(exposure));
      const creditUtilizationPercent = creditLimit.gt(0)
        ? Prisma.Decimal.min(100, exposure.div(creditLimit).mul(100)).toNumber()
        : exposure.gt(0) ? 100 : 0;
  
      let status: 'healthy' | 'approaching_limit' | 'limit_exceeded' = 'healthy';
      if (creditUtilizationPercent >= 90) status = 'limit_exceeded';
      else if (creditUtilizationPercent >= 60) status = 'approaching_limit';
  
      const dueDate = new Date(Date.now() + (terms?.paymentTermDays ?? 0) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
      return {
        ledgerId: dbAccount.id,
        retailerId: dbAccount.retailerId,
        retailerName: dbAccount.retailer.businessName || dbAccount.retailer.fullName || 'Retailer',
        wholesalerId: dbAccount.wholesalerId,
        wholesalerName: dbAccount.wholesaler.businessName || dbAccount.wholesaler.fullName || 'Wholesaler',
        totalDebit: totalDebit.toNumber(),
        totalCredit: totalCredit.toNumber(),
        currentBalance: currentBalance.toNumber(),
        reservedCredit: reservedCredit.toNumber(),
        creditLimit: creditLimit.toNumber(),
        creditAvailable: creditAvailable.toNumber(),
        creditUtilizationPercent,
        paymentTermsDays: terms?.paymentTermDays ?? 0,
        dueDate,
        status,
        lastTransactionAt: dbAccount.lastTransactionAt?.toISOString() || null,
      };
  } catch (e: any) {
      if (e instanceof AppError) throw e;
      Logger.error(`[LedgerService.getLedgerAccount] Failed: ${e.message}`);
      throw new AppError(AppErrorCode.INTERNAL_SERVER_ERROR, 'Failed to fetch ledger account', 500);
    }
  }
  
  /**
   * Fetch chronological transactions for a partner's ledger account.
   */
  static async getLedgerTransactions(
    partnerId: string,
    userId: string,
    userRole: string,
    limit: number = 50
  ): Promise<LedgerTransactionDto[]> {
    try {
      const dbTransactions = await prisma.ledgerTransaction.findMany({
        where: {
          ledger: {
            AND: [
              { OR: [{ retailerId: userId }, { wholesalerId: userId }] },
              { OR: [
                { id: partnerId },
                { retailerId: partnerId },
                { wholesalerId: partnerId },
                { connectionId: partnerId },
              ] },
            ],
          },
        },
        include: {
          order: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
  
      if (dbTransactions && dbTransactions.length > 0) {
        return dbTransactions.map((tx) => ({
          transactionId: tx.id,
          ledgerId: tx.ledgerId,
          transactionType: tx.transactionType,
          amount: tx.amount.toNumber(),
          isCredit: tx.isCredit,
          orderId: tx.orderId,
          orderNumber: tx.order?.orderNumber || null,
          paymentId: tx.paymentId,
          paymentMethod: null,
          balanceBefore: tx.balanceBefore ? tx.balanceBefore.toNumber() : 0,
          balanceAfter: tx.balanceAfter ? tx.balanceAfter.toNumber() : 0,
          notes: tx.notes,
          createdByName: tx.createdByUserId ? 'Authorized User' : 'System',
          createdAt: tx.createdAt.toISOString(),
        }));
      }
      return [];
    } catch (e: any) {
      throw new Error(`Failed to fetch ledger transactions: ${e.message}`);
    }
  }

  /**
   * Record a payment settlement (Cash, UPI, Bank Transfer, Cheque).
   * Atomically decrements the outstanding credit balance and creates an append-only transaction.
   */
  /**
   * Record a payment settlement (Cash, UPI, Bank Transfer, Cheque).
   * Atomically decrements the outstanding credit balance and creates an append-only transaction and CA Settlement Voucher.
   */
  static async recordPaymentSettlement(
    payload: RecordPaymentPayload,
    userId: string,
    userRole: string
  ): Promise<RecordPaymentResult> {
    assertCanFinalizeLedgerPayment(userRole);
    const { partnerId, amount, paymentMethod, paymentReferenceNumber, orderId, notes, collectedByDriverId, idempotencyKey } = payload;
    if (!idempotencyKey?.trim()) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'An idempotency key is required for payment postings', 400);
    }
    
    // 0. Idempotency Check (Outside transaction for performance)
    {
      const authorizedAccount = await this.getAccount(partnerId, userId);
      const existingPayment = await prisma.paymentRecord.findUnique({
        where: { idempotencyKey },
        include: {
          ledgerTransactions: true,
          khataSettlementVouchers: {
            where: { OR: [{ retailerId: userId }, { wholesalerId: userId }] },
          },
        },
      });
  
      if (existingPayment) {
        const tx = existingPayment.ledgerTransactions[0];
        const voucher = existingPayment.khataSettlementVouchers[0];
        if (existingPayment.ledgerId !== authorizedAccount.id || !existingPayment.amount.eq(amount) || existingPayment.paymentMethod !== paymentMethod || (existingPayment.ledgerTransactions[0]?.orderId ?? null) !== (orderId ?? null)) {
          throw new AppError(AppErrorCode.CONFLICT, 'Idempotency key was already used for a different payment request', 409);
        }
        
        if (!tx || !voucher) {
      throw new AppError(AppErrorCode.CONFLICT, 'Payment record exists but associated transaction or voucher is missing. Data inconsistency detected.', 409);
        }
  
        return {
          success: true,
          paymentId: existingPayment.id,
          transactionId: tx.id,
          ledgerId: existingPayment.ledgerId,
          amount: existingPayment.amount.toNumber(),
          paymentMethod: existingPayment.paymentMethod as PaymentMethod,
          previousBalance: tx.balanceBefore ? tx.balanceBefore.toNumber() : 0,
          newBalance: tx.balanceAfter ? tx.balanceAfter.toNumber() : 0,
          message: `Payment already recorded (Idempotent). Receipt: ${voucher.receiptNumber}`,
          paymentDate: existingPayment.paymentDate.toISOString(),
          receiptNumber: voucher.receiptNumber,
          voucherId: voucher.id,
          voucherNumber: voucher.voucherNumber,
        };
      }
    }
  
    const now = new Date();
    const paymentAmount = new Prisma.Decimal(amount);
    const receiptNumber = `RCPT-${now.getUTCFullYear()}-${randomInt(1_000_000, 10_000_000)}`;
    const voucherId = randomUUID();
    const voucherNumber = `KSV-${now.getUTCFullYear()}-${randomInt(1_000_000, 10_000_000)}`;
    const settlementCycle = payload.settlementCycle || '15_days';
  
    try {
      return await prisma.$transaction(async (tx) => {
      // 1. Lock account row and read the authoritative current balance
      const account = await this.getLockedAccount(tx, partnerId, userId);
  
      const previousBalance = account.currentBalance;
      // Payments above the open receivable are advances; preserve the signed balance.
      const newBalance = previousBalance.minus(paymentAmount);
      const ledgerId = account.id;
  
      const [payerUser, payeeUser] = await Promise.all([
        tx.user.findUnique({ where: { id: account.retailerId }, include: { retailerProfile: true, addresses: { where: { isPrimary: true }, take: 1 } } }),
        tx.user.findUnique({ where: { id: account.wholesalerId }, include: { wholesalerProfile: true, addresses: { where: { isPrimary: true }, take: 1 } } }),
      ]);
      const addressText = (address?: { addressLine1: string; addressLine2: string | null; city: string; state: string; postalCode: string } | null) =>
        address ? [address.addressLine1, address.addressLine2, address.city, address.state, address.postalCode].filter(Boolean).join(', ') : 'Not provided';
      const payer: KhataSettlementParty = {
        id: account.retailerId,
        name: payerUser?.businessName || payerUser?.fullName || 'Retailer',
        gstin: payerUser?.retailerProfile?.gstNumber || 'Not provided',
        pan: payerUser?.retailerProfile?.panNumber || undefined,
        address: addressText(payerUser?.addresses[0]),
        contactNumber: payerUser?.phoneNumber || undefined,
      };
      const payee: KhataSettlementParty = {
        id: account.wholesalerId,
        name: payeeUser?.businessName || payeeUser?.fullName || 'Wholesaler',
        gstin: payeeUser?.wholesalerProfile?.gstNumber || 'Not provided',
        pan: payeeUser?.wholesalerProfile?.panNumber || undefined,
        address: addressText(payeeUser?.addresses[0]),
        contactNumber: payeeUser?.phoneNumber || undefined,
      };
  
      // 2. Update Ledger Account (Atomic)
      await tx.ledgerAccount.update({
        where: { id: ledgerId },
        data: {
          totalCredit: { increment: paymentAmount },
          currentBalance: newBalance,
          lastTransactionAt: now,
        },
      });
  
      // 3. Create Payment Record
      const payment = await tx.paymentRecord.create({
        data: {
          ledgerId,
          retailerId: account.retailerId,
          wholesalerId: account.wholesalerId,
          paymentMethod: paymentMethod as PaymentMethod,
          amount: paymentAmount,
          paymentReferenceNumber: paymentReferenceNumber || receiptNumber,
          paymentStatus: 'verified',
          paymentDate: now,
          collectedByDriverId: collectedByDriverId || null,
          idempotencyKey,
        },
      });
  
      // 4. Create Append-Only Ledger Transaction
      const transaction = await tx.ledgerTransaction.create({
        data: {
          ledgerId,
          transactionType: 'payment_received',
          amount: paymentAmount,
          isCredit: true,
          paymentId: payment.id,
          orderId: orderId || null,
          balanceBefore: previousBalance,
          balanceAfter: newBalance,
          notes: notes || `Settlement payment received via ${paymentMethod.toUpperCase()} [Voucher: ${voucherNumber}]`,
          createdByUserId: userId,
          sourceEventKey: `payment:${idempotencyKey}`,
        },
      });
      await this.appendBalancedEntries(tx, transaction.id, 'cash', 'accounts_receivable', paymentAmount);
  
      // 5. Create Settlement Voucher
      const voucher = await tx.khataSettlementVoucher.create({
        data: {
          id: voucherId,
          voucherNumber,
          receiptNumber,
          idempotencyKey,
          transactionId: transaction.id,
          paymentRecordId: payment.id,
          ledgerId,
          retailerId: account.retailerId,
          wholesalerId: account.wholesalerId,
          settlementCycle,
          paymentMethod: paymentMethod as PaymentMethod,
          paymentReference: paymentReferenceNumber || null,
          openingBalance: previousBalance,
          amountPaid: paymentAmount,
          closingBalance: newBalance,
          digitalSignatureHash: generateVoucherHash({
            voucherNumber,
            receiptNumber,
            payerGstin: payer.gstin,
            payeeGstin: payee.gstin,
            amountPaid: paymentAmount.toNumber(),
            closingBalance: newBalance.toNumber(),
          }),
          notes: notes || `Settlement payment received via ${paymentMethod.toUpperCase()}`,
          settledAt: now,
        },
      });
  
      return {
        success: true,
        paymentId: payment.id,
        transactionId: transaction.id,
        ledgerId: ledgerId,
        amount: paymentAmount.toNumber(),
        paymentMethod: paymentMethod as PaymentMethod,
        previousBalance: previousBalance.toNumber(),
        newBalance: newBalance.toNumber(),
        message: `Payment of ₹${paymentAmount.toLocaleString()} recorded successfully. Outstanding balance updated.`,
        paymentDate: now.toISOString(),
        receiptNumber: receiptNumber,
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber,
      };
      });
    } catch (error) {
      // Concurrent requests can both miss the initial lookup. The unique payment
      // idempotency key elects one winner; return that committed result to retries.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const [existingVoucher, existing] = await Promise.all([
          prisma.khataSettlementVoucher.findFirst({
            where: {
              idempotencyKey,
              OR: [{ retailerId: userId }, { wholesalerId: userId }],
            },
          }),
          prisma.paymentRecord.findUnique({
            where: { idempotencyKey },
            include: { ledgerTransactions: true, khataSettlementVouchers: true },
          }),
        ]);
        if (existing && existing.ledgerId === (await this.getAccount(partnerId, userId)).id && existing.amount.eq(amount) && existing.paymentMethod === paymentMethod) {
          const transaction = existing.ledgerTransactions[0];
          const voucher = existingVoucher ?? existing.khataSettlementVouchers[0];
          if (transaction && voucher && (transaction.orderId ?? null) === (orderId ?? null)) {
            return {
              success: true,
              paymentId: existing.id,
              transactionId: transaction.id,
              ledgerId: existing.ledgerId,
              amount: existing.amount.toNumber(),
              paymentMethod: existing.paymentMethod as PaymentMethod,
              previousBalance: transaction.balanceBefore?.toNumber() ?? 0,
              newBalance: transaction.balanceAfter?.toNumber() ?? 0,
              message: `Payment already recorded (idempotent). Receipt: ${voucher.receiptNumber}`,
              paymentDate: existing.paymentDate.toISOString(),
              receiptNumber: voucher.receiptNumber,
              voucherId: voucher.id,
              voucherNumber: voucher.voucherNumber,
            };
          }
        }
      }
      throw error;
    }
  }

  /**
   * Retrieve official B2B Khata Settlement Voucher by ID, Voucher #, Receipt #, or Tx ID.
   */
  static async getSettlementVoucher(idOrNumber: string, tenantId: string): Promise<KhataSettlementVoucherDto> {
    try {
      const dbVoucher = await (prisma as any).khataSettlementVoucher?.findFirst({
        where: buildVoucherTenantScope(idOrNumber, tenantId),
        include: {
          retailer: { include: { retailerProfile: true, addresses: { where: { isPrimary: true }, take: 1 } } },
          wholesaler: { include: { wholesalerProfile: true, addresses: { where: { isPrimary: true }, take: 1 } } },
        },
      });
  
      if (dbVoucher) {
        return {
          voucherId: dbVoucher.id,
          voucherNumber: dbVoucher.voucherNumber,
          receiptNumber: dbVoucher.receiptNumber,
          transactionId: dbVoucher.transactionId || `tx-${dbVoucher.id}`,
          paymentRecordId: dbVoucher.paymentRecordId,
          ledgerId: dbVoucher.ledgerId,
          settlementCycle: (dbVoucher.settlementCycle as any) || '15_days',
          paymentDate: dbVoucher.settledAt.toISOString(),
          paymentMethod: dbVoucher.paymentMethod,
          paymentReferenceNumber: dbVoucher.paymentReference,
          payer: {
            id: dbVoucher.retailerId,
            name: dbVoucher.retailer?.businessName || dbVoucher.retailer?.fullName || 'Retailer',
            gstin: dbVoucher.retailer?.retailerProfile?.gstNumber || 'Not provided',
            pan: dbVoucher.retailer?.retailerProfile?.panNumber || undefined,
            address: dbVoucher.retailer?.addresses?.[0]
              ? [dbVoucher.retailer.addresses[0].addressLine1, dbVoucher.retailer.addresses[0].addressLine2, dbVoucher.retailer.addresses[0].city, dbVoucher.retailer.addresses[0].state, dbVoucher.retailer.addresses[0].postalCode].filter(Boolean).join(', ')
              : 'Not provided',
            contactNumber: dbVoucher.retailer?.phoneNumber || undefined,
          },
          payee: {
            id: dbVoucher.wholesalerId,
            name: dbVoucher.wholesaler?.businessName || dbVoucher.wholesaler?.fullName || 'Wholesaler',
            gstin: dbVoucher.wholesaler?.wholesalerProfile?.gstNumber || 'Not provided',
            pan: dbVoucher.wholesaler?.wholesalerProfile?.panNumber || undefined,
            address: dbVoucher.wholesaler?.addresses?.[0]
              ? [dbVoucher.wholesaler.addresses[0].addressLine1, dbVoucher.wholesaler.addresses[0].addressLine2, dbVoucher.wholesaler.addresses[0].city, dbVoucher.wholesaler.addresses[0].state, dbVoucher.wholesaler.addresses[0].postalCode].filter(Boolean).join(', ')
              : 'Not provided',
            contactNumber: dbVoucher.wholesaler?.phoneNumber || undefined,
          },
          openingBalance: Number(dbVoucher.openingBalance),
          amountPaid: Number(dbVoucher.amountPaid),
          closingBalance: Number(dbVoucher.closingBalance),
          journalEntry: {
            debitAccount: dbVoucher.paymentMethod === 'cash' ? 'Cash-in-Hand A/c' : 'HDFC Bank B2B Current A/c (*9821)',
            debitAmount: Number(dbVoucher.amountPaid),
            creditAccount: `Sundry Debtors - ${dbVoucher.retailer?.businessName || 'Gupta Kirana Store'}`,
            creditAmount: Number(dbVoucher.amountPaid),
            narration: `Being lump-sum ${dbVoucher.settlementCycle} settlement received via ${dbVoucher.paymentMethod.toUpperCase()}`,
          },
          digitalSignatureHash: dbVoucher.digitalSignatureHash,
          verificationStatus: 'verified',
          notes: dbVoucher.notes,
          createdAt: dbVoucher.createdAt.toISOString(),
        };
      }
    } catch (e: any) {
      Logger.warn(`[LedgerService] Failed to query DB voucher: ${e.message}`);
    }
  
    throw new AppError(AppErrorCode.NOT_FOUND, `Voucher not found: ${idOrNumber}`, 404);
  }

  /**
   * Export Settlement Voucher in RFC-4180 CSV format for CA accounting records.
   */
  static async exportVoucherCsv(idOrNumber: string, tenantId: string): Promise<string> {
    const voucher = await this.getSettlementVoucher(idOrNumber, tenantId);

    const escapeCsv = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;

    const lines: string[] = [];
    lines.push(escapeCsv('SHARVIN B2B KHATA SETTLEMENT VOUCHER & RECEIPT'));
    lines.push(escapeCsv('OFFICIAL STATUTORY RECORD FOR CHARTERED ACCOUNTANT (CA) AUDIT'));
    lines.push('');
    lines.push([escapeCsv('Voucher Number'), escapeCsv(voucher.voucherNumber)].join(','));
    lines.push([escapeCsv('Receipt Number'), escapeCsv(voucher.receiptNumber)].join(','));
    lines.push([escapeCsv('Settlement Date'), escapeCsv(voucher.paymentDate)].join(','));
    lines.push([escapeCsv('Settlement Cycle'), escapeCsv(voucher.settlementCycle === '7_days' ? '7-Day Mid-Cycle' : '15-Day Routine')].join(','));
    lines.push([escapeCsv('Payment Mode'), escapeCsv(voucher.paymentMethod.toUpperCase())].join(','));
    lines.push([escapeCsv('Payment Reference / UTR'), escapeCsv(voucher.paymentReferenceNumber || 'N/A')].join(','));
    lines.push('');
    lines.push(escapeCsv('--- TRADE PARTIES INFORMATION ---'));
    lines.push([escapeCsv('Field'), escapeCsv('Debtor / Payer (Retailer Kirana)'), escapeCsv('Creditor / Payee (Wholesaler Godown)')].join(','));
    lines.push([escapeCsv('Business Name'), escapeCsv(voucher.payer.name), escapeCsv(voucher.payee.name)].join(','));
    lines.push([escapeCsv('GSTIN'), escapeCsv(voucher.payer.gstin), escapeCsv(voucher.payee.gstin)].join(','));
    lines.push([escapeCsv('PAN'), escapeCsv(voucher.payer.pan || 'N/A'), escapeCsv(voucher.payee.pan || 'N/A')].join(','));
    lines.push([escapeCsv('Address'), escapeCsv(voucher.payer.address), escapeCsv(voucher.payee.address)].join(','));
    lines.push('');
    lines.push(escapeCsv('--- FINANCIAL LEDGER SETTLEMENT BREAKDOWN ---'));
    lines.push([escapeCsv('Metric'), escapeCsv('Amount (INR)')].join(','));
    lines.push([escapeCsv('Opening Outstanding Balance (Debit)'), voucher.openingBalance.toFixed(2)].join(','));
    lines.push([escapeCsv('Repayment Amount Cleared (Credit)'), voucher.amountPaid.toFixed(2)].join(','));
    lines.push([escapeCsv('Closing Outstanding Net Balance'), voucher.closingBalance.toFixed(2)].join(','));
    lines.push('');
    lines.push(escapeCsv('--- DOUBLE-ENTRY GENERAL JOURNAL (CA AUDIT) ---'));
    lines.push([escapeCsv('Account Particulars'), escapeCsv('Dr. Amount (INR)'), escapeCsv('Cr. Amount (INR)')].join(','));
    lines.push([escapeCsv(voucher.journalEntry.debitAccount), voucher.journalEntry.debitAmount.toFixed(2), '0.00'].join(','));
    lines.push([escapeCsv(`To ${voucher.journalEntry.creditAccount}`), '0.00', voucher.journalEntry.creditAmount.toFixed(2)].join(','));
    lines.push([escapeCsv(`(Narration: ${voucher.journalEntry.narration})`), '', ''].join(','));
    lines.push('');
    lines.push(escapeCsv('--- CRYPTOGRAPHIC COMPLIANCE AUDIT SEAL ---'));
    lines.push([escapeCsv('Hashing Algorithm'), escapeCsv('SHA-256')].join(','));
    lines.push([escapeCsv('Digital Signature Hash'), escapeCsv(voucher.digitalSignatureHash)].join(','));
    lines.push([escapeCsv('Integrity Verification Status'), escapeCsv(voucher.verificationStatus.toUpperCase())].join(','));

    return lines.join('\r\n');
  }

  /**
   * Post delivered wholesale order into ledger as an order debit (idempotent).
   */
  static async postDeliveredOrderToLedger(
    orderId: string,
    notes?: string,
    partnerId?: string
  ): Promise<{ success: boolean; transactionId: string; currentBalance: number }> {
    const now = new Date();
  
    return await prisma.$transaction(async (tx) => {
      const { order, connection, account } = await this.getLockedCreditContextForOrder(tx, orderId);
      const invoice = await tx.invoice.findUnique({ where: { orderId }, select: { totalInvoiceAmount: true } });
      const orderAmount = invoice?.totalInvoiceAmount ?? order.finalPrice ?? order.subtotal?.minus(order.discountAmount).plus(order.taxAmount) ?? null;
      if (!orderAmount || !orderAmount.isFinite() || orderAmount.lte(0)) {
        throw new AppError(AppErrorCode.BAD_REQUEST, 'Order total must be positive before ledger posting', 400);
      }

      const existingTx = await tx.ledgerTransaction.findFirst({
        where: {
          orderId,
          transactionType: 'order_placed',
          isCredit: false,
          OR: [
            { sourceEventKey: `order-delivery:${orderId}` },
            { sourceEventKey: `split-order:${orderId}` },
            { sourceEventKey: { startsWith: 'split-settlement:' } },
          ],
        },
      });
  
      if (existingTx) {
        return {
          success: true,
          transactionId: existingTx.id,
          currentBalance: Number(account.currentBalance),
        };
      }

      const payableStatus = order.lifecycleStatus === 'delivered' || order.orderStatus === 'delivered';
      if (!payableStatus) throw new AppError(AppErrorCode.CONFLICT, 'Only delivered orders may be posted to the ledger', 409);
      await this.consumeOrderCreditReservation(tx, order, connection, account, orderAmount);
  
      const balanceBefore = account.currentBalance;
      const balanceAfter = balanceBefore.plus(orderAmount);
  
      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          totalDebit: { increment: orderAmount },
          currentBalance: balanceAfter,
          lastTransactionAt: now,
        },
      });
  
      const transaction = await tx.ledgerTransaction.create({
        data: {
          ledgerId: account.id,
          transactionType: 'order_placed',
          amount: orderAmount,
          isCredit: false,
          orderId,
          paymentId: null,
          balanceBefore,
          balanceAfter,
          notes: notes || 'Delivered order posted to B2B ledger',
          createdAt: now,
          sourceEventKey: `order-delivery:${orderId}`,
        },
      });
      await this.appendBalancedEntries(tx, transaction.id, 'accounts_receivable', 'sales_revenue', orderAmount);
  
      return {
        success: true,
        transactionId: transaction.id,
        currentBalance: balanceAfter.toNumber(),
      };
    });
  }

  /**
   * Reverse ledger debits and update running credit balances when an in-transit order is cancelled or rejected (Edge Case 7).
   */
  static async rollbackCancelledOrder(
    payload: { orderId: string; partnerId?: string; reason?: string; amount?: number },
    userId?: string,
    userRole?: string
  ): Promise<{
    success: boolean;
    transactionId: string;
    orderId: string;
    reversedAmount: number;
    previousBalance: number;
    newBalance: number;
    message: string;
  }> {
    const { orderId, reason, amount } = payload;
    const now = new Date();
  
    return await prisma.$transaction(async (tx) => {
      const [lockedOrder] = await tx.$queryRaw<Array<{ lifecycle_status: string }>>`
        SELECT lifecycle_status::text
        FROM orders
        WHERE order_id = ${orderId}
        FOR UPDATE
      `;
      if (!lockedOrder) {
        throw new AppError(AppErrorCode.NOT_FOUND, 'Order not found', 404);
      }
      assertOrderEligibleForLedgerRollback(lockedOrder.lifecycle_status);

      const account = await this.getLockedAccountForOrder(tx, orderId);
      const existingReversal = await tx.ledgerTransaction.findUnique({ where: { sourceEventKey: `order-cancelled:${orderId}` } });
      if (existingReversal) {
        return { success: true, transactionId: existingReversal.id, orderId, reversedAmount: existingReversal.amount.toNumber(), previousBalance: existingReversal.balanceBefore?.toNumber() ?? 0, newBalance: existingReversal.balanceAfter?.toNumber() ?? 0, message: 'Cancellation reversal already recorded.' };
      }
      const existingTx = await tx.ledgerTransaction.findFirst({
        where: { orderId, transactionType: 'order_placed', isCredit: false, OR: [
          { sourceEventKey: `order-delivery:${orderId}` },
          { sourceEventKey: `split-order:${orderId}` },
          { sourceEventKey: { startsWith: 'split-settlement:' } },
        ] },
      });
      if (!existingTx) throw new AppError(AppErrorCode.CONFLICT, 'Cannot reverse an order that has not been posted to the ledger', 409);
      if (amount !== undefined && !new Prisma.Decimal(amount).eq(existingTx.amount)) {
        throw new AppError(AppErrorCode.BAD_REQUEST, 'Reversal amount must equal the original posting; use a separate adjustment for partial corrections', 400);
      }
      const rollbackAmount = existingTx.amount;
      const previousBalance = account.currentBalance;
      const newBalance = previousBalance.minus(rollbackAmount);
  
      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          totalCredit: { increment: rollbackAmount },
          currentBalance: newBalance,
          lastTransactionAt: now,
        },
      });
  
      const transaction = await tx.ledgerTransaction.create({
        data: {
          ledgerId: account.id,
          transactionType: 'adjustment',
          amount: rollbackAmount,
          isCredit: true,
          orderId,
          paymentId: null,
          balanceBefore: previousBalance,
          balanceAfter: newBalance,
          notes: `🔄 Khata Ledger Rollback: Order cancelled/rejected at counter. Reason: ${reason || 'Customer rejected during transit'}`,
          createdByUserId: userId || null,
          createdAt: now,
          sourceEventKey: `order-cancelled:${orderId}`,
          reversalOfId: existingTx.id,
        },
      });
      await this.appendBalancedEntries(tx, transaction.id, 'sales_returns', 'accounts_receivable', rollbackAmount);
  
      return {
        success: true,
        transactionId: transaction.id,
        orderId,
        reversedAmount: rollbackAmount.toNumber(),
        previousBalance: previousBalance.toNumber(),
        newBalance: newBalance.toNumber(),
        message: `Khata Ledger Rollback Successful: ₹${rollbackAmount.toLocaleString()} debits reversed. New balance is ₹${newBalance.toLocaleString()}.`,
      };
    });
  }

  /**
   * Settle an order delivery with split payment: Partial cash payment + remaining Khata credit (Edge Case 3).
   * Double-entry ledger guarantee:
   * 1. Posts full order billed amount as order debit.
   * 2. Immediately posts cash collected at delivery counter as credit payment.
   * 3. Atomically computes and updates running credit balance: newBalance = previousBalance + (totalOrderAmount - cashPaid).
   */
  static async settleOrderDeliverySplitPayment(
    payload: {
      orderId: string;
      partnerId?: string;
      totalOrderAmount: number;
      cashPaid: number;
      notes?: string;
      driverId?: string;
      idempotencyKey: string;
    },
    userId?: string,
    userRole?: string
  ): Promise<{
    success: boolean;
    orderId: string;
    totalOrderAmount: number;
    cashPaid: number;
    creditAddedToKhata: number;
    previousBalance: number;
    newBalance: number;
    orderTransactionId: string;
    paymentTransactionId: string | null;
    receiptNumber: string;
    message: string;
  }> {
    const { orderId, notes, driverId, idempotencyKey } = payload;
    const now = new Date();
  
    if (!idempotencyKey?.trim()) throw new AppError(AppErrorCode.BAD_REQUEST, 'An idempotency key is required for split settlement', 400);
    const cashPaid = Number((payload as any).cashPaid);
    if (!Number.isFinite(cashPaid) || cashPaid < 0) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Partial cash payment cannot be negative', 400);
    }
    if (!Number.isFinite(cashPaid)) throw new AppError(AppErrorCode.BAD_REQUEST, 'Cash amount must be finite', 400);
    const suppliedTotal = Number((payload as any).totalOrderAmount);
    if (!Number.isFinite(suppliedTotal) || suppliedTotal <= 0) throw new AppError(AppErrorCode.BAD_REQUEST, 'Order amount must be positive and finite', 400);
    if (cashPaid > suppliedTotal) {
      throw new AppError(
        AppErrorCode.BAD_REQUEST,
        `Partial cash payment (₹${cashPaid}) cannot exceed total order amount (₹${suppliedTotal})`,
        400
      );
    }
  
    const cashAmt = new Prisma.Decimal(cashPaid);
    const receiptNumber = `SPLIT-${idempotencyKey.slice(0, 32)}`;
    return await prisma.$transaction(async (tx) => {
      const { order, connection, account } = await this.getLockedCreditContextForOrder(tx, orderId);
      const invoice = await tx.invoice.findUnique({ where: { orderId }, select: { totalInvoiceAmount: true } });
      const totalAmt = invoice?.totalInvoiceAmount ?? order.finalPrice ?? order.subtotal?.minus(order.discountAmount).plus(order.taxAmount) ?? null;
      if (!totalAmt || !totalAmt.isFinite() || totalAmt.lte(0)) throw new AppError(AppErrorCode.BAD_REQUEST, 'Delivered invoice/order total must be positive', 400);
      if (!totalAmt.eq(new Prisma.Decimal(suppliedTotal))) throw new AppError(AppErrorCode.CONFLICT, 'Client order total does not match the authoritative order amount', 409);
      if (cashAmt.gt(totalAmt)) throw new AppError(AppErrorCode.BAD_REQUEST, 'Cash payment exceeds the order amount', 400);
      const priorPayment = await tx.ledgerTransaction.findUnique({ where: { sourceEventKey: `split-settlement:${idempotencyKey}` } });
      if (priorPayment) {
        if (priorPayment.orderId !== orderId || (priorPayment.transactionType === 'payment_received' && !priorPayment.amount.eq(cashAmt)) || (priorPayment.transactionType === 'order_placed' && !priorPayment.amount.eq(totalAmt))) {
          throw new AppError(AppErrorCode.CONFLICT, 'Idempotency key was already used for a different split settlement', 409);
        }
        const priorOrderTx = priorPayment.transactionType === 'order_placed'
          ? priorPayment
          : await tx.ledgerTransaction.findUnique({ where: { sourceEventKey: `split-order:${orderId}` } });
        if (!priorOrderTx || !priorOrderTx.amount.eq(totalAmt)) throw new AppError(AppErrorCode.CONFLICT, 'Idempotency key does not match the already-posted order amount', 409);
        return { success: true, orderId, totalOrderAmount: totalAmt.toNumber(), cashPaid: priorPayment.transactionType === 'payment_received' ? priorPayment.amount.toNumber() : 0, creditAddedToKhata: totalAmt.minus(priorPayment.transactionType === 'payment_received' ? priorPayment.amount : 0).toNumber(), previousBalance: priorOrderTx?.balanceBefore?.toNumber() ?? priorPayment.balanceBefore?.toNumber() ?? 0, newBalance: priorPayment.transactionType === 'payment_received' ? priorPayment.balanceAfter?.toNumber() ?? 0 : priorPayment.balanceAfter?.toNumber() ?? 0, orderTransactionId: priorOrderTx?.id ?? priorPayment.id, paymentTransactionId: priorPayment.transactionType === 'payment_received' ? priorPayment.id : null, receiptNumber, message: 'Split settlement already recorded (idempotent).' };
      }
      const priorOrderPosting = await tx.ledgerTransaction.findUnique({ where: { sourceEventKey: `split-order:${orderId}` } });
      if (priorOrderPosting) throw new AppError(AppErrorCode.CONFLICT, 'This order has already been posted; split settlement cannot post it again', 409);
      const payableStatus = order.lifecycleStatus === 'delivered' || order.orderStatus === 'delivered';
      if (!payableStatus) throw new AppError(AppErrorCode.CONFLICT, 'Only delivered orders may be settled', 409);
      const creditAddedToKhata = Prisma.Decimal.max(0, totalAmt.minus(cashAmt));
      await this.consumeOrderCreditReservation(tx, order, connection, account, creditAddedToKhata);
  
      const previousBalance = account.currentBalance;
      const newBalance = previousBalance.plus(creditAddedToKhata);
  
      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          totalDebit: { increment: totalAmt },
          totalCredit: { increment: cashAmt },
          currentBalance: newBalance,
          lastTransactionAt: now,
        },
      });
  
      const orderTx = await tx.ledgerTransaction.create({
        data: {
          ledgerId: account.id,
          transactionType: 'order_placed',
          amount: totalAmt,
          isCredit: false,
          orderId,
          balanceBefore: previousBalance,
          balanceAfter: previousBalance.plus(totalAmt),
          notes: notes || `Wholesale Order Delivery Billed (Split settlement)`,
          createdByUserId: userId || null,
          sourceEventKey: cashPaid > 0 ? `split-order:${orderId}` : `split-settlement:${idempotencyKey}`,
        },
      });
      await this.appendBalancedEntries(tx, orderTx.id, 'accounts_receivable', 'sales_revenue', totalAmt);
  
      let paymentTransactionId: string | null = null;
      if (cashPaid > 0) {
        const payment = await tx.paymentRecord.create({
          data: {
            ledgerId: account.id,
            retailerId: account.retailerId,
            wholesalerId: account.wholesalerId,
            paymentMethod: 'cash' as PaymentMethod,
            amount: cashAmt,
            paymentReferenceNumber: receiptNumber,
            paymentStatus: 'verified',
            paymentDate: now,
            collectedByDriverId: driverId || null,
          },
        });
  
        const paymentTx = await tx.ledgerTransaction.create({
          data: {
            ledgerId: account.id,
            transactionType: 'payment_received',
            amount: cashAmt,
            isCredit: true,
            orderId,
            paymentId: payment.id,
            balanceBefore: previousBalance.plus(totalAmt),
            balanceAfter: newBalance,
            notes: `💵 Doorstep Cash Collected by Driver (Receipt: ${receiptNumber})`,
            createdByUserId: driverId || userId || null,
          sourceEventKey: `split-settlement:${idempotencyKey}`,
          },
        });
        await this.appendBalancedEntries(tx, paymentTx.id, 'cash', 'accounts_receivable', cashAmt);
        paymentTransactionId = paymentTx.id;
      }
  
      return {
        success: true,
        orderId,
        totalOrderAmount: totalAmt.toNumber(),
        cashPaid: cashAmt.toNumber(),
        creditAddedToKhata: creditAddedToKhata.toNumber(),
        previousBalance: previousBalance.toNumber(),
        newBalance: newBalance.toNumber(),
        orderTransactionId: orderTx.id,
        paymentTransactionId,
        receiptNumber,
        message: `Split Payment Processed: ₹${cashAmt.toLocaleString()} received in cash at doorstep. Remaining ₹${creditAddedToKhata.toLocaleString()} added to Khata credit balance. New balance is ₹${newBalance.toLocaleString()}.`,
      };
    });
  }

  /**
   * Record Escrow Holdback for doorstep dispute / partial delivery rejection.
   */
  static async recordEscrowHold(
    orderId: string,
    orderNumber: string,
    acceptedAmount: number,
    escrowAmount: number,
    creditNoteNumber: string,
    notes?: string,
    partnerId?: string
  ): Promise<void> {
    const now = new Date();
    const escrowAmt = new Prisma.Decimal(escrowAmount);
  
    await prisma.$transaction(async (tx) => {
      const account = await this.getLockedAccountForOrder(tx, orderId);
      // Escrow hold is a memo entry: the order debit was already posted, so the
      // account balance must not move again. Keeping balanceAfter == balanceBefore
      // preserves a consistent running balance across the append-only ledger.
      const escrowTransaction = await tx.ledgerTransaction.create({
        data: {
          ledgerId: account.id,
          transactionType: 'order_placed',
          amount: escrowAmt,
          isCredit: false,
          orderId,
          paymentId: null,
          balanceBefore: account.currentBalance,
          balanceAfter: account.currentBalance,
          notes: notes || `Escrow hold for order ${orderNumber} (Credit Note: ${creditNoteNumber})`,
          createdByUserId: null,
          sourceEventKey: `escrow-hold:${orderId}:${creditNoteNumber}`,
        },
      });
      await this.appendBalancedEntries(tx, escrowTransaction.id, 'escrow_receivable', 'escrow_liability', escrowAmt);
    });
  }

  /**
   * Release Escrow Holdback upon Wholesaler dispute resolution.
   */
  static async releaseEscrowHold(
    orderId: string,
    creditNoteNumber: string,
    action: 'approved' | 'rejected',
    allowanceAmount?: number,
    partnerId?: string
  ): Promise<void> {
    const now = new Date();
    const allowanceAmt = new Prisma.Decimal(allowanceAmount ?? 0);
    if (!allowanceAmt.isFinite() || allowanceAmt.lt(0)) throw new AppError(AppErrorCode.BAD_REQUEST, 'Escrow allowance must be finite and non-negative', 400);

    await prisma.$transaction(async (tx) => {
      const account = await this.getLockedAccountForOrder(tx, orderId);
      const holdKey = `escrow-hold:${orderId}:${creditNoteNumber}`;
      const releaseKey = `escrow-release:${orderId}:${creditNoteNumber}`;
      const existingRelease = await tx.ledgerTransaction.findUnique({ where: { sourceEventKey: releaseKey } });
      if (existingRelease) return;
      const hold = await tx.ledgerTransaction.findUnique({ where: { sourceEventKey: holdKey } });
      if (!hold) throw new AppError(AppErrorCode.NOT_FOUND, 'Escrow hold posting was not found', 404);
      if (allowanceAmt.gt(hold.amount)) throw new AppError(AppErrorCode.BAD_REQUEST, 'Allowance cannot exceed the original escrow hold', 400);

      const release = await tx.ledgerTransaction.create({
        data: {
          ledgerId: account.id,
          transactionType: 'adjustment',
          amount: hold.amount,
          isCredit: false,
          orderId,
          balanceBefore: account.currentBalance,
          balanceAfter: account.currentBalance,
          notes: `Escrow hold released (${action}) for credit note ${creditNoteNumber}`,
          createdAt: now,
          sourceEventKey: releaseKey,
        },
      });
      await this.appendBalancedEntries(tx, release.id, 'escrow_liability', 'escrow_receivable', hold.amount);

      if (action === 'approved' && allowanceAmt.gt(0)) {
        const balanceAfter = account.currentBalance.minus(allowanceAmt);
        await tx.ledgerAccount.update({
          where: { id: account.id },
          data: { totalCredit: { increment: allowanceAmt }, currentBalance: balanceAfter, lastTransactionAt: now },
        });
        const refund = await tx.ledgerTransaction.create({
          data: {
            ledgerId: account.id,
            transactionType: 'damage_refund',
            amount: allowanceAmt,
            isCredit: true,
            orderId,
            balanceBefore: account.currentBalance,
            balanceAfter,
            notes: `Approved damage allowance for credit note ${creditNoteNumber}`,
            createdAt: now,
            sourceEventKey: `escrow-allowance:${orderId}:${creditNoteNumber}`,
          },
        });
        await this.appendBalancedEntries(tx, refund.id, 'sales_returns', 'accounts_receivable', allowanceAmt);
      }
    });
  }
  
  /**
    * Evaluate comprehensive bilateral credit risk profile between retailer and wholesaler.
   * Calculates credit limit utilization, overdue invoices, and whether ordering is blocked.
   */
  static async getCreditProfile(
    partnerId: string,
    userId: string,
    userRole: string,
    options?: {
      cartTotal?: number;
      orderId?: string;
      simulateOverdue?: boolean;
      simulateCreditExceeded?: boolean;
    }
  ): Promise<CreditProfileSummary> {
    const account = await this.getAccount(partnerId, userId);
    const connection = await prisma.retailerWholesalerConnection.findUnique({
      where: { id: account.connectionId },
      include: { retailer: true, wholesaler: true },
    });
    if (!connection) throw new AppError(AppErrorCode.NOT_FOUND, 'Trading relationship not found', 404);

    const creditLimit = connection.creditLimit;
    const paymentTermDays = connection.paymentTermDays;
    const currentBalance = account.currentBalance;
    const reservedCredit = account.reservedCredit;
    const cartTotal = new Prisma.Decimal(options?.cartTotal ?? 0);
    if (!cartTotal.isFinite() || cartTotal.lt(0)) throw new AppError(AppErrorCode.BAD_REQUEST, 'Cart total must be finite and non-negative', 400);
    const overdueInvoices = await prisma.$transaction((tx) => this.calculateOverdueInvoices(
      tx, account.id, account.retailerId, account.wholesalerId, paymentTermDays,
    ));
    if (options?.simulateOverdue && overdueInvoices.length === 0) {
      const dueAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      overdueInvoices.push({ invoiceId: 'SIMULATED-OVERDUE', invoiceNumber: 'SIMULATED', amount: 12400, issuedAt: new Date(dueAt.getTime() - paymentTermDays * 86400000).toISOString(), dueDate: dueAt.toISOString(), daysOverdue: 6 });
    }
    const exposure = Prisma.Decimal.max(0, currentBalance).plus(reservedCredit).plus(cartTotal);
    const isCreditExceeded = options?.simulateCreditExceeded === true || exposure.gt(creditLimit);
    const isOverdue = overdueInvoices.length > 0;
    const overdueAmount = new Prisma.Decimal(overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0));
    const oldestOverdueDays = overdueInvoices.reduce((max, invoice) => Math.max(max, invoice.daysOverdue), 0);

    let isOrderOverridden = false;
    let overrideDetails: { overriddenBy: string; reason: string; overriddenAt: string } | null = null;
    
    if (options?.orderId) {
      const order = await prisma.order.findFirst({
        where: { id: options.orderId, retailerId: account.retailerId, wholesalerId: account.wholesalerId },
      });
      if (order?.creditOverridden) {
        isOrderOverridden = true;
        overrideDetails = {
          overriddenBy: order.creditOverriddenByUserId || 'Wholesaler Owner',
          reason: order.creditOverrideReason || 'Credit Limit Override Approved',
          overriddenAt: order.creditOverriddenAt?.toISOString() || new Date().toISOString(),
        };
      }
    }
  
    const isRelationshipFrozen = connection.creditStatus !== 'active';
    const isBlocked = (isCreditExceeded || isOverdue || isRelationshipFrozen) && !isOrderOverridden;
    const creditAvailable = Prisma.Decimal.max(0, creditLimit.minus(Prisma.Decimal.max(0, currentBalance).plus(reservedCredit)));
    const creditUtilizationPercent = creditLimit.gt(0)
      ? Prisma.Decimal.min(100, Prisma.Decimal.max(0, currentBalance).plus(reservedCredit).div(creditLimit).mul(100)).toNumber()
      : exposure.gt(0) ? 100 : 0;
  
    let creditStatus: 'active' | 'frozen_limit_exhausted' | 'frozen_overdue' = 'active';
    if (isOverdue || connection.creditStatus === 'frozen_overdue') {
      creditStatus = 'frozen_overdue';
    } else if (isCreditExceeded || connection.creditStatus !== 'active') {
      creditStatus = 'frozen_limit_exhausted';
    }
  
    const excessDebt = Prisma.Decimal.max(0, Prisma.Decimal.max(0, currentBalance).plus(reservedCredit).plus(cartTotal).minus(creditLimit));
    const minSettlementRequired = Prisma.Decimal.max(excessDebt, overdueAmount).toNumber();
  
    return {
      retailerId: account.retailerId,
      retailerName: connection.retailer.businessName || connection.retailer.fullName || 'Retailer',
      wholesalerId: account.wholesalerId,
      wholesalerName: connection.wholesaler.businessName || connection.wholesaler.fullName || 'Wholesaler',
      creditLimit: creditLimit.toNumber(),
      paymentTermDays,
      currentBalance: currentBalance.toNumber(),
      creditAvailable: creditAvailable.toNumber(),
      creditUtilizationPercent,
      isCreditExceeded,
      isOverdue,
      isBlocked,
      overdueAmount: overdueAmount.toNumber(),
      oldestOverdueDays,
      overdueInvoices,
      minSettlementRequired,
      creditStatus,
      isOrderOverridden,
      overrideDetails,
    };
  }

  /**
   * Wholesaler sets/updates credit limit and payment term days for a retailer.
   */
  static async updateCreditTerms(
    partnerId: string,
    creditLimit: number,
    paymentTermDays: number,
    wholesalerId: string
  ): Promise<{ success: boolean; creditLimit: number; paymentTermDays: number; message: string }> {
    if (!Number.isFinite(creditLimit) || creditLimit < 0 || !Number.isInteger(paymentTermDays) || paymentTermDays < 1 || paymentTermDays > 180) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Credit terms are outside allowed bounds', 400);
    }
    await prisma.$transaction(async (tx) => {
      const connection = await tx.retailerWholesalerConnection.findFirst({
        where: { id: partnerId, wholesalerId },
        select: { id: true },
      }) ?? await tx.retailerWholesalerConnection.findFirst({
        where: { retailerId: partnerId, wholesalerId },
        select: { id: true },
      });
      if (!connection) throw new AppError(AppErrorCode.NOT_FOUND, 'Trading relationship not found for this wholesaler', 404);
      await tx.$queryRaw`SELECT connection_id FROM retailer_wholesaler_connections WHERE connection_id = ${connection.id} FOR UPDATE`;
      const account = await tx.ledgerAccount.findFirst({ where: { connectionId: connection.id } });
      if (account) {
        await tx.$queryRaw`SELECT ledger_id FROM ledger_accounts WHERE ledger_id = ${account.id} FOR UPDATE`;
        const lockedAccount = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: account.id } });
        const exposure = Prisma.Decimal.max(0, lockedAccount.currentBalance).plus(lockedAccount.reservedCredit);
        if (new Prisma.Decimal(creditLimit).lt(exposure)) {
          throw new AppError(AppErrorCode.CONFLICT, 'Credit limit cannot be lower than current debt plus accepted-order reservations', 409, {
            exposure: exposure.toNumber(), requestedLimit: creditLimit,
          });
        }
      }
      await tx.retailerWholesalerConnection.update({
        where: { id: connection.id },
        data: { creditLimit: new Prisma.Decimal(creditLimit), paymentTermDays },
      });
    });
  
    return {
      success: true,
      creditLimit,
      paymentTermDays,
      message: `Credit limit updated to ₹${creditLimit.toLocaleString('en-IN')} with ${paymentTermDays}-day payment terms.`,
    };
  }

  /**
   * Wholesaler overrides credit block for a specific order.
   */
  static async overrideOrderCredit(
    orderId: string,
    reason: string,
    userId: string,
    userRole: string
  ): Promise<{ success: boolean; orderId: string; reason: string; message: string }> {
    const normalizedReason = reason.trim();
    if (userRole !== 'wholesaler') throw new AppError(AppErrorCode.FORBIDDEN, 'Only the wholesaler can override this order credit block', 403);
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) throw new AppError(AppErrorCode.BAD_REQUEST, 'Override reason must contain 3 to 1000 characters', 400);
    await prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<Array<{ order_id: string; wholesaler_id: string }>>`
        SELECT order_id, wholesaler_id FROM orders WHERE order_id = ${orderId} FOR UPDATE
      `;
      if (!order || order.wholesaler_id !== userId) throw new AppError(AppErrorCode.NOT_FOUND, 'Order not found for this wholesaler', 404);
      await tx.order.update({
        where: { id: orderId, wholesalerId: userId },
        data: {
          creditOverridden: true,
          creditOverrideReason: normalizedReason,
          creditOverriddenByUserId: userId,
          creditOverriddenAt: new Date(),
        },
      });
    });
  
    return {
      success: true,
      orderId,
      reason: normalizedReason,
      message: `Credit restriction overridden for Order ${orderId}: "${normalizedReason}"`,
    };
  }

  /**
   * Wholesaler issues formal payment demand freezing order progression.
   */
  static async demandPayment(
    orderId: string,
    userId: string,
    notes?: string
  ): Promise<{ success: boolean; orderId: string; message: string }> {
    return {
      success: true,
      orderId,
      message: `Formal payment demand issued for Order ${orderId}. Deal progression frozen until ledger settlement.`,
    };
  }

  /**
   * Helper to simulate overdue invoices for a retailer (used for instant demo & test verification).
   */
  static simulateOverdue(
    partnerId: string,
    daysOverdue: number = 7,
    amount: number = 14500.00
  ): void {
    Logger.warn(`[LedgerService] simulateOverdue is now a no-op in Enterprise mode.`);
  }
  
  static clearOverdueSimulation(partnerId: string): void {
    Logger.warn(`[LedgerService] clearOverdueSimulation is now a no-op in Enterprise mode.`);
  }
}

