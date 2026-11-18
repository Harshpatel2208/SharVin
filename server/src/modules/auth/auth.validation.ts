import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
  phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{9,14}$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Invalid email address').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12, 'Password must be at least 12 characters').max(72),
  userType: z.enum(['retailer', 'wholesaler']),
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(160),
  // Profile specific fields
  gstNumber: z.string().max(15).optional(),
  storeSize: z.enum(['small', 'medium', 'large']).optional(), // For retailer
  businessCategory: z.string().optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Please provide phone number or email').max(254),
  password: z.string().min(1, 'Password is required').max(72),
});

export const verifyEmailSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
});

export const resendEmailOtpSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

export const verifyOwnerPinSchema = z.object({
  pin: z.string().length(4, 'PIN must be exactly 4 digits').regex(/^\d{4}$/, 'PIN must contain only numbers'),
});

export const updateOwnerPinSchema = z.object({
  currentPin: z.string().length(4, 'Current PIN must be 4 digits'),
  newPin: z.string().length(4, 'New PIN must be 4 digits').regex(/^\d{4}$/, 'New PIN must contain only numbers'),
});

export const createSubAccountSchema = z.object({
  fullName: z.string().min(2, 'Staff name must be at least 2 characters'),
  phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits').max(15),
  email: z.string().email().max(254).optional(),
  roleName: z.enum(['cashier', 'retailer_manager', 'wholesaler_manager', 'godown_manager', 'field_agent']),
  password: z.string().min(12).max(72).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOwnerPinInput = z.infer<typeof verifyOwnerPinSchema>;
export type UpdateOwnerPinInput = z.infer<typeof updateOwnerPinSchema>;
export type CreateSubAccountInput = z.infer<typeof createSubAccountSchema>;

