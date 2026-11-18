import { z } from 'zod';

export const updateThresholdSchema = z.object({
  productId: z.string().uuid({ message: 'Valid productId is required' }),
  lowStockThreshold: z.number().int().min(0, { message: 'Threshold must be >= 0' }),
  reorderQuantity: z.number().int().min(1, { message: 'Reorder quantity must be >= 1' }).optional(),
});

export const quickRestockSchema = z.object({
  productId: z.string().uuid({ message: 'Valid productId is required' }),
  wholesalerId: z.string().uuid().optional(),
  quantity: z.number().int().min(1, { message: 'Restock quantity must be >= 1' }).optional(),
});

export const batchRestockSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      wholesalerId: z.string().uuid().optional(),
      quantity: z.number().int().min(1),
    })
  ).min(1, { message: 'At least one item required for batch restock' }),
});

export const simulateVelocitySchema = z.object({
  productId: z.string().optional(),
  unitsSoldLast7Days: z.number().int().min(0).optional(),
  currentStock: z.number().int().min(0).optional(),
  reset: z.boolean().optional(),
});

export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type QuickRestockInput = z.infer<typeof quickRestockSchema>;
export type BatchRestockInput = z.infer<typeof batchRestockSchema>;
export type SimulateVelocityInput = z.infer<typeof simulateVelocitySchema>;
