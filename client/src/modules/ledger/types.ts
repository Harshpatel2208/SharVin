export type PaymentMethod = 'cash' | 'bank_transfer' | 'upi' | 'cheque';

export type LedgerTransactionType = 'order_placed' | 'payment_received' | 'damage_refund' | 'adjustment';

export interface LedgerAccountSummary {
  ledgerId: string;
  retailerId: string;
  retailerName: string;
  wholesalerId: string;
  wholesalerName: string;
  totalDebit: number;
  totalCredit: number;
  currentBalance: number;
  reservedCredit: number;
  creditLimit: number;
  creditAvailable: number;
  creditUtilizationPercent: number;
  paymentTermsDays: number;
  dueDate?: string | null;
  status: 'healthy' | 'approaching_limit' | 'limit_exceeded';
  lastTransactionAt?: string | null;
}

export interface LedgerTransactionDto {
  transactionId: string;
  ledgerId: string;
  transactionType: LedgerTransactionType;
  amount: number;
  isCredit: boolean;
  orderId?: string | null;
  orderNumber?: string | null;
  paymentId?: string | null;
  paymentMethod?: PaymentMethod | null;
  balanceBefore: number;
  balanceAfter: number;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface KhataSettlementParty {
  id: string;
  name: string;
  gstin: string;
  pan?: string;
  address: string;
  contactNumber?: string;
}

export interface DoubleEntryJournal {
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  narration: string;
}

export interface KhataSettlementVoucherDto {
  voucherId: string;
  voucherNumber: string;
  receiptNumber: string;
  transactionId: string;
  paymentRecordId?: string | null;
  ledgerId: string;
  settlementCycle: '7_days' | '15_days' | 'on_demand';
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paymentReferenceNumber?: string | null;
  payer: KhataSettlementParty;
  payee: KhataSettlementParty;
  openingBalance: number;
  amountPaid: number;
  closingBalance: number;
  journalEntry: DoubleEntryJournal;
  digitalSignatureHash: string;
  verificationStatus: 'verified' | 'tamper_detected';
  notes?: string | null;
  createdAt: string;
}

export interface RecordPaymentPayload {
  partnerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  paymentReferenceNumber?: string;
  settlementCycle?: '7_days' | '15_days' | 'on_demand';
  orderId?: string;
  notes?: string;
}

export interface RecordPaymentResult {
  success: boolean;
  paymentId: string;
  transactionId: string;
  ledgerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  previousBalance: number;
  newBalance: number;
  message: string;
  paymentDate: string;
  receiptNumber: string;
  voucherId?: string;
  voucherNumber?: string;
}

export interface OverdueInvoiceSummary {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  issuedAt: string;
  dueDate: string;
  daysOverdue: number;
}

export interface CreditProfileSummary {
  retailerId: string;
  retailerName: string;
  wholesalerId: string;
  wholesalerName: string;
  creditLimit: number;
  paymentTermDays: number;
  currentBalance: number;
  creditAvailable: number;
  creditUtilizationPercent: number;
  isCreditExceeded: boolean;
  isOverdue: boolean;
  isBlocked: boolean;
  overdueAmount: number;
  oldestOverdueDays: number;
  overdueInvoices: OverdueInvoiceSummary[];
  minSettlementRequired: number;
  creditStatus: 'active' | 'frozen_limit_exhausted' | 'frozen_overdue';
  isOrderOverridden?: boolean;
  overrideDetails?: {
    overriddenBy: string;
    reason: string;
    overriddenAt: string;
  } | null;
}
