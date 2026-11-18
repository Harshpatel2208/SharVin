import { z } from 'zod';

export const dispatchOrderSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
  deliveryType: z.enum(['local_driver', 'threePL_shipping']).default('local_driver'),
  driverName: z.string().min(2, { message: 'Driver name must be at least 2 characters' }).optional(),
  driverPhone: z.string().regex(/^[6-9]\d{9}$/, { message: 'Driver phone must be a valid 10-digit Indian mobile number' }).optional(),
  distanceKm: z.number().min(0).optional(),
  trackingMode: z.enum(['local', 'regional']).optional(),
  destinationAddress: z.string().max(300).optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
  threePLProvider: z.string().max(100).optional(),
  threePLTrackingId: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const lineItemInspectionSchema = z.object({
  orderItemId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  orderedQuantity: z.number().int().min(1),
  acceptedQuantity: z.number().int().min(0),
  rejectedQuantity: z.number().int().min(0),
  rejectionReason: z.enum([
    'damaged_packaging',
    'waterlogged_spoilage',
    'expired_product',
    'wrong_specification',
    'short_delivery',
    'other',
  ]).optional(),
  rejectionNotes: z.string().max(500).optional(),
  unitPrice: z.number().min(0),
  lineRejectedAmount: z.number().min(0).optional(),
});

export const verifyHandoverSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
  otpCode: z.string().regex(/^\d{6}$/, { message: 'Delivery OTP must be exactly 6 numeric digits' }),
  damagedQuantity: z.number().int().min(0, { message: 'Damaged quantity cannot be negative' }).optional(),
  notes: z.string().max(500).optional(),
  deliveryProofImageUrl: z.string().optional(),
  lineItemInspections: z.array(lineItemInspectionSchema).max(500).optional(),
  disputeNotes: z.string().max(500).optional(),
});

export const updateDriverLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speed: z.number().optional(),
  accuracy: z.number().optional(),
});

export const updateDriverMilestoneSchema = z.object({
  milestone: z.enum(['dispatched', 'in_transit_hub', 'out_for_delivery', 'delivered']),
  hubName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const driverVerifyOtpSchema = z.object({
  otpCode: z.string().regex(/^\d{6}$/, { message: 'Delivery OTP must be exactly 6 numeric digits' }),
  damagedQuantity: z.number().int().min(0, { message: 'Damaged quantity cannot be negative' }).optional(),
  notes: z.string().max(500).optional(),
  deliveryProofImageUrl: z.string().optional(),
  lineItemInspections: z.array(lineItemInspectionSchema).max(500).optional(),
  disputeNotes: z.string().max(500).optional(),
});

export const resolveDisputeSchema = z.object({
  action: z.enum(['approve_credit_note', 'reject_claim', 'negotiate_allowance']),
  resolutionNotes: z.string().max(500).optional(),
  allowanceAmount: z.number().min(0).optional(),
});

export const getHandoverCodeSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId is required' }),
});

export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;
export type VerifyHandoverInput = z.infer<typeof verifyHandoverSchema>;
export type LineItemInspectionInput = z.infer<typeof lineItemInspectionSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type GetHandoverCodeInput = z.infer<typeof getHandoverCodeSchema>;
export type UpdateDriverLocationInput = z.infer<typeof updateDriverLocationSchema>;
export type UpdateDriverMilestoneInput = z.infer<typeof updateDriverMilestoneSchema>;
export type DriverVerifyOtpInput = z.infer<typeof driverVerifyOtpSchema>;
