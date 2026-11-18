import { z } from 'zod';

export const upsertProductSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  barcode: z.string().optional(),
  brandName: z.string().optional(),
  unitOfMeasure: z.string().default('piece'),
  costPrice: z.number().min(0, 'Cost price must be non-negative').optional(),
  sellingPrice: z.number().min(0, 'Selling price must be non-negative'),
  initialStock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(1).default(10),
  hasWarranty: z.boolean().default(false),
  warrantyDurationMonths: z.number().int().min(1).optional(),
});

export const saleItemSchema = z.object({
  productId: z.string().min(1, 'Invalid product ID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  discount: z.number().min(0).default(0),
});

export const createSaleSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerAddress: z.string().optional(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'credit']).default('cash'),
  discountAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  items: z.array(saleItemSchema).min(1, 'Bill must have at least one line item'),
});

export type UpsertProductInput = z.infer<typeof upsertProductSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
