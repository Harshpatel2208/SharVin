import { z } from 'zod';

export const joinOrderSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
});

export const leaveOrderSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
});

export const sendMessageSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
  messageText: z.string().min(1, { message: 'Message cannot be empty' }).max(2000, { message: 'Message cannot exceed 2000 characters' }),
  messageType: z.enum(['text', 'image', 'file', 'product_broadcast', 'system']).default('text'),
  fileAttachments: z.any().optional(),
});

export const typingSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
});

export const lineItemRateProposalSchema = z.object({
  orderItemId: z.string().min(1, { message: 'orderItemId is required' }),
  proposedUnitPrice: z.number().positive({ message: 'Proposed unit price must be strictly greater than 0' }),
  proposedQuantity: z.number().int().positive({ message: 'Proposed quantity must be greater than 0' }).optional(),
  reason: z.string().max(300).optional(),
});

export const proposeRateSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
  items: z.array(lineItemRateProposalSchema).min(1, { message: 'At least one item rate proposal is required' }),
  proposedDiscountPercent: z.number().min(0).max(50).optional(),
  clientVersion: z.number().int().nonnegative().optional(),
  isFinalOffer: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export const confirmRateSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
  clientVersion: z.number().int().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
});

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

export type JoinOrderInput = z.infer<typeof joinOrderSchema>;
export type LeaveOrderInput = z.infer<typeof leaveOrderSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
export type LineItemRateProposalInput = z.infer<typeof lineItemRateProposalSchema>;
export type ProposeRateInput = z.infer<typeof proposeRateSchema>;
export type ConfirmRateInput = z.infer<typeof confirmRateSchema>;
export type GetMessagesQueryInput = z.infer<typeof getMessagesQuerySchema>;
