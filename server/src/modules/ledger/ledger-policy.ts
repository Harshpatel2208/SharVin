import { AppError, AppErrorCode } from '../../utils/app-error';

/** Only the creditor side may attest that funds were received and finalize a payment. */
export function assertCanFinalizeLedgerPayment(userRole: string): void {
  if (userRole !== 'wholesaler') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'Only the receiving wholesaler can verify and post a ledger payment',
      403,
    );
  }
}

export function assertOrderEligibleForLedgerRollback(lifecycleStatus: string | undefined): void {
  if (lifecycleStatus !== 'cancelled' && lifecycleStatus !== 'rejected') {
    throw new AppError(
      AppErrorCode.CONFLICT,
      'Ledger reversal is allowed only after the order is cancelled or rejected',
      409,
    );
  }
}

export function buildVoucherTenantScope(idOrNumber: string, tenantId: string) {
  return {
    AND: [
      {
        OR: [
          { id: idOrNumber },
          { voucherNumber: idOrNumber },
          { receiptNumber: idOrNumber },
          { transactionId: idOrNumber },
        ],
      },
      { OR: [{ retailerId: tenantId }, { wholesalerId: tenantId }] },
    ],
  };
}
