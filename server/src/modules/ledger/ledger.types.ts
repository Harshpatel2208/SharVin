import { PaymentMethod, PaymentStatus, LedgerTransactionType } from '@prisma/client';

export interface LedgerAccountSummary {
  ledgerId: string;
  retailerId: string;
  retailerName: string;
  wholesalerId: string;
  wholesalerName: string;
  totalDebit: number;       // Total orders billed to retailer
  totalCredit: number;      // Total payments received from retailer
  currentBalance: number;   // Outstanding balance owed by retailer (totalDebit - totalCredit)
  reservedCredit: number;   // Exposure reserved by accepted, not-yet-delivered orders
  creditLimit: number;      // Maximum credit allowed (e.g., ₹50,000)
  creditAvailable: number;  // Remaining credit before hitting limit
  creditUtilizationPercent: number; // Percentage of credit used
  paymentTermsDays: number; // e.g., 15 days
  dueDate?: string | null;  // Next scheduled payment due date
  status: 'healthy' | 'approaching_limit' | 'limit_exceeded';
  escrowDisputeHold?: number; // Total funds currently locked in doorstep dispute escrow hold
  lastTransactionAt?: string | null;
}

export interface LedgerTransactionDto {
  transactionId: string;
  ledgerId: string;
  transactionType: LedgerTransactionType;
  amount: number;
  isCredit: boolean;        // true: payment received / refund, false: order billed / debit
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
  partnerId: string;        // The other business party ID (wholesaler or retailer)
  amount: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string; // Stable client-generated key; required for financial posting
  paymentReferenceNumber?: string;
  settlementCycle?: '7_days' | '15_days' | 'on_demand';
  orderId?: string;
  notes?: string;
  collectedByDriverId?: string;
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
  voucherId: string;
  voucherNumber: string;
}

export interface PostOrderToLedgerPayload {
  orderId: string;
  notes?: string;
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

export interface UpdateCreditTermsPayload {
  partnerId: string;
  creditLimit: number;
  paymentTermDays: number;
}

export interface CreditOverridePayload {
  orderId: string;
  reason: string;
}

export interface DemandPaymentPayload {
  orderId: string;
  notes?: string;
}
