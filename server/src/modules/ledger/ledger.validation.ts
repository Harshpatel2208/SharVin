import { z } from 'zod';

export const recordPaymentSchema = z.object({
  partnerId: z.string().min(1, 'Partner ID is required'),
  amount: z.number().positive('Payment amount must be greater than zero'),
  idempotencyKey: z.string().trim().min(8).max(128),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'upi', 'cheque'] as const),
  paymentReferenceNumber: z.string().optional(),
  settlementCycle: z.enum(['7_days', '15_days', 'on_demand']).optional(),
  orderId: z.string().optional(),
  notes: z.string().optional(),
  collectedByDriverId: z.string().optional(),
});

export const splitSettlementSchema = z.object({
  totalOrderAmount: z.number().positive(),
  cashPaid: z.number().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(128),
  partnerId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  driverId: z.string().optional(),
});

export const postOrderSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  notes: z.string().optional(),
});

export const updateCreditTermsSchema = z.object({
  partnerId: z.string().min(1, 'Partner ID is required'),
  creditLimit: z.number().min(0, 'Credit limit must be at least 0'),
  paymentTermDays: z.number().int().min(1, 'Payment terms must be at least 1 day').max(180, 'Payment terms cannot exceed 180 days'),
});

export const creditOverrideSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  reason: z.string().min(3, 'Override reason must be at least 3 characters'),
});

export const demandPaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  notes: z.string().optional(),
});

