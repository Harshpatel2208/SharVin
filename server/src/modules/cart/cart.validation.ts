import { z } from 'zod';

export const addToCartSchema = z.object({
  wholesalerId: z.string().uuid({ message: 'Valid wholesalerId is required' }),
  productId: z.string().uuid({ message: 'Valid productId is required' }),
  quantity: z.number().int().min(1, { message: 'Quantity must be at least 1' }),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0, { message: 'Quantity cannot be negative' }),
});

export const submitCartSchema = z.object({
  deliveryMethod: z.enum(['local_driver', 'threePL_shipping']).optional(),
  notes: z.string().optional(),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type SubmitCartInput = z.infer<typeof submitCartSchema>;
