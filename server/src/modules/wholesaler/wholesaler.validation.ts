import { z } from 'zod';

export const upsertWholesalerProductSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(2, { message: 'Product name must be at least 2 characters' }).optional(),
  brandName: z.string().optional(),
  barcode: z.string().optional(),
  unitOfMeasure: z.string().default('piece'),
  basePrice: z.number().positive({ message: 'Base price must be positive' }),
  marginFloorPrice: z.number().positive({ message: 'Margin floor price must be positive' }).optional(),
  minimumOrderQuantity: z.number().int().min(1, { message: 'MOQ must be at least 1' }).default(1),
  stockQuantity: z.number().int().min(0, { message: 'Stock quantity cannot be negative' }).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional().nullable(),
  isClearance: z.boolean().default(false),
  clearanceDiscountPercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().default(true),
}).refine((data) => data.productId || data.productName, {
  message: 'Either productId or productName is required',
  path: ['productId'],
});

export const updateWholesalerProductSchema = z.object({
  basePrice: z.number().positive({ message: 'Base price must be positive' }).optional(),
  marginFloorPrice: z.number().positive({ message: 'Margin floor price must be positive' }).optional().nullable(),
  minimumOrderQuantity: z.number().int().min(1, { message: 'MOQ must be at least 1' }).optional(),
  stockQuantity: z.number().int().min(0, { message: 'Stock quantity cannot be negative' }).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  batchNumber: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  isClearance: z.boolean().optional(),
  clearanceDiscountPercent: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const fastInventoryUpdateSchema = z.object({
  stockQuantity: z.number().int().min(0, { message: 'Godown stock cannot be negative' }).optional(),
  basePrice: z.number().positive({ message: 'Base price must be positive' }).optional(),
  marginFloorPrice: z.number().positive({ message: 'Margin floor price must be positive' }).optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  isClearance: z.boolean().optional(),
  clearanceDiscountPercent: z.number().min(0).max(100).optional().nullable(),
});

export const bulkFastInventoryUpdateSchema = z.object({
  updates: z.array(z.object({
    wholesalerProductId: z.string().min(1, { message: 'wholesalerProductId is required' }),
    stockQuantity: z.number().int().min(0).optional(),
    basePrice: z.number().positive().optional(),
    marginFloorPrice: z.number().positive().optional().nullable(),
    batchNumber: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    isClearance: z.boolean().optional(),
    clearanceDiscountPercent: z.number().min(0).max(100).optional().nullable(),
  })).min(1, { message: 'At least one item update must be provided' }),
});

export const searchCatalogQuerySchema = z.object({
  query: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type UpsertWholesalerProductInput = z.infer<typeof upsertWholesalerProductSchema>;
export type UpdateWholesalerProductInput = z.infer<typeof updateWholesalerProductSchema>;
export type FastInventoryUpdateInput = z.infer<typeof fastInventoryUpdateSchema>;
export type BulkFastInventoryUpdateInput = z.infer<typeof bulkFastInventoryUpdateSchema>;
export type SearchCatalogQuery = z.infer<typeof searchCatalogQuerySchema>;

